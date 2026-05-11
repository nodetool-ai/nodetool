import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { updateTaskSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = repo.getTask(id);
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(task);
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
    const patch = updateTaskSchema.parse(await req.json());
    return NextResponse.json(repo.updateTask(id, patch));
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
    repo.deleteTask(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
