/**
 * `plan_workflow_graph` runs the GraphPlanner inside a chat turn, so a Stop
 * must end it promptly instead of letting every remaining LLM call finish.
 */
import { describe, it, expect } from "vitest";
import { PlanWorkflowGraphTool } from "../src/tools/mcp-tools.js";
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

const stubRegistry = {
  has: (type: string) => type === AGENT_NODE_TYPE,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

const SUBMIT_CALL: ToolCall = {
  id: "tc_submit",
  name: "submit_graph",
  args: {
    code: `node("${AGENT_NODE_TYPE}", { prompt: "Summarize" }, "step1");
return graph();`
  }
};

/** Provider that drives the tool loop itself, one scripted call at a time. */
function createProvider(
  script: ToolCall[],
  onLoop?: () => void
): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (
          a: Record<string, unknown>,
          id?: string
        ) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      onLoop?.();
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc;
        const content = (await toolMap.get(tc.name)?.execute?.(tc.args, tc.id)) ?? "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

function createTool(opts: {
  provider: BaseProvider;
  signal?: () => AbortSignal | undefined;
  forwardMessage?: (msg: ProcessingMessage) => void;
}): PlanWorkflowGraphTool {
  return new PlanWorkflowGraphTool({
    provider: opts.provider,
    model: "test-model",
    registry: stubRegistry,
    signal: opts.signal,
    forwardMessage: opts.forwardMessage
  });
}

describe("PlanWorkflowGraphTool cancellation", () => {
  it("plans normally when the turn is not aborted", async () => {
    const tool = createTool({ provider: createProvider([SUBMIT_CALL]) });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "Build a graph" }
    )) as { graph?: { nodes: unknown[] }; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.graph!.nodes).toHaveLength(1);
  });

  it("returns cancelled without invoking the planner when already aborted", async () => {
    let loopRan = false;
    const controller = new AbortController();
    controller.abort();
    const tool = createTool({
      provider: createProvider([SUBMIT_CALL], () => {
        loopRan = true;
      }),
      signal: () => controller.signal
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "Build a graph" }
    )) as { error?: string };

    expect(result.error).toBe("Graph planning was cancelled.");
    expect(loopRan).toBe(false);
  });

  it("stops driving the planner when the turn aborts mid-plan", async () => {
    const controller = new AbortController();
    const forwarded: string[] = [];
    const tool = createTool({
      provider: createProvider([SUBMIT_CALL]),
      signal: () => controller.signal,
      // Abort as soon as the planner emits its first progress event, the way a
      // user hitting Stop mid-plan does.
      forwardMessage: (msg) => {
        forwarded.push(msg.type);
        controller.abort();
      }
    });

    const result = (await tool.process(
      createMockContext() as ProcessingContext,
      { objective: "Build a graph" }
    )) as { graph?: unknown; error?: string };

    expect(result.error).toBe("Graph planning was cancelled.");
    expect(result.graph).toBeUndefined();
    expect(forwarded.length).toBeGreaterThan(0);
  });

  it("reads the signal per call, so a later turn is not stuck on a stale abort", async () => {
    const stale = new AbortController();
    stale.abort();
    let current = stale;
    const tool = createTool({
      provider: createProvider([SUBMIT_CALL]),
      signal: () => current.signal
    });
    const ctx = createMockContext() as ProcessingContext;

    const cancelled = (await tool.process(ctx, {
      objective: "First"
    })) as { error?: string };
    expect(cancelled.error).toBe("Graph planning was cancelled.");

    current = new AbortController();
    const fresh = (await tool.process(ctx, { objective: "Second" })) as {
      graph?: { nodes: unknown[] };
      error?: string;
    };
    expect(fresh.error).toBeUndefined();
    expect(fresh.graph!.nodes).toHaveLength(1);
  });
});
