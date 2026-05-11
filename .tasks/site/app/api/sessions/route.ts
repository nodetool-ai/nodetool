import { NextResponse, type NextRequest } from "next/server";
import * as agent from "@/lib/agent";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const all = agent.listSessions();
    const active = sp.get("active");
    return NextResponse.json(
      active === "true" ? all.filter((s) => !["completed", "failed", "cancelled"].includes(s.status)) : all
    );
  } catch (e) {
    return errorResponse(e);
  }
}
