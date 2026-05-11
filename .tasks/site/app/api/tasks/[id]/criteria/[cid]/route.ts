import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { updateCriterionSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  try {
    const { id, cid } = await params;
    const input = updateCriterionSchema.parse(await req.json());
    repo.updateCriterion(parseInt(cid, 10), input);
    return NextResponse.json(repo.getTask(id));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  try {
    const { id, cid } = await params;
    repo.deleteCriterion(parseInt(cid, 10));
    return NextResponse.json(repo.getTask(id));
  } catch (e) {
    return errorResponse(e);
  }
}
