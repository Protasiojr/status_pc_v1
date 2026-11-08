import { DeviceStatus } from "@/generated/prisma/enums";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest } from "@/lib/auth";
import { apiError, readJson, safeError, stringField } from "@/lib/api";

export const runtime = "nodejs";
const macPattern = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

export async function POST(request: Request) {
  try {
    const agent = await agentFromRequest(request);
    if (!agent) return apiError("Token de agente inválido.", 401);
    const body = await readJson(request);
    if (!Array.isArray(body?.devices) || body.devices.length > 4094) return apiError("Lista de estados inválida.");
    let updated = 0;
    for (const item of body.devices) {
      if (!item || typeof item !== "object") continue;
      const data = item as Record<string, unknown>;
      if (typeof data.online !== "boolean") continue;
      const id = stringField(data.id, 30);
      const rawMac = stringField(data.mac, 17);
      const mac = rawMac?.toUpperCase() ?? null;
      const ip = stringField(data.ip, 45);
      if (ip && isIP(ip) === 0) continue;
      if (mac && !macPattern.test(mac)) continue;
      const existing = id
        ? await prisma.device.findFirst({ where: { id, approved: true }, select: { id: true } })
        : mac
          ? await prisma.device.findFirst({ where: { mac, approved: true }, select: { id: true } })
          : ip
            ? await prisma.device.findFirst({ where: { ip, approved: true }, select: { id: true } })
            : null;
      if (!existing) continue;
      try {
        await prisma.$transaction(async (tx) => {
          const current = await tx.device.findUnique({ where: { id: existing.id }, select: { status: true, missedProbes: true } });
          if (!current) return;
          const misses = data.online ? 0 : Math.min(current.missedProbes + 1, 3);
          await tx.device.update({
            where: { id: existing.id },
            data: {
              status: data.online
                ? DeviceStatus.online
                : misses >= 3
                  ? DeviceStatus.offline
                  : current.status,
              missedProbes: misses,
              ...(data.online ? { lastSeenAt: new Date() } : {}),
              ...(ip ? { ip } : {}),
              ...(stringField(data.hostname, 191) ? { hostname: stringField(data.hostname, 191) } : {}),
              ...(stringField(data.os, 80) ? { os: stringField(data.os, 80) } : {}),
              ...(stringField(data.osConfidence, 16) ? { osConfidence: stringField(data.osConfidence, 16) } : {}),
            },
          });
        });
        updated++;
      } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "P2025")) throw error;
      }
    }
    await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
    return NextResponse.json({ updated });
  } catch (error) {
    return safeError(error);
  }
}
