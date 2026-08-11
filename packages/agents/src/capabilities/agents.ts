/**
 * The `agents` capability module — delegation to a child agent loop.
 *
 * Two capabilities, `run_subtask` and `run_search`, and unlike every other
 * ported namespace their classes stay exactly as they are. `SubAgentTool` is
 * not a schema plus a function: it owns the depth gate, the child context, the
 * streamed events, the tagging, and the settlement, and the runner constructs
 * one per turn over that turn's provider, model, toolbelt snapshot, and
 * forwarder. Reimplementing that here would be a second copy of the machinery
 * the sub-agent core exists to hold once.
 *
 * So the capability is the registry-visible face: the spec is the class's own
 * wire identity, and the implementation lazily constructs the class over
 * `run.subAgent` — which *is* `SubAgentToolRuntime` — and calls it through
 * `Tool.executeTool`. A run with no `subAgent` cannot delegate, and says so
 * naming the field rather than failing somewhere inside the child loop.
 *
 * Both are classified `read`: the call itself has no side effects, and the
 * child's own tools are gated in the child loop.
 *
 * Design: docs/tool-class-retirement-design.md § "PRs 4–9 — remaining
 * namespaces" (`/agents`).
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import { TOOL_CALL_ID_FIELD } from "../tools/subtask-fields.js";
import { READ_ONLY_SEARCH_DESCRIPTION } from "../prompts/read-only-search-prompt.js";
import type { SubAgentToolRuntime } from "../subagent.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";

/**
 * The sub-agent runtime this run carries, or an error naming what is missing.
 * A headless run (an eval, an MCP mount, a CLI invocation with no forwarder)
 * has no runtime, and no child loop can be spawned without one.
 */
function subAgentRuntime(
  run: CapabilityRun,
  name: string
): SubAgentToolRuntime {
  const runtime = run.subAgent;
  if (!runtime) {
    throw new Error(
      `\`${name}\` needs a sub-agent runtime, but this run carries no ` +
        "`subAgent` (provider, model, parentTools, forwardMessage). The host " +
        "that builds the CapabilityRun must supply it."
    );
  }
  return runtime;
}

/**
 * Run one sub-agent tool over this run.
 *
 * The tool-call id reaches the class through `options.toolCallId` today
 * (`StepExecutor` and the CodeAct tool API pass it), and a capability
 * implementation only ever sees args — so the id travels in the args under
 * `_tool_call_id`, and is handed back to `Tool.executeTool` as the option.
 * `executeTool` re-stamps the same field on a `needsToolCallId` tool, so both
 * routes leave identical args and the child's events keep nesting under the
 * parent card.
 */
async function runSubAgentTool(
  tool: Tool,
  run: CapabilityRun,
  args: Record<string, unknown>
): Promise<unknown> {
  const toolCallId = args[TOOL_CALL_ID_FIELD];
  return Tool.executeTool(
    tool,
    run.context,
    args,
    typeof toolCallId === "string" ? { toolCallId } : {}
  );
}

// ---------------------------------------------------------------------------
// run_subtask
// ---------------------------------------------------------------------------

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

const RUN_SUBTASK_SCHEMA: JsonSchema = {
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
        'Full task description for the subagent. Self-contained — the subagent does not see the parent\'s chat history. If you need a structured response, say so here (e.g. "reply as JSON with fields x, y, z").'
    }
  },
  required: ["description", "prompt"],
  additionalProperties: false
};

const runSubtask: CapabilityExport = {
  spec: {
    name: "run_subtask",
    description: RUN_SUBTASK_DESCRIPTION,
    inputSchema: RUN_SUBTASK_SCHEMA,
    // The child loop's own tools are gated inside it, so spawning one has no
    // side effect of its own.
    category: "read",
    userMessage: (params) => {
      const desc =
        typeof params["description"] === "string"
          ? params["description"].trim()
          : "";
      return desc ? `Running subtask: ${desc}` : "Running subtask";
    }
  },
  impl: async (run, args) => {
    const { RunSubtaskTool } = await import("../tools/run-subtask-tool.js");
    const tool = new RunSubtaskTool(subAgentRuntime(run, "run_subtask"));
    return runSubAgentTool(tool, run, args);
  }
};

// ---------------------------------------------------------------------------
// run_search
// ---------------------------------------------------------------------------

const RUN_SEARCH_SCHEMA: JsonSchema = {
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

const runSearch: CapabilityExport = {
  spec: {
    name: "run_search",
    // The description is the prompt module's own, so the capability and the
    // class cannot drift apart.
    description: READ_ONLY_SEARCH_DESCRIPTION,
    inputSchema: RUN_SEARCH_SCHEMA,
    // The child loop is filtered to a read-only allowlist and cannot recurse.
    category: "read",
    userMessage: (params) => {
      const query =
        typeof params["query"] === "string" ? params["query"].trim() : "";
      return query ? `Searching: ${query}` : "Searching workspace";
    }
  },
  impl: async (run, args) => {
    const { RunSearchTool } = await import("../tools/run-search-tool.js");
    const tool = new RunSearchTool(subAgentRuntime(run, "run_search"));
    return runSubAgentTool(tool, run, args);
  }
};

/** Both delegation capabilities. */
export const AGENT_CAPABILITIES: readonly CapabilityExport[] = [
  runSubtask,
  runSearch
];

export const module: CapabilityModule = {
  module: "agents",
  exports: AGENT_CAPABILITIES
};

export { runSubtask, runSearch };
