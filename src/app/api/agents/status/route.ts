import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, safeError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const agent = await prisma.agent.findFirst({ orderBy: { lastSeenAt: "desc" } });
    return NextResponse.json({
      agent: agent
        ? {
            id: agent.id,
            name: agent.name,
            platform: agent.platform,
            lastSeenAt: agent.lastSeenAt,
            connected: Boolean(agent.lastSeenAt && Date.now() - agent.lastSeenAt.getTime() < 90_000),
          }
        : null,
    });
  } catch (error) {
    return safeError(error);
  }
}
