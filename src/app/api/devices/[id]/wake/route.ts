import { CommandType, DeviceType } from "@/generated/prisma/enums";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireAdmin, safeError } from "@/lib/api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

function isPrivateIpv4(value: string) {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export async function POST(request: Request, context: Context) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const [device, agent] = await Promise.all([
      prisma.device.findUnique({ where: { id } }),
      prisma.agent.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    ]);
    if (!device || !device.approved) return apiError("Dispositivo nao encontrado.", 404);
    if (device.type !== DeviceType.PC) return apiError("Wake-on-LAN esta disponivel somente para PCs.", 422);
    if (!device.wolEnabled || !device.mac || !device.broadcastAddress || !isPrivateIpv4(device.broadcastAddress)) {
      return apiError("Configure MAC, broadcast privado e Wake-on-LAN no dispositivo.", 422);
    }
    if (!agent?.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() >= 90_000) return apiError("O agente local esta desconectado.", 409);
    const command = await prisma.wakeCommand.create({
      data: {
        type: CommandType.WOL,
        status: "pending",
        agentId: agent.id,
        deviceId: device.id,
        payload: {
          deviceId: device.id,
          mac: device.mac,
          broadcastAddress: device.broadcastAddress,
          port: device.wolPort,
        },
      },
    });
    return NextResponse.json({ command }, { status: 202 });
  } catch (error) {
    return safeError(error);
  }
}
