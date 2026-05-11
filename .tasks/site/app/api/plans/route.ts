import { NextResponse, type NextRequest } from "next/server";
import * as repo from "@/lib/repo";
import { createPlanSchema } from "@/lib/validators";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(repo.listPlans());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const input = createPlanSchema.parse(await req.json());
    const plan = repo.createPlan(input);
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
