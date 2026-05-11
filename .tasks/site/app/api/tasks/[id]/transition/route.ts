import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { transitionTaskSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = transitionTaskSchema.parse(await req.json());
    return NextResponse.json(
      repo.transitionTask(id, {
        state: input.state as repo.TransitionInput["state"],
        assignee: input.assignee,
        note: input.note,
      })
    );
  } catch (e) {
    return errorResponse(e);
  }
}
