import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { createTaskSchema, taskStateEnum } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const filters: Parameters<typeof repo.listTasks>[0] = {};
    const rawState = sp.get("state");
    if (rawState) {
      const parsed = taskStateEnum.safeParse(rawState);
      if (!parsed.success) {
        return NextResponse.json({ error: `Invalid state: ${rawState}` }, { status: 400 });
      }
      filters.state = parsed.data;
    }
    const plan = sp.get("plan");
    if (plan) filters.planId = plan;
    const assignee = sp.get("assignee");
    if (assignee) filters.assignee = assignee;
    return NextResponse.json(repo.listTasks(filters));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createTaskSchema.parse(await req.json());
    const task = repo.createTask({
      id: input.id,
      planId: input.plan,
      title: input.title,
      assignee: input.assignee ?? null,
      body: input.body,
      estimate: input.estimate ?? null,
      tags: input.tags,
      dependencies: input.dependencies,
      criteria: input.criteria,
      date: input.date,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
