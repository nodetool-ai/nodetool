/**
 * `run_search` — a read-only fan-out search primitive.
 *
 * The agent calls this tool when answering a question requires fanning out
 * across many files or directories to locate where something lives. Built on
 * the sub-agent core (`../subagent.ts`) — the same spawn/stream/settle
 * machinery as {@link import("./run-subtask-tool.js").RunSubtaskTool} — with
 * two deliberate differences:
 *
 * 1. The child toolset is FILTERED to a strictly read-only allowlist by tool
 *    name (read_file, glob, grep, list_directory, read_shared). It does NOT
 *    stitch in `run_subtask` / `run_search`, so a search loop can never reach
 *    a write-capable or recursive tool.
 * 2. A `breadth` hint ("medium" | "very thorough") selects an adapted
 *    exploration prompt paragraph and the child loop's iteration budget.
 *
 * The child loop runs as a single unstructured Step in prose mode: with no
 * output schema, the executor ends the loop on a no-tool-call assistant
 * message, whose text becomes the result (the search report).
 *
 * Recursion is bounded by {@link SubAgentToolRuntime.maxDepth} (default 3) via
 * the shared {@link SUBTASK_DEPTH_KEY} on `ProcessingContext` — identical
 * machinery to `run_subtask`.
 */

import { Tool } from "./base-tool.js";
import {
  SubAgentTool,
  type SubAgentToolRun,
  type SubAgentToolRuntime
} from "../subagent.js";
import {
  buildReadOnlySearchPrompt,
  READ_ONLY_SEARCH_DESCRIPTION,
  type SearchBreadth
} from "../prompts/read-only-search-prompt.js";
import { isString } from "../utils/type-guards.js";

const DEFAULT_MAX_ITERATIONS = 20;

/**
 * Read-only tools the child search loop is allowed to use. The filter is a
 * positive allowlist applied to the parent snapshot: a tool reaches the child
 * only if its name is in this set. A future read-only tool must be added here
 * to be available inside a search; anything not listed (write/edit/execute/
 * spawn) is excluded by construction.
 *
 * Note: the executor auto-attaches list_shared/read_shared/share_result to
 * every step regardless of this array. share_result only touches the shared
 * memory namespace (no filesystem/state mutation), and the prompt forbids
 * writes; combined with the absence of any forwarded filesystem-write tool,
 * the read-only guarantee about the workspace holds.
 */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read_file",
  "glob",
  "grep",
  "list_directory",
  "read_shared",
  // Read-only discovery over the thread's memory and the asset library, so a
  // fan-out search sub-agent can find prior notes and generated media.
  "memory_list",
  "asset_search",
  "asset_list"
]);

const VALID_BREADTHS: readonly SearchBreadth[] = ["medium", "very thorough"];

export interface RunSearchToolOptions extends SubAgentToolRuntime {
  /**
   * Max LLM iterations for a "medium" child loop. Defaults to 20. A
   * "very thorough" search scales this to ~2x.
   */
  maxIterations?: number;
}

export class RunSearchTool extends SubAgentTool {
  readonly name = "run_search";
  readonly description = READ_ONLY_SEARCH_DESCRIPTION;
  protected readonly depthNoun = "search";
  readonly jsonSchema = {
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

  private readonly baseIterations: number;

  constructor(opts: RunSearchToolOptions) {
    super(opts);
    this.baseIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  }

  userMessage(params: Record<string, unknown>): string {
    const query = isString(params.query) ? params.query.trim() : "";
    return query ? `Searching: ${query}` : "Searching workspace";
  }

  protected buildRun(
    params: Record<string, unknown>
  ): SubAgentToolRun | { error: string; message: string } {
    const query = isString(params.query) ? params.query.trim() : "";
    if (!query) {
      return {
        error: "missing_query",
        message: "`query` is required and must be a non-empty string."
      };
    }
    const breadth = this.resolveBreadth(params.breadth);
    return {
      // The adapted exploration prompt lands in the step instructions (the
      // prose template's objective slot).
      instructions: buildReadOnlySearchPrompt(query, breadth),
      title: "search",
      // "very thorough" gets a larger iteration budget so a systematic sweep
      // has room to fan out; depth is still bounded by the shared gate.
      maxIterations:
        breadth === "very thorough"
          ? this.baseIterations * 2
          : this.baseIterations,
      errorCode: "search_failed",
      noResultCode: "search_no_result",
      noResultMessage: "Search ended without producing a final report message.",
      errorExtras: { query }
    };
  }

  protected buildChildToolset(parentTools: Tool[]): Tool[] {
    // Positive allowlist: a parent tool reaches the child only if its name is
    // a read-only one. Deliberately does NOT stitch in run_subtask/run_search,
    // so a search loop can never reach a write-capable or recursive tool.
    return parentTools.filter((t) => READ_ONLY_TOOL_NAMES.has(t.name));
  }

  private resolveBreadth(value: unknown): SearchBreadth {
    return value === "very thorough" || value === "medium" ? value : "medium";
  }
}

export { VALID_BREADTHS };
