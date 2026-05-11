import { NextResponse, type NextRequest } from "next/server";
import * as agent from "@/lib/agent";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = agent.getSession(parseInt(id, 10));
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const events = agent.getSessionEvents(session.id);
    return NextResponse.json({ ...session, events, live: agent.isLive(session.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
