/**
 * `run_subtask` — the primitive that lets an agent decompose work recursively.
 *
 * The agent calls this tool when it judges that a piece of work warrants a
 * focused sub-execution. The tool spins up a child agent (in "loop" mode)
 * with a subset of the parent's toolset and runs it to completion. Child
 * events are forwarded upward so the UI can stream them; each forwarded
 * event carries `parent_tool_call_id` so the renderer can nest cards.
 *
 * Recursion is bounded by {@link RunSubtaskToolOptions.maxDepth} (default 3).
 * Tracking lives on `ProcessingContext` via {@link SUBTASK_DEPTH_KEY}; each
 * subtask copies the parent context and increments the counter.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";
import { StepExecutor } from "../step-executor.js";
import type { Step, Task } from "../types.js";

/** Context variable carrying the current subtask depth (0 at the chat root). */
export const SUBTASK_DEPTH_KEY = "__subtask_depth";

/** Reserved input-schema field StepExecutor sets to the LLM-provided tool_call_id. */
export const TOOL_CALL_ID_FIELD = "_tool_call_id";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_ITERATIONS = 20;

export type ForwardMessage = (msg: ProcessingMessage) => Promise<void> | void;

export interface RunSubtaskToolOptions {
  provider: BaseProvider;
  model: string;
  /**
   * Snapshot of the parent's toolset. Called lazily on each invocation so a
   * dynamically-mutated toolbelt is observed.
   */
  parentTools: () => Tool[];
  /**
   * Forwards child agent events upward to the websocket sender. Events are
   * tagged with `parent_tool_call_id` (and `subtask_depth`) before being
   * passed in.
   */
  forwardMessage: ForwardMessage;
  /** Maximum recursion depth. Defaults to 3. */
  maxDepth?: number;
  /** Max LLM iterations per child loop. Defaults to 20. */
  maxIterations?: number;
}

const RUN_SUBTASK_DESCRIPTION = [
  "Spawn a focused subtask handled by a fresh agent loop. Modeled on Claude",
  "Code's Task tool: the subtask returns the subagent's final assistant",
  "message as plain text.",
  "",
  "Call this when work warrants its own focused execution — research a",
  "question end-to-end, perform a multi-step transformation, draft a",
  "self-contained artifact. Emit multiple `run_subtask` calls in one turn",
  "to run independent subtasks concurrently. Subtasks can themselves call",
  "`run_subtask` up to the recursion depth limit.",
  "",
  "The subtask inherits the parent's full toolset. If you need a specific",
  "output shape (e.g. JSON), say so inside `instructions` — do not request a",
  "schema here. The subagent will write the result; you'll receive that",
  "text verbatim and can quote or parse it."
].join("\n");

export class RunSubtaskTool extends Tool {
  readonly name = "run_subtask";
  readonly description = RUN_SUBTASK_DESCRIPTION;
  readonly inputSchema = {
    type: "object",
    properties: {
      description: {
        type: "string",
        description:
          "Short user-facing label for the subtask (3-7 words). Shown in the UI card."
      },
      prompt: {
        type: "string",
        description:
          "Full task description for the subagent. Self-contained — the subagent does not see the parent's chat history. If you need a structured response, say so here (e.g. \"reply as JSON with fields x, y, z\")."
      }
    },
    required: ["description", "prompt"],
    additionalProperties: false
  };

  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly parentToolsFn: () => Tool[];
  private readonly forward: ForwardMessage;
  private readonly maxDepth: number;
  private readonly maxIterations: number;

  constructor(opts: RunSubtaskToolOptions) {
    super();
    this.provider = opts.provider;
    this.model = opts.model;
    this.parentToolsFn = opts.parentTools;
    this.forward = opts.forwardMessage;
    this.maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  userMessage(params: Record<string, unknown>): string {
    const desc =
      typeof params.description === "string" ? params.description.trim() : "";
    return desc ? `Running subtask: ${desc}` : "Running subtask";
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const currentDepth = context.get<number>(SUBTASK_DEPTH_KEY) ?? 0;
    if (currentDepth >= this.maxDepth) {
      return {
        error: "max_recursion_depth_reached",
        depth: currentDepth,
        max_depth: this.maxDepth,
        message:
          "Cannot spawn another subtask — recursion depth limit reached. Answer directly using the tools already available at this level."
      };
    }

    const description =
      typeof params.description === "string" ? params.description.trim() : "";
    const prompt =
      typeof params.prompt === "string" ? params.prompt.trim() : "";
    if (!prompt) {
      return {
        error: "missing_prompt",
        message: "`prompt` is required and must be a non-empty string."
      };
    }

    const parentToolCallId =
      typeof params[TOOL_CALL_ID_FIELD] === "string"
        ? (params[TOOL_CALL_ID_FIELD] as string)
        : null;
    const childDepth = currentDepth + 1;

    const childTools = this.buildChildToolset();

    // Child context with bumped depth. Copy preserves _onMessage (telemetry
    // listener) and clones variables so depth mutations stay local.
    const childCtx = context.copy();
    childCtx.set(SUBTASK_DEPTH_KEY, childDepth);

    // Subtask runs as a single unstructured Step — no schema, no planning.
    // StepExecutor's no-tool-call path captures the final assistant text.
    const step: Step = {
      id: randomUUID(),
      instructions: prompt,
      completed: false,
      dependsOn: [],
      logs: []
    };
    const task: Task = {
      id: randomUUID(),
      title: description || "subtask",
      steps: [step]
    };

    const executor = new StepExecutor({
      task,
      step,
      context: childCtx,
      provider: this.provider,
      model: this.model,
      tools: childTools,
      maxIterations: this.maxIterations
    });

    let finalResult: unknown = null;
    let errorMessage: string | null = null;

    try {
      for await (const item of executor.execute()) {
        // Tag every child event so the renderer can nest cards. We mutate a
        // shallow clone — the original event object is shared with whoever
        // emitted it inside the child agent.
        const tagged = {
          ...(item as Record<string, unknown>),
          parent_tool_call_id: parentToolCallId,
          subtask_depth: childDepth
        } as unknown as ProcessingMessage;

        try {
          await this.forward(tagged);
        } catch (forwardErr) {
          // A broken forwarder must not kill the subtask — log and continue.
          // The model still gets the result via the tool return below.
          // eslint-disable-next-line no-console
          console.warn(
            "run_subtask: failed to forward child event",
            forwardErr
          );
        }

        if (item.type === "step_result") {
          const sr = item as StepResult;
          if (sr.error) {
            errorMessage = sr.error;
          } else if (sr.result !== null && sr.result !== undefined) {
            finalResult = sr.result;
          }
        }
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
    }

    if (errorMessage) {
      return {
        error: "subtask_failed",
        description: description || null,
        message: errorMessage
      };
    }

    if (finalResult === null || finalResult === undefined) {
      return {
        error: "subtask_no_result",
        description: description || null,
        message:
          "Subtask ended without producing a final assistant message."
      };
    }

    return finalResult;
  }

  private buildChildToolset(): Tool[] {
    const inherited = this.parentToolsFn();

    // The runner builds the root toolset by snapshotting `serverTools`
    // BEFORE `unshift`ing the RunSubtaskTool, so `parentToolsFn()` returns
    // an array that does NOT include `run_subtask`. Make sure the child can
    // recurse by stitching `this` in if missing — depth refusal still gates
    // actual recursion at runtime via SUBTASK_DEPTH_KEY.
    return inherited.some((t) => t.name === "run_subtask")
      ? inherited
      : [this, ...inherited];
  }
}
