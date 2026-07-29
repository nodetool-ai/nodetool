/**
 * ScriptPlanner — asks the LLM to author an orchestration script instead of a
 * TaskPlan. The script targets the {@link ScriptRunner} guest API (`agent`,
 * `parallel`, `pipeline`, `log`, `budget`, `inputs`) and is submitted through
 * a single `submit_script` tool so validation failures round-trip as tool
 * results the model can fix.
 *
 * Validation is host-side and cheap: the script must be non-empty, must call
 * `agent(`, and must compile as the body of an async function (syntax check
 * only — nothing is executed).
 */

import type {
  BaseProvider,
  Message,
  ProcessingContext,
  ToolCall
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type { PlanningUpdate, ProcessingMessage } from "@nodetool-ai/protocol";
import { Tool } from "./tools/base-tool.js";
import { linkAbort } from "./utils/link-abort.js";

const log = createLogger("nodetool.agents.script-planner");

const MAX_PLANNER_CALLS = 8;

const PLANNER_SYSTEM_PROMPT = `# Role
You are an orchestration planner. Given an objective, you write ONE JavaScript
script that coordinates sub-agents to accomplish it. You do not do the work
yourself — sub-agents spawned via \`agent()\` do.

# Script API (already defined — do NOT redefine these names)
- \`await agent(prompt, opts?)\` → runs a sub-agent and returns its result.
  - \`prompt\`: self-contained instructions. The sub-agent sees NOTHING else —
    no chat history, no other agents' results. Inline every value it needs.
  - \`opts.schema\`: JSON schema object. When set, the result is a validated
    object matching the schema. Without it, the result is free text.
  - \`opts.tools\`: string[] restricting which tools the sub-agent may use.
  - \`opts.label\`: short display name for progress events.
  - Throws on failure — wrap in try/catch or use \`parallel\`/\`pipeline\`,
    which convert failures to \`null\`.
- \`await parallel(thunks)\` → runs an array of zero-arg async functions
  concurrently, returns their results. A failed thunk yields \`null\`.
- \`await pipeline(items, ...stages)\` → runs each item through all stages
  independently with no barrier between stages. Each stage receives
  \`(prevResult, originalItem, index)\`. A failed item yields \`null\`.
- \`log(message)\` → progress message shown to the user.
- \`budget\` → \`budget.maxAgentCalls\`, \`budget.agentCalls()\`,
  \`budget.remainingCalls()\`, \`await budget.spentUsd()\`.
- \`inputs\` → caller-supplied inputs object.

# Rules
- Plain JavaScript only: no TypeScript annotations, no import/require, no
  top-level function wrapper — write statements directly; top-level \`await\`
  and a final \`return <deliverable>\` are how the script ends.
- The \`return\` value IS the final deliverable. Synthesize it explicitly —
  usually with a final \`agent()\` call that aggregates intermediate results
  (pass them inline in its prompt), constrained by the required schema when
  one is given.
- Default to \`parallel\`/\`pipeline\` for independent work; sequential
  \`await\`s only when a result feeds the next prompt.
- Filter out \`null\`s from parallel/pipeline results before using them.
- Guard loops with \`budget.remainingCalls()\` so the script degrades
  gracefully instead of dying on the call cap.
- Keep it short. The script is coordination logic, not the work itself.

# Submission
Call \`submit_script\` with the complete script. If validation fails, fix the
reported errors and resubmit.`;

const PLANNER_USER_TEMPLATE = `# Objective
{{objective}}

# Inputs available to the script (via \`inputs\`)
{{inputs}}

# Tools sub-agents may use (for \`opts.tools\`)
{{tools}}

# Required final result schema
{{outputSchema}}

Write the orchestration script and submit it via \`submit_script\`.`;

/** Syntax-check a script as an async function body. Never executes it. */
export function validateScript(script: string): string[] {
  const errors: string[] = [];
  if (!script.trim()) {
    errors.push("Script is empty.");
    return errors;
  }
  if (!script.includes("agent(")) {
    errors.push(
      "Script never calls agent() — sub-agents do the work; a script without them accomplishes nothing."
    );
  }
  if (!/\breturn\b/.test(script)) {
    errors.push(
      "Script has no return statement — the return value is the final deliverable."
    );
  }
  try {
    // Compile only: the returned async function is never invoked.
    new Function(`"use strict"; return async () => {\n${script}\n};`);
  } catch (e) {
    errors.push(`Syntax error: ${e instanceof Error ? e.message : String(e)}`);
  }
  return errors;
}

class SubmitScriptTool extends Tool {
  readonly name = "submit_script";
  readonly description =
    "Submit the complete orchestration script. Returns validation errors to fix, or accepts the script.";
  protected override readonly jsonSchema = {
    type: "object" as const,
    properties: {
      script: {
        type: "string",
        description:
          "The full JavaScript orchestration script (statements only, ending in a return)."
      }
    },
    required: ["script"],
    additionalProperties: false
  };

  accepted: string | null = null;

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const script = typeof params.script === "string" ? params.script : "";
    const errors = validateScript(script);
    if (errors.length > 0) {
      return { status: "validation_failed", errors };
    }
    this.accepted = script;
    return { status: "script_accepted" };
  }
}

export interface ScriptPlannerOptions {
  provider: BaseProvider;
  model: string;
  /** Tools the executor will offer sub-agents — listed in the prompt. */
  tools?: Tool[];
  systemPrompt?: string;
  outputSchema?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  threadId?: string;
  /** External cancellation. Aborts the planning provider loop mid-flight. */
  signal?: AbortSignal;
}

export class ScriptPlanner {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly tools: Tool[];
  private readonly callerSystemPrompt?: string;
  private readonly outputSchema?: Record<string, unknown>;
  private readonly inputs: Record<string, unknown>;
  private readonly threadId?: string;
  private readonly signal?: AbortSignal;

  constructor(opts: ScriptPlannerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ?? [];
    this.callerSystemPrompt = opts.systemPrompt;
    this.outputSchema = opts.outputSchema;
    this.inputs = opts.inputs ?? {};
    this.threadId = opts.threadId;
    this.signal = opts.signal;
  }

  /**
   * Plan the orchestration script for `objective`. Yields planning progress
   * messages and returns the accepted script, or null when the model never
   * produced a valid one within the call budget.
   */
  async *plan(
    objective: string,
    context: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, string | null> {
    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: "Writing orchestration script..."
    } satisfies PlanningUpdate;

    const toolsInfo =
      this.tools.length > 0
        ? this.tools
            .map((t) => `- ${t.name}: ${t.description.split("\n")[0]}`)
            .join("\n")
        : "None — sub-agents rely on reasoning only.";
    const userPrompt = PLANNER_USER_TEMPLATE.replace("{{objective}}", objective)
      .replace(
        "{{inputs}}",
        Object.keys(this.inputs).length > 0
          ? JSON.stringify(this.inputs, null, 2)
          : "None."
      )
      .replace("{{tools}}", toolsInfo)
      .replace(
        "{{outputSchema}}",
        this.outputSchema
          ? JSON.stringify(this.outputSchema, null, 2)
          : "None — return whatever shape best answers the objective."
      );

    const systemPrompt = this.callerSystemPrompt
      ? `${this.callerSystemPrompt}\n\n${PLANNER_SYSTEM_PROMPT}`
      : PLANNER_SYSTEM_PROMPT;
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const submitTool = new SubmitScriptTool();
    const abort = new AbortController();
    const unlinkAbort = linkAbort(abort, this.signal);
    const pending: ProcessingMessage[] = [];

    const submitExecute = async (
      args: Record<string, unknown>
    ): Promise<string> => {
      const result = (await Tool.executeTool(
        submitTool,
        context,
        args
      )) as Record<string, unknown>;
      if (result["status"] === "script_accepted") {
        pending.push({
          type: "planning_update",
          phase: "complete",
          status: "success",
          content: `Orchestration script accepted (${submitTool.accepted?.length ?? 0} chars).`
        } satisfies PlanningUpdate);
        abort.abort();
      } else {
        const errors = (result["errors"] as string[]) ?? [];
        pending.push({
          type: "planning_update",
          phase: "validation",
          status: "failed",
          content: `Script validation failed: ${errors.join("; ")}`
        } satisfies PlanningUpdate);
      }
      return JSON.stringify(result);
    };

    const stream = this.provider.generateLoop({
      messages,
      model: this.model,
      tools: [{ ...submitTool.toProviderTool(), execute: submitExecute }],
      toolChoice: "any",
      threadId: this.threadId,
      maxIterations: MAX_PLANNER_CALLS,
      sequentialTools: true,
      signal: abort.signal
    });

    try {
      for await (const item of stream) {
        while (pending.length > 0) yield pending.shift() as ProcessingMessage;
        if ("id" in item && "name" in item && "args" in item) {
          const tc = item as ToolCall;
          if (tc.name === submitTool.name) {
            yield {
              type: "planning_update",
              phase: "generation",
              status: "running",
              content: "Validating submitted script..."
            } satisfies PlanningUpdate;
          }
        }
      }
    } catch (e) {
      // Providers may surface the abort as an error; a captured script means
      // planning succeeded regardless.
      if (!submitTool.accepted) throw e;
      log.debug("Planner stream ended via abort", {
        error: e instanceof Error ? e.message : String(e)
      });
    } finally {
      unlinkAbort();
    }
    while (pending.length > 0) yield pending.shift() as ProcessingMessage;

    if (!submitTool.accepted) {
      yield {
        type: "planning_update",
        phase: "complete",
        status: "failed",
        content: "No valid orchestration script was produced."
      } satisfies PlanningUpdate;
      return null;
    }
    log.info("Orchestration script planned", {
      chars: submitTool.accepted.length
    });
    return submitTool.accepted;
  }
}
