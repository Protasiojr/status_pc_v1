import { NextResponse } from "next/server";
import { currentAdmin, requestHasSameOrigin } from "@/lib/auth";
export { requestHasSameOrigin } from "@/lib/auth";

export function apiError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function stringField(value: unknown, max = 191) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : null;
}

export async function requireAdmin(request: Request) {
  if (!requestHasSameOrigin(request)) {
    return { admin: null, response: apiError("Origem inválida.", 403) };
  }
  const admin = await currentAdmin();
  if (!admin) return { admin: null, response: apiError("Autenticação necessária.", 401) };
  return { admin, response: null };
}

export function safeError(error: unknown) {
  console.error("API error:", error);
  return apiError("Não foi possível concluir a operação.", 500);
}
