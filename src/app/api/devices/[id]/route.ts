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
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const body = await readJson(request);
  if (!body) return apiError("Corpo JSON invalido.");
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const value = stringField(body.name, 191);
    if (!value) return apiError("Nome invalido.");
    data.name = value;
  }
  if (body.description !== undefined) {
    const value = body.description === null || body.description === "" ? null : stringField(body.description, 500);
    if (body.description !== null && body.description !== "" && !value) return apiError("Descricao invalida. Use ate 500 caracteres.");
    data.description = value;
  }
  if (body.color !== undefined) {
    const value = stringField(body.color, 7)?.toUpperCase();
    if (!value || !colorPattern.test(value)) return apiError("Cor invalida. Use o formato hexadecimal #RRGGBB.");
    data.color = value;
  }
  if (body.hostname !== undefined) data.hostname = body.hostname === null ? null : stringField(body.hostname, 191);
  if (body.ip !== undefined) {
    const value = body.ip === null || body.ip === "" ? null : stringField(body.ip, 45);
    if (body.ip !== null && body.ip !== "" && !value) return apiError("Endereco IP invalido.");
    if (value && isIP(value) === 0) return apiError("Endereco IP invalido.");
    data.ip = value;
  }
  if (body.port !== undefined) {
    if (body.port === null || body.port === "") {
      data.port = null;
    } else if (!Number.isInteger(body.port) || (body.port as number) < 1 || (body.port as number) > 65535) {
      return apiError("Porta invalida. Informe um numero entre 1 e 65535.");
    } else {
      data.port = body.port;
    }
  }
  if (body.mac !== undefined) {
    const value = body.mac === null || body.mac === "" ? null : stringField(body.mac, 17)?.toUpperCase();
    if (body.mac !== null && body.mac !== "" && !value) return apiError("Endereco MAC invalido.");
    if (value && !macPattern.test(value)) return apiError("Endereco MAC invalido.");
    data.mac = value;
  }
  if (body.type !== undefined) {
    if (typeof body.type !== "string" || !types.has(body.type as DeviceType)) return apiError("Tipo de dispositivo invalido.");
    data.type = body.type;
  }
  if (body.os !== undefined) data.os = body.os === null ? null : stringField(body.os, 80);
  if (body.osConfidence !== undefined) data.osConfidence = body.osConfidence === null ? null : stringField(body.osConfidence, 16)?.toLowerCase();
  if (body.broadcastAddress !== undefined) {
    const value = body.broadcastAddress === null || body.broadcastAddress === "" ? null : stringField(body.broadcastAddress, 45);
    if (body.broadcastAddress !== null && body.broadcastAddress !== "" && !value) return apiError("Broadcast invalido.");
    if (value && !isPrivateIpv4(value)) return apiError("O broadcast deve ser um IPv4 privado da LAN.");
    data.broadcastAddress = value;
  }
  if (body.wolPort !== undefined) {
    if (!Number.isInteger(body.wolPort) || (body.wolPort as number) < 1 || (body.wolPort as number) > 65535) return apiError("Porta WOL invalida.");
    data.wolPort = body.wolPort;
  }
  if (body.wolEnabled !== undefined) {
    if (typeof body.wolEnabled !== "boolean") return apiError("Configuracao WOL invalida.");
    data.wolEnabled = body.wolEnabled;
  }
  if (body.approved !== undefined) {
    if (typeof body.approved !== "boolean") return apiError("Aprovacao invalida.");
    data.approved = body.approved;
  }
  try {
    const current = await prisma.device.findUnique({ where: { id } });
    if (!current) return apiError("Dispositivo nao encontrado.", 404);
    const nextType = (data.type as DeviceType | undefined) ?? current.type;
    const nextMac = Object.hasOwn(data, "mac") ? (data.mac as string | null) : current.mac;
    const nextBroadcast = Object.hasOwn(data, "broadcastAddress") ? (data.broadcastAddress as string | null) : current.broadcastAddress;
    const nextWol = (data.wolEnabled as boolean | undefined) ?? current.wolEnabled;
    if (nextWol && (nextType !== DeviceType.PC || !nextMac || !nextBroadcast || !isPrivateIpv4(nextBroadcast))) {
      return apiError("WOL exige um PC com MAC e broadcast privados configurados.");
    }
    const device = await prisma.device.update({ where: { id }, data: data as never });
    return NextResponse.json({ device });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") return apiError("Dispositivo nao encontrado.", 404);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return apiError("Ja existe um dispositivo com esse endereco MAC.", 409);
    return safeError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    await prisma.device.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") return apiError("Dispositivo nao encontrado.", 404);
    return safeError(error);
  }
}
