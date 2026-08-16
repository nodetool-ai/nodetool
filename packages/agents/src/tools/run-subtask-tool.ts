/**
 * `run_subtask` — the primitive that lets an agent decompose work recursively.
 *
 * The agent calls this tool when it judges that a piece of work warrants a
 * focused sub-execution. The spawn/stream/settle machinery lives in the
 * sub-agent core (`../subagent.ts`); this class declares only what makes a
 * subtask a subtask: the tool surface, the child inheriting the parent's
 * full toolset (with itself stitched in so subtasks can recurse), and the
 * subtask error vocabulary. Child events stream upward tagged with
 * `parent_tool_call_id` and `subtask_depth` so the renderer can nest cards.
 *
 * Recursion is bounded by {@link SubAgentToolRuntime.maxDepth} (default 3)
 * via the shared {@link SUBTASK_DEPTH_KEY} on `ProcessingContext`.
 */

import { Tool } from "./base-tool.js";
import {
  SubAgentTool,
  type SubAgentToolRun,
  type SubAgentToolRuntime
} from "../subagent.js";
import { isString } from "../utils/type-guards.js";

export { SUBTASK_DEPTH_KEY, TOOL_CALL_ID_FIELD } from "./subtask-fields.js";
export type { ForwardMessage } from "../subagent.js";

const DEFAULT_MAX_ITERATIONS = 20;

export interface RunSubtaskToolOptions extends SubAgentToolRuntime {
  /** Max LLM iterations per child loop. Defaults to 20. */
  maxIterations?: number;
}

const RUN_SUBTASK_DESCRIPTION = [
  "Spawn a focused subtask handled by a fresh agent loop. The subtask returns",
  "the subagent's final assistant message as plain text.",
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

export class RunSubtaskTool extends SubAgentTool {
  readonly name = "run_subtask";
  readonly description = RUN_SUBTASK_DESCRIPTION;
  readonly jsonSchema = {
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

  constructor(opts: RunSubtaskToolOptions) {
    super({ ...opts, maxIterations: opts.maxIterations ?? DEFAULT_MAX_ITERATIONS });
  }

  userMessage(params: Record<string, unknown>): string {
    const desc =
      isString(params.description) ? params.description.trim() : "";
    return desc ? `Running subtask: ${desc}` : "Running subtask";
  }

  protected buildRun(
    params: Record<string, unknown>
  ): SubAgentToolRun | { error: string; message: string } {
    const description =
      isString(params.description) ? params.description.trim() : "";
    const prompt =
      isString(params.prompt) ? params.prompt.trim() : "";
    if (!prompt) {
      return {
        error: "missing_prompt",
        message: "`prompt` is required and must be a non-empty string."
      };
    }
    return {
      instructions: prompt,
      title: description || "subtask",
      errorCode: "subtask_failed",
      noResultCode: "subtask_no_result",
      noResultMessage:
        "Subtask ended without producing a final assistant message.",
      errorExtras: { description: description || null }
    };
  }

  protected buildChildToolset(parentTools: Tool[]): Tool[] {
    // The runner builds the root toolset by snapshotting `serverTools`
    // BEFORE `unshift`ing the RunSubtaskTool, so `parentTools` does NOT
    // include `run_subtask`. Make sure the child can recurse by stitching
    // `this` in if missing — depth refusal still gates actual recursion at
    // runtime via SUBTASK_DEPTH_KEY.
    return parentTools.some((t) => t.name === "run_subtask")
      ? parentTools
      : [this, ...parentTools];
  }
}
