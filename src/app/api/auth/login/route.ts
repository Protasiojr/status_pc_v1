import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminSession, setAdminCookie, verifyPassword } from "@/lib/auth";
import { apiError, readJson, requestHasSameOrigin, safeError, stringField } from "@/lib/api";
import { clearFailedAttempts, isRateLimited, registerFailedAttempt } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return apiError("Origem inválida.", 403);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (isRateLimited("login", ip, 8)) {
    return apiError("Muitas tentativas. Aguarde 15 minutos e tente novamente.", 429);
  }
  const body = await readJson(request);
  const email = stringField(body?.email, 191)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return apiError("E-mail e senha são obrigatórios.");
  try {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      registerFailedAttempt("login", ip, 15 * 60 * 1000);
      return apiError("E-mail ou senha inválidos.", 401);
    }
    clearFailedAttempts("login", ip);
    const session = await createAdminSession(admin.id);
    const response = NextResponse.json({ admin: { email: admin.email } });
    setAdminCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return safeError(error);
  }
}
