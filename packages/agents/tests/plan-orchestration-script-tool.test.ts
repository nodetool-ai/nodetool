/**
 * `plan_orchestration_script` exposes ScriptPlanner + ScriptRunner as a chat
 * tool. It must stream planner and sub-agent events upward tagged with the
 * parent tool call id, run the planned script, and end promptly on Stop.
 */
import { describe, it, expect } from "vitest";
import { PlanOrchestrationScriptTool } from "../src/tools/plan-orchestration-script-tool.js";
import { TOOL_CALL_ID_FIELD } from "../src/tools/subtask-fields.js";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

const ECHO_SCHEMA = {
  type: "object",
  properties: { echo: { type: "string" } },
  required: ["echo"]
};

const SCRIPT = `const a = await agent("planned prompt", { schema: ${JSON.stringify(
  ECHO_SCHEMA
)} });
return a.echo;`;

/**
 * Provider serving both roles: `submit_script` calls (planner) get
 * `plannerScript`; sub-agent loops finish via `finish_step`, echoing the
 * step objective.
 */
function createProvider(
  plannerScript: string | null,
  onPlan?: () => void
): BaseProvider {
  let calls = 0;
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      messages: Array<{ role: string; content: unknown }>;
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      calls++;
      const submit = args.tools?.find((t) => t.name === "submit_script");
      if (submit) {
        onPlan?.();
        if (plannerScript !== null && !args.signal?.aborted) {
          const tc: ToolCall = {
            id: `plan_${calls}`,
            name: "submit_script",
            args: { script: plannerScript }
          };
          yield tc;
          const content = await submit.execute?.(tc.args as never);
          yield {
            type: "message",
            message: {
              role: "tool",
              toolCallId: tc.id,
              content: String(content)
            }
          };
        }
        yield { type: "chunk", content: "", done: true };
        return;
      }

      const system = String(args.messages[0]?.content ?? "");
      const objective = /# Objective\n(.*)/.exec(system)?.[1] ?? "?";
      const finish = args.tools?.find((t) => t.name === "finish_step");
      const tc: ToolCall = {
        id: `exec_${calls}`,
        name: "finish_step",
        args: { result: { echo: objective } }
      };
      yield tc;
      const content = await finish?.execute?.(tc.args as never);
      yield {
        type: "message",
        message: {
          role: "tool",
          toolCallId: tc.id,
          content:
            typeof content === "string" ? content : JSON.stringify(content)
        }
      };
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

describe("PlanOrchestrationScriptTool", () => {
  it("rejects an empty objective without calling the planner", async () => {
    let planned = false;
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT, () => {
        planned = true;
      }),
      model: "test-model"
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "   " }
    )) as { error?: string };

    expect(result.error).toMatch(/objective/);
    expect(planned).toBe(false);
  });

  it("returns the script without running it when execute is false", async () => {
    let subAgentRan = false;
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT),
      model: "test-model",
      parentTools: () => {
        subAgentRan = true;
        return [];
      }
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "echo something", execute: false }
    )) as { script?: string; executed?: boolean; result?: unknown };

    expect(result.script).toBe(SCRIPT);
    expect(result.executed).toBe(false);
    expect(result.result).toBeUndefined();
    // parentTools is read once for the planner's prompt, never for a run.
    expect(subAgentRan).toBe(true);
  });

  it("runs the planned script and returns its value", async () => {
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT),
      model: "test-model"
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "echo something" }
    )) as { script?: string; executed?: boolean; result?: unknown };

    expect(result.executed).toBe(true);
    expect(result.result).toBe("planned prompt");
  });

  it("forwards planner and sub-agent events tagged with the parent call id", async () => {
    const forwarded: ProcessingMessage[] = [];
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT),
      model: "test-model",
      forwardMessage: (msg) => {
        forwarded.push(msg);
      }
    });

    await tool.process(createMockContext() as ProcessingContext, {
      objective: "echo something",
      [TOOL_CALL_ID_FIELD]: "tc_parent"
    });

    const types = forwarded.map((m) => m.type);
    expect(types).toContain("planning_update");
    expect(types).toContain("log_update");
    expect(types).toContain("step_result");
    for (const msg of forwarded) {
      expect(
        (msg as unknown as Record<string, unknown>)["parent_tool_call_id"]
      ).toBe("tc_parent");
    }
  });

  it("reports the planner failing to produce a valid script", async () => {
    const tool = new PlanOrchestrationScriptTool({
      // No agent() call — fails validation, and the stub never retries.
      provider: createProvider("return 1;"),
      model: "test-model"
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "nothing works" }
    )) as { error?: string; script?: string };

    expect(result.error).toMatch(/ScriptPlanner failed/);
    expect(result.script).toBeUndefined();
  });

  it("returns cancelled without invoking the planner when already aborted", async () => {
    let planned = false;
    const controller = new AbortController();
    controller.abort();
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT, () => {
        planned = true;
      }),
      model: "test-model",
      signal: () => controller.signal
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "echo something" }
    )) as { error?: string };

    expect(result.error).toBe("Orchestration was cancelled.");
    expect(planned).toBe(false);
  });

  it("stops driving the planner when the turn aborts mid-plan", async () => {
    const controller = new AbortController();
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT),
      model: "test-model",
      signal: () => controller.signal,
      // Abort on the planner's first progress event, the way Stop mid-plan does.
      forwardMessage: () => {
        controller.abort();
      }
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "echo something" }
    )) as { error?: string; script?: string };

    expect(result.error).toBe("Orchestration was cancelled.");
    expect(result.script).toBeUndefined();
  });

  it("reads the signal per call, so a later turn is not stuck on a stale abort", async () => {
    const stale = new AbortController();
    stale.abort();
    let current = stale;
    const tool = new PlanOrchestrationScriptTool({
      provider: createProvider(SCRIPT),
      model: "test-model",
      signal: () => current.signal
    });
    const ctx = createMockContext() as ProcessingContext;

    const cancelled = (await tool.process(ctx, { objective: "first" })) as {
      error?: string;
    };
    expect(cancelled.error).toBe("Orchestration was cancelled.");

    current = new AbortController();
    const fresh = (await tool.process(ctx, { objective: "second" })) as {
      result?: unknown;
    };
    expect(fresh.result).toBe("planned prompt");
  });
});
