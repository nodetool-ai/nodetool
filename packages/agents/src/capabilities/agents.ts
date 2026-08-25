/**
 * The `agents` capability module — delegation to a child agent loop.
 *
 * Four capabilities: `run_subtask` (blocking), `run_search` (read-only
 * child), `start_subtask` (background spawn) and `wait_subtasks` (collect).
 * Unlike every other ported namespace their classes stay exactly as they
 * are. `SubAgentTool` is not a schema plus a function: it owns the depth gate, the child context, the
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
import {
  runSubtaskSpec,
  runSearchSpec,
  startSubtaskSpec,
  waitSubtasksSpec,
  RUN_SUBTASK_DESCRIPTION,
  RUN_SUBTASK_SCHEMA,
  RUN_SEARCH_SCHEMA
} from "./agents.specs.js";
import { isString } from "../utils/type-guards.js";

export {
  RUN_SUBTASK_DESCRIPTION,
  RUN_SUBTASK_SCHEMA,
  RUN_SEARCH_SCHEMA
} from "./agents.specs.js";

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
    isString(toolCallId) ? { toolCallId } : {}
  );
}

const runSubtask: CapabilityExport = {
  spec: runSubtaskSpec,
  impl: async (run, args) => {
    const { RunSubtaskTool } = await import("../tools/run-subtask-tool.js");
    const tool = new RunSubtaskTool(subAgentRuntime(run, "run_subtask"));
    return runSubAgentTool(tool, run, args);
  }
};

const runSearch: CapabilityExport = {
  spec: runSearchSpec,
  impl: async (run, args) => {
    const { RunSearchTool } = await import("../tools/run-search-tool.js");
    const tool = new RunSearchTool(subAgentRuntime(run, "run_search"));
    return runSubAgentTool(tool, run, args);
  }
};

const startSubtask: CapabilityExport = {
  spec: startSubtaskSpec,
  impl: async (run, args) => {
    const { StartSubtaskTool } = await import("../tools/start-subtask-tool.js");
    const tool = new StartSubtaskTool(subAgentRuntime(run, "start_subtask"));
    return runSubAgentTool(tool, run, args);
  }
};

const waitSubtasks: CapabilityExport = {
  spec: waitSubtasksSpec,
  impl: async (run, args) => {
    const { WaitSubtasksTool } = await import("../tools/wait-subtasks-tool.js");
    const runtime = subAgentRuntime(run, "wait_subtasks");
    return Tool.executeTool(
      new WaitSubtasksTool({ background: runtime.background }),
      run.context,
      args
    );
  }
};

/** Every delegation capability. */
export const AGENT_CAPABILITIES: readonly CapabilityExport[] = [
  runSubtask,
  runSearch,
  startSubtask,
  waitSubtasks
];

export const module: CapabilityModule = {
  module: "agents",
  exports: AGENT_CAPABILITIES
};

export { runSubtask, runSearch, startSubtask, waitSubtasks };
