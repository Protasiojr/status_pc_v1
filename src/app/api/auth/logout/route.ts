import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE, clearAdminCookie, sha256 } from "@/lib/auth";
import { safeError } from "@/lib/api";
import { requestHasSameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const token = (await cookies()).get(ADMIN_COOKIE)?.value;
    if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    const response = NextResponse.json({ ok: true });
    clearAdminCookie(response);
    return response;
  } catch (error) {
    return safeError(error);
  }
}
