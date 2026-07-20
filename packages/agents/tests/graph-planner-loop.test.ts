/**
 * GraphPlanner must work when the provider runs its own tool loop (the Claude
 * Agent SDK): a tool-free `generateMessages`, with tools driven inside
 * `generateLoop` via the harness-supplied `executeTool`.
 */
import { describe, it, expect } from "vitest";
import { GraphPlanner } from "../src/graph-planner.js";
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
import type {
  BaseProvider,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { GraphData, ProcessingMessage } from "@nodetool-ai/protocol";
import { createMockContext } from "./_helpers/mock-context.js";

// The planner only needs `has`/`getMetadata`, so a stub registry is enough.
const stubRegistry = {
  has: (type: string) => type === AGENT_NODE_TYPE,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

function createSdkLoopProvider(script: ToolCall[]): BaseProvider {
  return {
    provider: "sdk_loop",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    // Mirrors the migrated BaseProvider.generateLoop: dispatch each call to the
    // ProviderTool's own `execute`, and stop after a `terminal` tool runs.
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
        terminal?: boolean;
      }>;
      executeTool?: (tc: ToolCall) => Promise<string | unknown>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute
          ? await tool.execute(tc.args)
          : args.executeTool
            ? await args.executeTool(tc)
            : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
        if (tool?.terminal) break;
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

async function drainGraph(
  gen: AsyncGenerator<ProcessingMessage, GraphData | null>
): Promise<GraphData | null> {
  let res = await gen.next();
  while (!res.done) res = await gen.next();
  return res.value;
}

describe("GraphPlanner — provider-driven tool loop", () => {
  it("builds a graph when the provider runs its own tool loop (agent SDK)", async () => {
    const provider = createSdkLoopProvider([
      {
        id: "tc_submit",
        name: "submit_graph",
        args: {
          code: `node("${AGENT_NODE_TYPE}", { prompt: "Summarize the input" }, "step1");
return graph();`
        }
      }
    ]);

    const planner = new GraphPlanner({
      provider,
      model: "opus",
      registry: stubRegistry
    });

    const graph = await drainGraph(
      planner.plan("Build a graph", createMockContext() as ProcessingContext)
    );

    expect(graph).not.toBeNull();
    expect(graph!.nodes).toHaveLength(1);
    expect(graph!.nodes[0].id).toBe("step1");
    expect(graph!.nodes[0].type).toBe(AGENT_NODE_TYPE);
  });
});
