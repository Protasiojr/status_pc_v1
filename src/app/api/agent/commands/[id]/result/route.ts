import { CommandStatus } from "@/generated/prisma/enums";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentFromRequest } from "@/lib/auth";
import { apiError, readJson, safeError, stringField } from "@/lib/api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const agent = await agentFromRequest(request);
    if (!agent) return apiError("Token de agente inválido.", 401);
    const { id } = await context.params;
    const body = await readJson(request);
    if (body?.status !== "success" && body?.status !== "failed") return apiError("Resultado do comando inválido.");
    const command = await prisma.wakeCommand.findFirst({ where: { id, agentId: agent.id, status: CommandStatus.claimed } });
    if (!command) return apiError("Comando não encontrado ou já concluído.", 404);
    const updated = await prisma.wakeCommand.update({
      where: { id },
      data: {
        status: body.status === "success" ? CommandStatus.success : CommandStatus.failed,
        message: stringField(body.message, 500),
        completedAt: new Date(),
      },
    });
    await prisma.agent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
    return NextResponse.json({ command: updated });
  } catch (error) {
    return safeError(error);
  }
}
