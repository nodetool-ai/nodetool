import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { updatePlanSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = repo.getPlan(id);
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...plan,
      progress: repo.planProgress(id),
      tasks: repo.listTasks({ planId: id }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const patch = updatePlanSchema.parse(await req.json());
    return NextResponse.json(repo.updatePlan(id, patch));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    repo.deletePlan(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
