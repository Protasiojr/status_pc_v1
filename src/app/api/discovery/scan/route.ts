import { CommandType } from "@/generated/prisma/enums";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireAdmin, safeError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const agent = await prisma.agent.findFirst({ orderBy: { lastSeenAt: "desc" } });
    if (!agent?.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() >= 90_000) {
      return apiError("O agente local está desconectado.", 409);
    }
    const command = await prisma.wakeCommand.create({
      data: { type: CommandType.DISCOVER, agentId: agent.id, payload: {} },
    });
    return NextResponse.json({ command }, { status: 202 });
  } catch (error) {
    return safeError(error);
  }
}
