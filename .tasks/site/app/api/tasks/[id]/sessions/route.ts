import { NextResponse, type NextRequest } from "next/server";
import * as agent from "@/lib/agent";
import { startSessionSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    return NextResponse.json(agent.listSessions(id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = req.headers.get("content-length") === "0" ? {} : await req.json().catch(() => ({}));
    const input = startSessionSchema.parse(body);
    const session = agent.startSession({
      taskId: id,
      model: input.model,
      baseBranch: input.baseBranch,
      resumeOf: input.resumeOf,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
