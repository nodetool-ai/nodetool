import { NextResponse, type NextRequest } from "next/server";

const MARKDOWN_PAGES = new Set([
  "/",
  "/agents",
  "/cloud",
  "/creatives",
  "/developers",
  "/marketing",
  "/pricing",
  "/studio",
]);

function markdownPath(pathname: string): string {
  return pathname === "/" ? "/index.md" : `${pathname}.md`;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const canonicalPath = pathname.endsWith(".md")
    ? pathname.slice(0, -3) || "/"
    : pathname;

  if (!MARKDOWN_PAGES.has(canonicalPath)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const canonicalUrl = new URL(canonicalPath, request.url).toString();
  const markdownUrl = new URL(markdownPath(canonicalPath), request.url).toString();
  response.headers.set(
    "Link",
    `<${canonicalUrl}>; rel="canonical", <${markdownUrl}>; rel="alternate"; type="text/markdown"`
  );
  return response;
}

export const config = {
  matcher: [
    "/",
    "/agents",
    "/cloud",
    "/creatives",
    "/developers",
    "/marketing",
    "/pricing",
    "/studio",
  ],
};
