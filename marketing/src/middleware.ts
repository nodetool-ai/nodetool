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

  const acceptsMarkdown = request.headers
    .get("accept")
    ?.toLowerCase()
    .includes("text/markdown");
  const response = acceptsMarkdown
    ? NextResponse.rewrite(new URL(markdownPath(canonicalPath), request.url))
    : NextResponse.next();
  const canonicalUrl = new URL(canonicalPath, request.url).toString();
  const markdownUrl = new URL(markdownPath(canonicalPath), request.url).toString();
  response.headers.set(
    "Link",
    `<${canonicalUrl}>; rel="canonical", <${markdownUrl}>; rel="alternate"; type="text/markdown"`
  );
  // The response representation changes when an agent requests Markdown.
  // Keep a CDN from returning that cached representation to an HTML request.
  response.headers.set("Vary", "Accept, Accept-Encoding");
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
