import { NextResponse, type NextRequest } from "next/server";
import * as agent from "@/lib/agent";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const priorId = parseInt(id, 10);
    const prior = agent.getSession(priorId);
    if (!prior) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = req.headers.get("content-length") === "0" ? {} : await req.json().catch(() => ({}));
    const session = agent.startSession({
      taskId: prior.taskId,
      model: body.model ?? prior.model ?? undefined,
      baseBranch: body.baseBranch,
      resumeOf: priorId,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
