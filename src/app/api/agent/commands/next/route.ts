import { CommandStatus, CommandType } from "@/generated/prisma/enums";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest } from "@/lib/auth";
import { apiError, safeError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const agent = await agentFromRequest(request);
    if (!agent) return apiError("Token de agente inválido.", 401);
    const now = new Date();
    await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt: now } });
    await prisma.wakeCommand.updateMany({
      where: { agentId: agent.id, status: CommandStatus.claimed, claimedAt: { lt: new Date(now.getTime() - 120_000) } },
      data: { status: CommandStatus.pending, agentId: null, claimedAt: null },
    });

    let command = await prisma.wakeCommand.findFirst({
      where: { status: CommandStatus.pending, OR: [{ agentId: agent.id }, { agentId: null }] },
      orderBy: { createdAt: "asc" },
    });

    if (!command && (!agent.lastProbeAt || now.getTime() - agent.lastProbeAt.getTime() >= 30_000)) {
      const claimedSlot = await prisma.agent.updateMany({
        where: { id: agent.id, OR: [{ lastProbeAt: null }, { lastProbeAt: { lte: new Date(now.getTime() - 30_000) } }] },
        data: { lastProbeAt: now },
      });
      if (claimedSlot.count) {
        const devices = await prisma.device.findMany({
          where: { approved: true },
          select: { id: true, ip: true, mac: true },
        });
        if (devices.length) {
          command = await prisma.wakeCommand.create({
            data: {
              type: CommandType.PING_DEVICES,
              agentId: agent.id,
              payload: { devices } as never,
            },
          });
        }
      }
    }

    if (!command) return NextResponse.json({ command: null });
    const claim = await prisma.wakeCommand.updateMany({
      where: { id: command.id, status: CommandStatus.pending },
      data: { status: CommandStatus.claimed, agentId: agent.id, claimedAt: now },
    });
    if (!claim.count) return NextResponse.json({ command: null });
    command = await prisma.wakeCommand.findUnique({ where: { id: command.id } });
    return NextResponse.json({
      command: command
        ? { id: command.id, type: command.type, payload: command.payload, deviceId: command.deviceId }
        : null,
    });
  } catch (error) {
    return safeError(error);
  }
}
