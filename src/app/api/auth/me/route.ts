import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { apiError, safeError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await currentAdmin();
    if (!admin) return apiError("Autenticação necessária.", 401);
    return NextResponse.json({ admin: { email: admin.email } });
  } catch (error) {
    return safeError(error);
  }
}
