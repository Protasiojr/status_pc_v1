import { DeviceStatus, DeviceType } from "@/generated/prisma/enums";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest } from "@/lib/auth";
import { apiError, readJson, safeError, stringField } from "@/lib/api";

export const runtime = "nodejs";
const macPattern = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const allowedTypes = new Set(Object.values(DeviceType));

export async function POST(request: Request) {
  try {
    const agent = await agentFromRequest(request);
    if (!agent) return apiError("Token de agente inválido.", 401);
    const body = await readJson(request);
    if (!Array.isArray(body?.devices) || body.devices.length > 4094) return apiError("Lista de dispositivos inválida.");
    const discovered = [];
    for (const item of body.devices) {
      if (!item || typeof item !== "object") continue;
      const data = item as Record<string, unknown>;
      const ip = stringField(data.ip, 45);
      if (!ip || isIP(ip) === 0) continue;
      const rawMac = stringField(data.mac, 17);
      const mac = rawMac?.toUpperCase() ?? null;
      if (mac && !macPattern.test(mac)) continue;
      const hostname = stringField(data.hostname, 191);
      const os = stringField(data.os, 80);
      const osConfidence = stringField(data.osConfidence, 16);
      const rawTypeConfidence = stringField(data.typeConfidence, 16)?.toLowerCase();
      const typeConfidence: "low" | "medium" | "high" = rawTypeConfidence === "high" || rawTypeConfidence === "medium"
        ? rawTypeConfidence
        : "low";
      const type = typeof data.type === "string" && allowedTypes.has(data.type as DeviceType)
        ? (data.type as DeviceType)
        : DeviceType.OTHER;
      const now = new Date();
      const existing = (mac ? await prisma.device.findUnique({ where: { mac } }) : null)
        ?? await prisma.device.findFirst({ where: { ip } });
      const device = existing
        ? await prisma.device.update({
            where: { id: existing.id },
            data: {
              ip,
              mac: mac ?? existing.mac,
              hostname: hostname ?? existing.hostname,
              name: existing.approved ? existing.name : (hostname ?? existing.name),
              os: existing.os ?? os,
              osConfidence: existing.osConfidence ?? osConfidence,
              type: existing.approved ? existing.type : type,
              typeConfidence: existing.approved ? existing.typeConfidence : typeConfidence,
              status: DeviceStatus.online,
              missedProbes: 0,
              lastSeenAt: now,
            },
          })
        : await prisma.device.create({
            data: {
              name: hostname ?? mac ?? `Dispositivo ${ip}`,
              hostname,
              ip,
              mac,
              type,
              typeConfidence,
              os,
              osConfidence,
              status: DeviceStatus.online,
              missedProbes: 0,
              lastSeenAt: now,
              approved: false,
            },
          });
      discovered.push(device);
    }
    await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
    return NextResponse.json({ devices: discovered });
  } catch (error) {
    return safeError(error);
  }
}
