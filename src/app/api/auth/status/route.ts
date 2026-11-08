import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const configured = (await prisma.admin.count()) > 0;
    return NextResponse.json({ configured });
  } catch (error) {
    return safeError(error);
  }
}
