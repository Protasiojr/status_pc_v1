import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, readJson, safeError, stringField } from "@/lib/api";
import { sha256 } from "@/lib/auth";
import { clearFailedAttempts, isRateLimited, registerFailedAttempt } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (isRateLimited("agent-pair", key, 10)) {
    return apiError("Muitas tentativas de pareamento. Tente novamente mais tarde.", 429);
  }
  const body = await readJson(request);
  const code = stringField(body?.code, 32)?.toUpperCase();
  const name = stringField(body?.name, 120);
  const platform = stringField(body?.platform, 32)?.toLowerCase();
  if (!code || !name || !platform) return apiError("Código, nome e plataforma são obrigatórios.");
  if (!["windows", "linux"].includes(platform)) return apiError("Plataforma do agente não suportada.");
  try {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const agent = await prisma.$transaction(async (tx) => {
      const pairing = await tx.pairingCode.findUnique({ where: { codeHash: sha256(code) } });
      if (!pairing || pairing.usedAt || pairing.expiresAt <= now) return null;
      const consumed = await tx.pairingCode.updateMany({
        where: { id: pairing.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!consumed.count) return null;
      await tx.agent.deleteMany();
      return tx.agent.create({
        data: { name, platform, tokenHash: sha256(token), lastSeenAt: now },
        select: { id: true, name: true, platform: true },
      });
    });
    if (!agent) {
      registerFailedAttempt("agent-pair", key, 15 * 60 * 1000);
      return apiError("Código inválido, expirado ou já utilizado.", 401);
    }
    clearFailedAttempts("agent-pair", key);
    return NextResponse.json({ agentId: agent.id, agentToken: token }, { status: 201 });
  } catch (error) {
    return safeError(error);
  }
}
