import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminSession, createPasswordHash, setAdminCookie } from "@/lib/auth";
import { apiError, readJson, requestHasSameOrigin, safeError, stringField } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return apiError("Origem inválida.", 403);
  const body = await readJson(request);
  const email = stringField(body?.email, 191)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  const setupToken = typeof body?.setupToken === "string" ? body.setupToken : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError("Informe um e-mail válido.");
  if (password.length < 12 || password.length > 200) return apiError("A senha deve ter pelo menos 12 caracteres.");
  const expectedToken = process.env.ADMIN_SETUP_TOKEN ?? "";
  if (expectedToken.length < 32) return apiError("Configure ADMIN_SETUP_TOKEN com pelo menos 32 caracteres antes da configuracao inicial.", 503);
  const providedBytes = Buffer.from(setupToken);
  const expectedBytes = Buffer.from(expectedToken);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return apiError("Chave de configuracao invalida.", 403);
  }

  try {
    if (await prisma.admin.count()) return apiError("A conta administradora já foi configurada.", 409);
    const admin = await prisma.admin.create({
      data: { id: "singleton", email, passwordHash: createPasswordHash(password) },
      select: { id: true, email: true },
    });
    const session = await createAdminSession(admin.id);
    const response = NextResponse.json({ admin: { email: admin.email } }, { status: 201 });
    setAdminCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return apiError("A conta administradora já foi configurada.", 409);
    }
    return safeError(error);
  }
}
