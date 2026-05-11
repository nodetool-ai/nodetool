import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { addNoteSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = addNoteSchema.parse(await req.json());
    repo.addNote(id, input.author, input.body);
    return NextResponse.json(repo.getTask(id));
  } catch (e) {
    return errorResponse(e);
  }
}
