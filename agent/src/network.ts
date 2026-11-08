import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import { promisify } from "node:util";
import os from "node:os";
import { createConnection } from "node:net";
import { DeviceCandidate, KnownDevice, Platform, StatusReport } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_HOSTS = 4094;
const SCAN_CONCURRENCY = 48;
const TCP_FINGERPRINT_PORTS = [22, 53, 80, 135, 139, 443, 445, 631, 2049, 3389, 5555, 62078, 8080, 8443];

interface Ipv4Interface {
  address: string;
  netmask: string;
}

function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`Endereço IPv4 inválido: ${ip}`);
  }
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  return (
    (value >>> 24) === 10 ||
    (value >>> 20) === 0xac0 ||
    (value >>> 16) === 0xc0a8
  );
}

function prefixFromMask(netmask: string): number {
  const mask = ipv4ToNumber(netmask);
  const binary = mask.toString(2).padStart(32, "0");
  if (!/^1*0*$/.test(binary)) throw new Error(`Máscara inválida: ${netmask}`);
  return binary.indexOf("0") === -1 ? 32 : binary.indexOf("0");
}

function parseCidr(cidr: string): { network: number; prefix: number; count: number } {
  const [ip, prefixText, extra] = cidr.split("/");
  if (!ip || !prefixText || extra !== undefined) throw new Error("CIDR inválido.");
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error("Prefixo CIDR inválido.");
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const address = ipv4ToNumber(ip);
  const network = (address & mask) >>> 0;
  const count = prefix >= 31 ? 0 : 2 ** (32 - prefix) - 2;
  if (!isPrivateIpv4(ip) || !isPrivateIpv4(numberToIpv4(network))) {
    throw new Error("A varredura é permitida somente em sub-redes IPv4 privadas RFC1918.");
  }
  if (count < 1 || count > MAX_HOSTS) {
    throw new Error(`A sub-rede excede o limite de ${MAX_HOSTS} hosts varridos.`);
  }
  return { network, prefix, count };
}

function getLocalSubnets(): string[] {
  const results = new Set<string>();
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal || !isPrivateIpv4(address.address)) continue;
      try {
        const prefix = prefixFromMask(address.netmask);
        const cidr = `${address.address}/${prefix}`;
        parseCidr(cidr);
        results.add(cidr);
      } catch {
        // Interfaces VPN/virtuais grandes demais são ignoradas pela proteção de tamanho.
      }
    }
  }
  return [...results];
}

async function ping(ip: string): Promise<{ online: boolean; ttl?: number }> {
  const windows = process.platform === "win32";
  const args = windows ? ["-n", "1", "-w", "900", ip] : ["-c", "1", "-W", "1", ip];
  try {
    const { stdout, stderr } = await execFileAsync("ping", args, { timeout: 1800, windowsHide: true });
    const output = `${stdout}\n${stderr}`;
    const ttl = output.match(/ttl\s*[=:]\s*(\d+)/i)?.[1];
    return { online: true, ttl: ttl ? Number(ttl) : undefined };
  } catch (error) {
    const maybeOutput = error as { stdout?: string; stderr?: string };
    const output = `${maybeOutput.stdout ?? ""}\n${maybeOutput.stderr ?? ""}`;
    const ttl = output.match(/ttl\s*[=:]\s*(\d+)/i)?.[1];
    return { online: Boolean(ttl), ttl: ttl ? Number(ttl) : undefined };
  }
}

function probeTcpPort(ip: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(350, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function fingerprintPorts(ip: string): Promise<Set<number>> {
  const results = await Promise.all(TCP_FINGERPRINT_PORTS.map(async (port) =>
    (await probeTcpPort(ip, port)) ? port : null,
  ));
  return new Set(results.filter((port): port is number => port !== null));
}

async function getDefaultGateways(): Promise<Set<string>> {
  try {
    const { stdout } = process.platform === "win32"
      ? await execFileAsync("route", ["print", "-4"], { timeout: 3000, windowsHide: true })
      : await execFileAsync("ip", ["-4", "route", "show", "default"], { timeout: 3000, windowsHide: true });
    const matches = process.platform === "win32"
      ? [...stdout.matchAll(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})\s+/gm)].map((match) => match[1])
      : [...stdout.matchAll(/(?:^|\s)default\s+via\s+(\d{1,3}(?:\.\d{1,3}){3})(?:\s|$)/gm)].map((match) => match[1]);
    return new Set(matches.filter((ip) => isPrivateIpv4(ip)));
  } catch {
    return new Set();
  }
}

function inferOs(
  ttl: number | undefined,
  ports: Set<number>,
  isGateway: boolean,
  isMobile: boolean,
  hostname: string | null,
): Pick<DeviceCandidate, "os" | "osConfidence"> {
  if (ports.has(3389) || ports.has(445) || (ports.has(135) && ports.has(139))) {
    return { os: "WINDOWS", osConfidence: ports.has(445) && ports.has(3389) ? "high" : "medium" };
  }
  const host = (hostname ?? "").toLowerCase();
  const looksLikeNetworkGear = isGateway || /(router|roteador|gateway|modem|\bont\b|\bonu\b|mikrotik|ubiquiti|tp[- ]?link|openwrt|fritz|unifi)/i.test(host);
  if (!isMobile && !looksLikeNetworkGear && (ports.has(22) || ports.has(631) || ports.has(2049))) {
    return { os: "LINUX", osConfidence: ports.has(22) && ttl !== undefined && ttl <= 64 ? "medium" : "low" };
  }
  // TTL alone also matches routers, phones and other operating systems.
  if (!isGateway && !isMobile && !looksLikeNetworkGear && ttl !== undefined && ttl > 64 && ttl <= 128) {
    return { os: "WINDOWS", osConfidence: "low" };
  }
  return { os: null, osConfidence: null };
}

function inferDeviceType(
  hostname: string | null,
  ports: Set<number>,
  isGateway: boolean,
  os: Pick<DeviceCandidate, "os" | "osConfidence">,
): Pick<DeviceCandidate, "type" | "typeConfidence"> {
  const host = (hostname ?? "").toLowerCase();
  if (/(iphone|ipad|android|pixel[- ]?\d|galaxy[- ]?(s|a|z|note)|oneplus|xiaomi|redmi|motorola|\bphone\b|\bmobile\b)/i.test(host)) {
    return { type: "MOBILE", typeConfidence: "medium" };
  }
  if (/(modem|\bont\b|\bonu\b|docsis|cable[- ]?modem)/i.test(host)) {
    return { type: "MODEM", typeConfidence: "medium" };
  }
  if (isGateway) return { type: "ROUTER", typeConfidence: "high" };
  if (/(router|roteador|gateway|access[- ]?point|mikrotik|ubiquiti|tp[- ]?link|tplink|openwrt|dd[- ]?wrt|fritz|keenetic|unifi|deco|mesh)/i.test(host)) {
    return { type: "ROUTER", typeConfidence: "medium" };
  }
  if (ports.has(3389) || ports.has(445) || (ports.has(135) && ports.has(139))) {
    return { type: "PC", typeConfidence: ports.has(445) && ports.has(3389) ? "high" : "medium" };
  }
  if (ports.has(22)) {
    return { type: "PC", typeConfidence: "medium" };
  }
  if (os.os && os.osConfidence !== "low") return { type: "PC", typeConfidence: "low" };
  return { type: "OTHER", typeConfidence: "low" };
}

async function readArpTable(): Promise<Map<string, string>> {
  try {
    const { stdout } = await execFileAsync(process.platform === "win32" ? "arp" : "arp", ["-a"], {
      timeout: 3000,
      windowsHide: true,
    });
    const found = new Map<string, string>();
    for (const line of stdout.split(/\r?\n/)) {
      const ip = line.match(/(?:\(|\s)(\d{1,3}(?:\.\d{1,3}){3})(?:\)|\s)/)?.[1];
      const mac = line.match(/(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i)?.[0]?.replaceAll("-", ":").toUpperCase();
      if (ip && mac && mac !== "FF:FF:FF:FF:FF:FF") found.set(ip, mac);
    }
    return found;
  } catch {
    return new Map();
  }
}

async function reverseHostname(ip: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 800);
    dns.reverse(ip).then(([hostname]) => {
      clearTimeout(timeout);
      resolve(hostname || null);
    }).catch(() => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

function hostsForCidr(cidr: string): string[] {
  const { network, count } = parseCidr(cidr);
  return Array.from({ length: count }, (_, index) => numberToIpv4((network + index + 1) >>> 0));
}

export async function discoverDevices(cidr?: string): Promise<DeviceCandidate[]> {
  const localSubnets = getLocalSubnets();
  if (cidr) {
    const requested = parseCidr(cidr);
    const isAttachedLan = localSubnets.some((localCidr) => {
      const local = parseCidr(localCidr);
      return local.network === requested.network && local.prefix === requested.prefix;
    });
    if (!isAttachedLan) throw new Error("A varredura aceita somente uma sub-rede privada conectada diretamente ao host do agente.");
  }
  const subnets = cidr ? [cidr] : localSubnets;
  if (subnets.length === 0) throw new Error("Nenhuma interface IPv4 privada elegível foi encontrada.");

  const candidates = new Map<string, DeviceCandidate>();
  const gateways = await getDefaultGateways();
  for (const subnet of subnets) {
    const hosts = hostsForCidr(subnet);
    const responses = await mapConcurrent(hosts, SCAN_CONCURRENCY, async (ip) => ({ ip, ...(await ping(ip)) }));
    const arp = await readArpTable();
    const onlineResponses = responses.filter((response) => response.online);
    const resolved = await mapConcurrent(onlineResponses, SCAN_CONCURRENCY, async (response) => {
      const [hostname, ports] = await Promise.all([
        reverseHostname(response.ip),
        fingerprintPorts(response.ip),
      ]);
      return { response, hostname, ports };
    });
    for (const { response, hostname, ports } of resolved) {
      const isGateway = gateways.has(response.ip);
      const isMobile = /(iphone|ipad|android|pixel|galaxy|oneplus|xiaomi|redmi|motorola|phone|mobile)/i.test(hostname ?? "");
      const osGuess = inferOs(response.ttl, ports, isGateway, isMobile, hostname);
      const typeGuess = inferDeviceType(hostname, ports, isGateway, osGuess);
      candidates.set(response.ip, {
        hostname,
        ip: response.ip,
        mac: arp.get(response.ip) ?? null,
        ...osGuess,
        ...typeGuess,
      });
    }
  }
  return [...candidates.values()];
}

export async function checkKnownDevices(devices: KnownDevice[]): Promise<StatusReport[]> {
  return mapConcurrent(devices, SCAN_CONCURRENCY, async (device) => {
    const response = await ping(device.ip);
    const osGuess = inferOs(response.ttl);
    return {
      ...(device.id || device.deviceId ? { id: device.id || device.deviceId } : {}),
      mac: device.mac,
      ip: device.ip,
      online: response.online,
      ...(device.hostname ? { hostname: device.hostname } : {}),
      ...(osGuess.os ? { os: osGuess.os } : device.os ? { os: device.os } : {}),
    ...(osGuess.osConfidence ? { osConfidence: osGuess.osConfidence } : {}),
    };
  });
}

export function currentPlatform(): Platform {
  if (process.platform === "win32") return "windows";
  if (process.platform === "linux") return "linux";
  throw new Error("O agente oferece suporte somente a Windows e Linux.");
}
