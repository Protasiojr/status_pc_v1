import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, requireAdmin, safeError } from "@/lib/api";
import { sha256 } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    await prisma.pairingCode.deleteMany();
    const code = randomBytes(8).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.pairingCode.create({ data: { codeHash: sha256(code), expiresAt } });
    return NextResponse.json({ code, expiresAt }, { status: 201 });
  } catch (error) {
    return safeError(error);
  }
}
