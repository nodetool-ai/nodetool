import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const TOKEN = process.env.NODETOOL_TASKS_TOKEN;
  if (!TOKEN) {
    return NextResponse.json(
      { error: "Auth disabled (NODETOOL_TASKS_TOKEN is unset)" },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => ({}));
  if (body?.token !== TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("nodetool_tasks_token", TOKEN, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
