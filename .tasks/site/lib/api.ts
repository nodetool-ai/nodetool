import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { RepoError } from "./repo";

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: e.issues },
      { status: 400 }
    );
  }
  if (e instanceof RepoError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  const message = e instanceof Error ? e.message : "Internal error";
  return NextResponse.json({ error: message }, { status: 500 });
}
