import dgram from "node:dgram";

function normalizeMac(mac: string): Buffer {
  const clean = mac.replace(/[^0-9a-f]/gi, "");
  if (!/^[0-9a-f]{12}$/i.test(clean)) throw new Error("MAC inválido; use um endereço de 6 bytes.");
  return Buffer.from(clean, "hex");
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

export async function sendMagicPacket(mac: string, broadcastAddress: string, port = 9): Promise<void> {
  const macBytes = normalizeMac(mac);
  if (!isPrivateIpv4(broadcastAddress)) throw new Error("O broadcast WOL deve ser um IPv4 privado da LAN.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Porta WOL inválida.");
  const packet = Buffer.alloc(6 + 16 * macBytes.length, 0xff);
  for (let offset = 6; offset < packet.length; offset += macBytes.length) {
    macBytes.copy(packet, offset);
  }

  await new Promise<void>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", (error) => {
      socket.close();
      reject(error);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, port, broadcastAddress, (error) => {
        socket.close();
        if (error) reject(error);
        else resolve();
      });
    });
  });
}
