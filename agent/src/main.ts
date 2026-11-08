import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.js";
import { readConfig } from "./config.js";
import { checkKnownDevices, currentPlatform, discoverDevices } from "./network.js";
import { sendMagicPacket } from "./wol.js";
import { AgentCommand, KnownDevice } from "./types.js";

const config = readConfig();
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const tokenFile = path.resolve(runtimeDir, "..", ".data", "agent-token");
let token = config.agentToken;

async function loadStoredToken(): Promise<string | undefined> {
  try {
    return (await readFile(tokenFile, "utf8")).trim() || undefined;
  } catch {
    return undefined;
  }
}

async function saveToken(value: string): Promise<void> {
  await mkdir(path.dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") await chmod(tokenFile, 0o600);
}

async function getToken(): Promise<string> {
  if (token) return token;
  token = await loadStoredToken();
  if (token) return token;
  if (!config.pairingCode) {
    throw new Error("Defina PAIRING_CODE no primeiro uso ou forneça AGENT_TOKEN após o pareamento.");
  }
  const api = createApi(config.apiBaseUrl, () => token ?? "");
  const pair = await api.pair(config.pairingCode, config.agentName, currentPlatform());
  if (!pair.agentToken) throw new Error("O servidor não retornou um token de agente.");
  token = pair.agentToken;
  await saveToken(token);
  delete process.env.PAIRING_CODE;
  console.log(`Agente pareado (ID ${pair.agentId}); token salvo em ${tokenFile}.`);
  return token;
}

const api = createApi(config.apiBaseUrl, () => token ?? "");

function getDevices(payload: unknown): KnownDevice[] {
  if (!payload || typeof payload !== "object") return [];
  const devices = (payload as { devices?: unknown }).devices;
  if (!Array.isArray(devices)) return [];
  return devices.filter((device): device is KnownDevice =>
    Boolean(device && typeof device === "object" && typeof (device as KnownDevice).ip === "string"),
  );
}

async function processCommand(command: AgentCommand): Promise<void> {
  try {
    switch (command.type) {
      case "DISCOVER": {
        const devices = await discoverDevices(command.payload?.cidr);
        await api.reportDiscovery(devices);
        await api.reportCommand(command.id, "success", `${devices.length} dispositivos encontrados.`);
        return;
      }
      case "PING_DEVICES": {
        const devices = await checkKnownDevices(getDevices(command.payload));
        await api.reportStatus(devices);
        await api.reportCommand(command.id, "success", `${devices.length} estados verificados.`);
        return;
      }
      case "WOL": {
        await sendMagicPacket(
          command.payload.mac,
          command.payload.broadcastAddress,
          command.payload.port ?? 9,
        );
        await api.reportCommand(command.id, "success", "Pacote Wake-on-LAN enviado.");
        return;
      }
      default: {
        const unsupported = command as { id: number | string; type: string };
        await api.reportCommand(unsupported.id, "failed", `Comando não suportado: ${unsupported.type}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar comando.";
    console.error(`Comando ${command.id} (${command.type}) falhou: ${message}`);
    await api.reportCommand(command.id, "failed", message.slice(0, 500)).catch((reportError) => {
      console.error("Não foi possível reportar a falha:", reportError);
    });
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  await getToken();
  console.log(`Status PC Agent iniciado em ${currentPlatform()} (${config.agentName}).`);
  let lastHeartbeat = 0;
  let stopped = false;
  process.once("SIGINT", () => { stopped = true; });
  process.once("SIGTERM", () => { stopped = true; });

  while (!stopped) {
    try {
      if (Date.now() - lastHeartbeat >= 30000) {
        await api.heartbeat();
        lastHeartbeat = Date.now();
      }
      const command = await api.nextCommand();
      if (command) await processCommand(command);
      else await sleep(config.pollIntervalMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha de comunicação com o servidor.";
      console.error(`Servidor indisponível: ${message}`);
      await sleep(Math.max(config.pollIntervalMs, 5000));
    }
  }
  console.log("Agente encerrado.");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
