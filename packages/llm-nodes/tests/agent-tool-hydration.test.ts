/**
 * What an AgentNode's tools resolve to, and what they are allowed to do.
 *
 * Two halves. A saved AgentNode stores its tools as bare name stubs, and a
 * stub that resolves to nothing is silently uncallable — so hydration has to
 * answer with what replaced a retired name. And whatever a stub resolves to
 * runs behind the run's permission gate: the node used to hydrate its tools
 * ungated, so a chat in plan mode could mutate through a node it started with
 * `run_node` (invariant I-1).
 */

import { describe, it, expect } from "vitest";
import { PERMISSION_GATE_CONTEXT_KEY, Tool } from "@nodetool-ai/agents";
import type { PermissionGateOptions } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { AgentNode } from "../src/nodes/agents.js";
import {
  resolveBuiltinAgentTool,
  hydrateBuiltinAgentTool
} from "../src/nodes/agent-tool-hydration.js";

describe("retired tool names", () => {
  it.each([
    ["openai_web_search", "web_search"],
    ["google_grounded_search", "web_search"],
    ["dataforseo_search", "web_search"],
    ["dataforseo_news", "web_search"],
    ["dataforseo_images", "image_search"],
    ["google_news", "web_search"],
    ["google_images", "image_search"],
    ["image_generation", "generate_image"],
    ["openai_image_generation", "generate_image"],
    ["google_image_generation", "generate_image"],
    ["openai_text_to_speech", "generate_speech"]
  ])("resolves %s to %s", (retired, replacement) => {
    const tool = resolveBuiltinAgentTool(retired);
    expect(tool?.name).toBe(replacement);
  });

  it("hydrates a saved stub into a runnable tool", () => {
    const hydrated = hydrateBuiltinAgentTool({ name: "dataforseo_news" });
    expect(hydrated.name).toBe("web_search");
    expect(typeof (hydrated as { process?: unknown }).process).toBe("function");
  });

  it("still answers null for a name nothing ever registered", () => {
    expect(resolveBuiltinAgentTool("no_such_tool")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The gate the node's tools run behind
// ---------------------------------------------------------------------------

/** The workflow rows a run can delete, so "the row survives" is observable. */
type WorkflowTable = Map<string, { id: string }>;

/**
 * `delete_workflow` reduced to what the ladder decides on: the name (which is
 * what `permissionCategoryFor` classifies as `write`) and a side effect on a
 * row. The real capability needs a database; this needs the gate.
 */
class FakeDeleteWorkflowTool extends Tool {
  readonly name = "delete_workflow";
  readonly description = "Delete a workflow by id.";

  constructor(private readonly table: WorkflowTable) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = String(params.workflow_id ?? "");
    const existed = this.table.delete(id);
    return { deleted: existed };
  }
}

/**
 * A tool injected as a bare object rather than a `Tool` instance — the shape
 * `context.setInjectedTools` accepts. It has to reach the gate too, or the
 * ladder is skippable by declaring a tool differently.
 */
function structuralDeleteTool(table: WorkflowTable): {
  name: string;
  description: string;
  process: (
    context: ProcessingContext,
    params: Record<string, unknown>
  ) => Promise<object>;
} {
  return {
    name: "delete_workflow",
    description: "Delete a workflow by id.",
    process: async (_context, params) => ({
      deleted: table.delete(String(params.workflow_id ?? ""))
    })
  };
}

function planModeGate(): PermissionGateOptions {
  return {
    mode: "plan",
    sessionAllow: new Set<string>(),
    // Reaching this in plan mode would mean the matrix let a write through.
    requestApproval: async () => {
      throw new Error("plan mode must block before asking");
    }
  };
}

interface RecordedRun {
  /** What the provider handed back for the `delete_workflow` call. */
  toolResult: string;
}

/**
 * A provider that calls one named tool and ends the turn, recording what came
 * back. It drives the node's own `providerTools`, which is where the gate
 * wrapper sits.
 */
function callToolProvider(toolName: string, recorded: RecordedRun) {
  return {
    provider: "openai",
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (
          params: Record<string, unknown>,
          toolCallId?: string
        ) => Promise<string>;
      }>;
    }) {
      const tool = args.tools?.find((t) => t.name === toolName);
      recorded.toolResult = String(
        await tool?.execute?.({ workflow_id: "wf-1" }, "call_1")
      );
      yield {
        type: "chunk",
        content: "done",
        content_type: "text",
        done: true
      };
    }
  };
}

function contextWithTool(
  tool: { name: string },
  provider: unknown,
  variables: Record<string, unknown>
): ProcessingContext {
  return {
    getProvider: async () => provider,
    getInjectedTool: (name: string) => (name === tool.name ? tool : null),
    get: <T,>(key: string, defaultValue?: T) =>
      (key in variables ? variables[key] : defaultValue) as T
  } as unknown as ProcessingContext;
}

function deletingAgent(): AgentNode {
  const agent = new AgentNode();
  agent.assign({
    system: "You are helpful",
    prompt: "Delete workflow wf-1",
    model: { provider: "openai", id: "gpt-4o-mini" },
    tools: [{ name: "delete_workflow" }]
  });
  return agent;
}

async function runAgent(
  agent: AgentNode,
  context: ProcessingContext
): Promise<void> {
  for await (const _ of agent.genProcess(context)) {
    // Drain: the assertions are on the table and the recorded tool result.
  }
}

describe("the gate an AgentNode's tools run behind", () => {
  it("blocks a write in plan mode and leaves the row", async () => {
    const table: WorkflowTable = new Map([["wf-1", { id: "wf-1" }]]);
    const recorded: RecordedRun = { toolResult: "" };
    const context = contextWithTool(
      new FakeDeleteWorkflowTool(table),
      callToolProvider("delete_workflow", recorded),
      { [PERMISSION_GATE_CONTEXT_KEY]: planModeGate() }
    );

    await runAgent(deletingAgent(), context);

    expect(recorded.toolResult).toContain("blocked_in_plan_mode");
    expect(table.has("wf-1")).toBe(true);
  });

  it("blocks a structurally-injected tool in plan mode too", async () => {
    const table: WorkflowTable = new Map([["wf-1", { id: "wf-1" }]]);
    const recorded: RecordedRun = { toolResult: "" };
    const context = contextWithTool(
      structuralDeleteTool(table),
      callToolProvider("delete_workflow", recorded),
      { [PERMISSION_GATE_CONTEXT_KEY]: planModeGate() }
    );

    await runAgent(deletingAgent(), context);

    expect(recorded.toolResult).toContain("blocked_in_plan_mode");
    expect(table.has("wf-1")).toBe(true);
  });

  it("runs the same write on a context no host gated (a kernel job run)", async () => {
    const table: WorkflowTable = new Map([["wf-1", { id: "wf-1" }]]);
    const recorded: RecordedRun = { toolResult: "" };
    const context = contextWithTool(
      new FakeDeleteWorkflowTool(table),
      callToolProvider("delete_workflow", recorded),
      {}
    );

    await runAgent(deletingAgent(), context);

    // A workflow run is consent, so the headless gate runs `auto` (D4).
    expect(recorded.toolResult).toContain('"deleted":true');
    expect(table.has("wf-1")).toBe(false);
  });

  it("leaves control tools ungated: they are graph wiring, not capabilities", async () => {
    const dispatched: Array<{ targetId: string }> = [];
    const agent = deletingAgent();
    agent.assign({ tools: [] });
    // The bag the kernel injects for a node with an outgoing control edge.
    agent.setDynamic("_control_context", {
      target_node: {
        node_title: "Target",
        node_type: "test.Controlled",
        control_actions: { run: { properties: {} } }
      }
    });
    const recorded: RecordedRun = { toolResult: "" };
    const context = {
      getProvider: async () => callToolProvider("run_target", recorded),
      getInjectedTool: () => null,
      hasControlEventSupport: true,
      sendControlEvent: async (targetId: string) => {
        dispatched.push({ targetId });
        return { ok: true };
      },
      get: <T,>(key: string, defaultValue?: T) =>
        (key === PERMISSION_GATE_CONTEXT_KEY
          ? planModeGate()
          : defaultValue) as T
    } as unknown as ProcessingContext;

    await runAgent(agent, context);

    expect(recorded.toolResult).not.toContain("blocked_in_plan_mode");
    expect(dispatched).toEqual([{ targetId: "target_node" }]);
  });
});
