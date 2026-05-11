import { NextRequest, NextResponse } from "next/server";

// Optional bearer-token gate. When NODETOOL_TASKS_TOKEN is set, every route
// requires either a matching `Authorization: Bearer <token>` header (for CLI
// / API clients) or the `nodetool_tasks_token` cookie (set via /login).
// When unset, the site is open — the original local-only default.

const TOKEN = process.env.NODETOOL_TASKS_TOKEN;
const COOKIE = "nodetool_tasks_token";

function authorized(req: NextRequest): boolean {
  if (!TOKEN) return true;
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ") && header.slice(7) === TOKEN) return true;
  return req.cookies.get(COOKIE)?.value === TOKEN;
}

export function middleware(req: NextRequest) {
  if (!TOKEN) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (
    path === "/login" ||
    path === "/api/auth/login" ||
    path === "/api/auth/logout"
  ) {
    return NextResponse.next();
  }

  if (authorized(req)) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
