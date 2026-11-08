import { DeviceType } from "@/generated/prisma/enums";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJson, requireAdmin, safeError, stringField } from "@/lib/api";

export const runtime = "nodejs";
const types = new Set(Object.values(DeviceType));
const macPattern = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const colorPattern = /^#[0-9a-f]{6}$/i;

function isPrivateIpv4(value: string) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const devices = await prisma.device.findMany({ orderBy: [{ approved: "asc" }, { name: "asc" }] });
    return NextResponse.json({ devices });
  } catch (error) {
    return safeError(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return apiError("Corpo JSON invalido.");
  const name = stringField(body?.name, 191);
  if (body?.type !== undefined && (typeof body.type !== "string" || !types.has(body.type as DeviceType))) return apiError("Tipo de dispositivo invalido.");
  const type = typeof body?.type === "string" ? (body.type as DeviceType) : DeviceType.OTHER;
  const ip = body?.ip === null || body?.ip === "" ? null : stringField(body?.ip, 45);
  const mac = body?.mac === null || body?.mac === "" ? null : stringField(body?.mac, 17)?.toUpperCase();
  const description = body.description === null || body.description === "" ? null : stringField(body.description, 500);
  const color = body.color === undefined ? "#246BFD" : stringField(body.color, 7)?.toUpperCase();
  const port = body.port === undefined || body.port === null || body.port === "" ? null : body.port;
  const broadcastAddress = body?.broadcastAddress ? stringField(body.broadcastAddress, 45) : null;
  const wolEnabled = body?.wolEnabled === true;
  const wolPort = body?.wolPort === undefined ? 9 : body.wolPort;
  if (!name) return apiError("Informe o nome do dispositivo.");
  if (body.description !== undefined && body.description !== null && body.description !== "" && !description) return apiError("Descricao invalida. Use ate 500 caracteres.");
  if (!color || !colorPattern.test(color)) return apiError("Cor invalida. Use o formato hexadecimal #RRGGBB.");
  if (port !== null && (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535)) return apiError("Porta invalida. Informe um numero entre 1 e 65535.");
  if (body?.ip !== undefined && body.ip !== null && body.ip !== "" && !ip) return apiError("Endereco IP invalido.");
  if (ip && isIP(ip) === 0) return apiError("Endereco IP invalido.");
  if (body?.mac !== undefined && body.mac !== null && body.mac !== "" && !mac) return apiError("Endereco MAC invalido.");
  if (mac && !macPattern.test(mac)) return apiError("Endereco MAC invalido.");
  if (body?.broadcastAddress !== undefined && body.broadcastAddress !== null && body.broadcastAddress !== "" && !broadcastAddress) return apiError("Broadcast invalido.");
  if (broadcastAddress && !isPrivateIpv4(broadcastAddress)) return apiError("O broadcast deve ser um IPv4 privado da LAN.");
  if (body?.wolEnabled !== undefined && typeof body.wolEnabled !== "boolean") return apiError("Configuracao WOL invalida.");
  if (wolEnabled && (type !== DeviceType.PC || !mac || !broadcastAddress)) return apiError("WOL exige um PC com MAC e broadcast privados configurados.");
  if (!Number.isInteger(wolPort) || (wolPort as number) < 1 || (wolPort as number) > 65535) return apiError("Porta WOL invalida.");
  try {
    const device = await prisma.device.create({
      data: {
        name,
        description,
        color,
        hostname: stringField(body?.hostname, 191),
        ip,
        port: port as number | null,
        mac,
        type,
        os: stringField(body?.os, 80),
        osConfidence: stringField(body?.osConfidence, 16)?.toLowerCase(),
        broadcastAddress,
        wolEnabled,
        wolPort: wolPort as number,
        approved: true,
      },
    });
    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return apiError("Ja existe um dispositivo com esse endereco MAC.", 409);
    }
    return safeError(error);
  }
}
