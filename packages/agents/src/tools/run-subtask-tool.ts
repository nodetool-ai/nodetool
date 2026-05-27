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

import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";
import { MultiModeAgent } from "../multi-mode-agent.js";

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
  "Spawn a focused subtask handled by a fresh agent loop.",
  "",
  "Call this when the work needs a self-contained execution with its own focus —",
  "research a question end-to-end, perform a multi-step transformation, gather",
  "structured information. Emit multiple `run_subtask` calls in one turn to",
  "run independent subtasks concurrently.",
  "",
  "The subtask inherits the parent's tools by default; set `tools` to restrict.",
  "Set `output_schema` to require a structured JSON result instead of free text.",
  "Subtasks can themselves call `run_subtask` up to the recursion depth limit."
].join("\n");

export class RunSubtaskTool extends Tool {
  readonly name = "run_subtask";
  readonly description = RUN_SUBTASK_DESCRIPTION;
  readonly inputSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Short user-facing label for the subtask (5-12 words). Shown in the UI card."
      },
      instructions: {
        type: "string",
        description:
          "What the subtask should accomplish. Self-contained — the subtask does not see the parent's chat history."
      },
      tools: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional: restrict the subtask's toolset to these names. `run_subtask` and memory tools are always allowed."
      },
      output_schema: {
        type: "object",
        description:
          "Optional JSON schema for a structured result. If omitted, the subtask returns free text."
      }
    },
    required: ["title", "instructions"],
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
    const title = typeof params.title === "string" ? params.title.trim() : "";
    return title ? `Running subtask: ${title}` : "Running subtask";
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

    const title = typeof params.title === "string" ? params.title.trim() : "";
    const instructions =
      typeof params.instructions === "string" ? params.instructions.trim() : "";
    if (!instructions) {
      return {
        error: "missing_instructions",
        message: "`instructions` is required and must be a non-empty string."
      };
    }

    const parentToolCallId =
      typeof params[TOOL_CALL_ID_FIELD] === "string"
        ? (params[TOOL_CALL_ID_FIELD] as string)
        : null;
    const childDepth = currentDepth + 1;

    const childTools = this.buildChildToolset(params.tools);

    const outputSchema = this.coerceOutputSchema(params.output_schema);

    // Child context with bumped depth. Copy preserves _onMessage (telemetry
    // listener) and clones variables so depth mutations stay local.
    const childCtx = context.copy();
    childCtx.set(SUBTASK_DEPTH_KEY, childDepth);

    const agent = new MultiModeAgent({
      name: title || "subtask",
      objective: instructions,
      provider: this.provider,
      model: this.model,
      mode: "loop",
      tools: childTools,
      outputSchema,
      maxIterations: this.maxIterations
    });

    let finalResult: unknown = null;
    let errorMessage: string | null = null;

    try {
      for await (const item of agent.execute(childCtx)) {
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
        title: title || null,
        message: errorMessage
      };
    }

    if (finalResult === null || finalResult === undefined) {
      return {
        error: "subtask_no_result",
        title: title || null,
        message:
          "Subtask ended without producing a result. The model may have terminated without calling finish_step (when an output_schema is set) or without emitting a final assistant message."
      };
    }

    return finalResult;
  }

  private buildChildToolset(raw: unknown): Tool[] {
    const inherited = this.parentToolsFn();

    // The runner builds the root toolset by snapshotting `serverTools`
    // BEFORE `unshift`ing the RunSubtaskTool, so `parentToolsFn()` returns
    // an array that does NOT include `run_subtask`. Make sure the child can
    // recurse by stitching `this` in if missing — depth refusal still gates
    // actual recursion at runtime via SUBTASK_DEPTH_KEY.
    const withSelf = inherited.some((t) => t.name === "run_subtask")
      ? inherited
      : [this, ...inherited];

    if (!Array.isArray(raw) || raw.length === 0) return withSelf;

    const allow = new Set<string>();
    for (const name of raw) {
      if (typeof name === "string") allow.add(name);
    }

    // run_subtask and memory_* are always allowed so the child can recurse and
    // read shared memory without the model having to remember to whitelist
    // them in every call.
    return withSelf.filter(
      (t) =>
        allow.has(t.name) ||
        t.name === "run_subtask" ||
        t.name.startsWith("memory_")
    );
  }

  private coerceOutputSchema(raw: unknown): Record<string, unknown> | undefined {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return undefined;
  }
}
