/**
 * `run_search` — a read-only fan-out search primitive.
 *
 * The agent calls this tool when answering a question requires fanning out
 * across many files or directories to locate where something lives. It spins
 * up a child agent loop, exactly like {@link import("./run-subtask-tool.js").RunSubtaskTool},
 * but with two deliberate differences:
 *
 * 1. The child toolset is FILTERED to a strictly read-only allowlist by tool
 *    name (read_file, glob, grep, list_directory, memory_read). It does NOT
 *    stitch in `run_subtask` / `run_search`, so a search loop can never reach
 *    a write-capable or recursive tool.
 * 2. A `breadth` hint ("medium" | "very thorough") selects an adapted
 *    exploration prompt paragraph and the child loop's iteration budget.
 *
 * The child loop runs as a single unstructured Step in prose mode: with no
 * output schema, StepExecutor ends the loop on a no-tool-call assistant
 * message, whose text becomes the result (the search report).
 *
 * Recursion is bounded by {@link RunSearchToolOptions.maxDepth} (default 3) via
 * the shared {@link SUBTASK_DEPTH_KEY} on `ProcessingContext`; each search
 * copies the parent context and increments the counter — identical machinery
 * to `run_subtask`.
 */

import { randomUUID } from "node:crypto";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";
import { StepExecutor } from "../step-executor.js";
import { SUBTASK_DEPTH_KEY, TOOL_CALL_ID_FIELD } from "./subtask-fields.js";
import type { ForwardMessage } from "./run-subtask-tool.js";
import type { Step, Task } from "../types.js";
import {
  buildReadOnlySearchPrompt,
  READ_ONLY_SEARCH_DESCRIPTION,
  type SearchBreadth
} from "../prompts/read-only-search-prompt.js";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_ITERATIONS = 20;

/**
 * Read-only tools the child search loop is allowed to use. The filter is a
 * positive allowlist applied to the parent snapshot: a tool reaches the child
 * only if its name is in this set. A future read-only tool must be added here
 * to be available inside a search; anything not listed (write/edit/execute/
 * spawn) is excluded by construction.
 *
 * Note: StepExecutor auto-attaches memory_list/memory_read/memory_write to
 * every step regardless of this array. memory_write only touches the shared
 * memory namespace (no filesystem/state mutation), and the prompt forbids
 * writes; combined with the absence of any forwarded filesystem-write tool,
 * the read-only guarantee about the workspace holds.
 */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read_file",
  "glob",
  "grep",
  "list_directory",
  "memory_read"
]);

const VALID_BREADTHS: readonly SearchBreadth[] = ["medium", "very thorough"];

export interface RunSearchToolOptions {
  provider: BaseProvider;
  model: string;
  /**
   * Snapshot of the parent's toolset. Called lazily on each invocation so a
   * dynamically-mutated toolbelt is observed. The tool filters this snapshot
   * down to {@link READ_ONLY_TOOL_NAMES} before handing it to the child loop.
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
  /**
   * Max LLM iterations for a "medium" child loop. Defaults to 20. A
   * "very thorough" search scales this to ~2x.
   */
  maxIterations?: number;
}

export class RunSearchTool extends Tool {
  readonly name = "run_search";
  readonly description = READ_ONLY_SEARCH_DESCRIPTION;
  readonly needsToolCallId = true;
  readonly inputSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Precise description of what to locate. Self-contained — the search loop does not see the parent's chat history."
      },
      breadth: {
        type: "string",
        enum: ["medium", "very thorough"],
        default: "medium",
        description:
          'How wide to sweep. "medium" (default) checks a few likely locations and obvious naming variants; "very thorough" systematically searches many locations and naming conventions.'
      }
    },
    required: ["query"],
    additionalProperties: false
  };

  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly parentToolsFn: () => Tool[];
  private readonly forward: ForwardMessage;
  private readonly maxDepth: number;
  private readonly maxIterations: number;

  constructor(opts: RunSearchToolOptions) {
    super();
    this.provider = opts.provider;
    this.model = opts.model;
    this.parentToolsFn = opts.parentTools;
    this.forward = opts.forwardMessage;
    this.maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  userMessage(params: Record<string, unknown>): string {
    const query =
      typeof params.query === "string" ? params.query.trim() : "";
    return query ? `Searching: ${query}` : "Searching workspace";
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
          "Cannot spawn another search — recursion depth limit reached. Answer directly using the tools already available at this level."
      };
    }

    const query =
      typeof params.query === "string" ? params.query.trim() : "";
    if (!query) {
      return {
        error: "missing_query",
        message: "`query` is required and must be a non-empty string."
      };
    }

    const breadth = this.resolveBreadth(params.breadth);

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

    // Search runs as a single unstructured Step — no schema, no planning.
    // StepExecutor's no-tool-call path captures the final assistant text as the
    // search report. The adapted exploration prompt lands in the step
    // instructions (the prose template's objective slot).
    const step: Step = {
      id: randomUUID(),
      instructions: buildReadOnlySearchPrompt(query, breadth),
      completed: false,
      dependsOn: [],
      logs: []
    };
    const task: Task = {
      id: randomUUID(),
      title: "search",
      steps: [step]
    };

    // "very thorough" gets a larger iteration budget so a systematic sweep has
    // room to fan out; depth is still bounded by SUBTASK_DEPTH_KEY/maxDepth.
    const maxIterations =
      breadth === "very thorough"
        ? this.maxIterations * 2
        : this.maxIterations;

    const executor = new StepExecutor({
      task,
      step,
      context: childCtx,
      provider: this.provider,
      model: this.model,
      tools: childTools,
      maxIterations
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
          // A broken forwarder must not kill the search — log and continue.
          // The model still gets the result via the tool return below.
          // eslint-disable-next-line no-console
          console.warn(
            "run_search: failed to forward child event",
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
        error: "search_failed",
        query,
        message: errorMessage
      };
    }

    if (finalResult === null || finalResult === undefined) {
      return {
        error: "search_no_result",
        query,
        message: "Search ended without producing a final report message."
      };
    }

    return finalResult;
  }

  private resolveBreadth(value: unknown): SearchBreadth {
    return value === "very thorough" || value === "medium" ? value : "medium";
  }

  private buildChildToolset(): Tool[] {
    const inherited = this.parentToolsFn();
    // Positive allowlist: a parent tool reaches the child only if its name is
    // a read-only one. Deliberately does NOT stitch in run_subtask/run_search,
    // so a search loop can never reach a write-capable or recursive tool.
    return inherited.filter((t) => READ_ONLY_TOOL_NAMES.has(t.name));
  }
}

export { VALID_BREADTHS };
