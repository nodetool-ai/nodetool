import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/run-workflow";
import type { WorkflowDefinition } from "@/lib/run-workflow";
import formatTextWorkflow from "@/workflows/format-text.json";
import compareNumbersWorkflow from "@/workflows/compare-numbers.json";

const WORKFLOWS: Record<string, WorkflowDefinition> = {
  "format-text": formatTextWorkflow as WorkflowDefinition,
  "compare-numbers": compareNumbersWorkflow as WorkflowDefinition,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      workflow: string;
      params: Record<string, unknown>;
    };

    const { workflow, params } = body;

    if (!workflow || !WORKFLOWS[workflow]) {
      return NextResponse.json(
        { error: `Unknown workflow: ${workflow}. Available: ${Object.keys(WORKFLOWS).join(", ")}` },
        { status: 400 }
      );
    }

    const definition = WORKFLOWS[workflow];
    const result = await runWorkflow(definition, params ?? {});

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[run-workflow] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
