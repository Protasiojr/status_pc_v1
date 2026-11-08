import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest } from "@/lib/auth";
import { apiError, safeError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const agent = await agentFromRequest(request);
    if (!agent) return apiError("Token de agente inválido.", 401);
    const lastSeenAt = new Date();
    await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt } });
    return NextResponse.json({ ok: true, lastSeenAt });
  } catch (error) {
    return safeError(error);
  }
}
