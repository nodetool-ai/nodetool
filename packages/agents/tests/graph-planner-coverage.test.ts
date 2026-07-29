/**
 * Coverage tests for GraphPlanner (`src/graph-planner.ts`).
 *
 * Drives the planner with a scripted provider whose `generateLoop` replays a
 * per-attempt list of tool calls (executing each tool's `execute` closure,
 * exactly like a real provider), so we can exercise:
 *   - one-shot DSL submission, chunk streaming, and tool-call messages
 *   - the find_model registration path (providers supplied)
 *   - submit_graph feedback rounds within one attempt (invalid → fixed)
 *   - retry after a failed attempt (with the last program in the retry prompt)
 *   - all-attempts-fail -> null
 *   - the per-turn tool-call budget exhaustion
 *   - "stopped without submit_graph"
 *   - custom systemPrompt / outputSchema / execution-tools formatting
 */
import { describe, it, expect } from "vitest";
import { GraphPlanner } from "../src/graph-planner.js";
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
import { Tool } from "../src/tools/base-tool.js";
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

const VALID_PROGRAM = `const step = node("${AGENT_NODE_TYPE}", { prompt: "do it" }, "step1");
return graph();`;

interface LoopArgs {
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{
    name: string;
    execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
  }>;
  signal?: AbortSignal;
}

interface ProviderCapture {
  lastArgs?: LoopArgs;
  toolResults?: string[];
}

/**
 * Provider whose `generateLoop` replays one scripted tool-call list per attempt
 * (each `generateLoop` invocation advances to the next script). Optional
 * `chunks` are emitted as streaming text before the tool calls.
 */
function createScriptedProvider(
  attempts: ToolCall[][],
  opts: { chunks?: string[]; capture?: ProviderCapture } = {}
): BaseProvider {
  let attemptIndex = 0;
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateMessagesTraced(): AsyncGenerator<ProviderStreamItem> {
      yield { type: "chunk", content: "", done: true };
    },
    async *generateLoop(args: LoopArgs): AsyncGenerator<ProviderStreamItem> {
      if (opts.capture) opts.capture.lastArgs = args;
      const script = attempts[attemptIndex] ?? [];
      attemptIndex++;
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));

      for (const content of opts.chunks ?? []) {
        yield { type: "chunk", content, done: false } as ProviderStreamItem;
      }

      for (const tc of script) {
        if (args.signal?.aborted) break;
        yield tc as unknown as ProviderStreamItem;
        const tool = toolMap.get(tc.name);
        if (tool?.execute) {
          const result = await tool.execute(tc.args as Record<string, unknown>);
          opts.capture?.toolResults?.push(String(result));
        }
        if (args.signal?.aborted) break;
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

async function collect(
  gen: AsyncGenerator<ProcessingMessage, GraphData | null>
): Promise<{ messages: ProcessingMessage[]; value: GraphData | null }> {
  const messages: ProcessingMessage[] = [];
  let res = await gen.next();
  while (!res.done) {
    messages.push(res.value);
    res = await gen.next();
  }
  return { messages, value: res.value };
}

function toolMessages(messages: ProcessingMessage[]): string[] {
  return messages
    .filter((m) => (m as { type?: string }).type === "tool_call_update")
    .map((m) => (m as { message?: string }).message ?? "");
}

function planningContents(messages: ProcessingMessage[]): string[] {
  return messages
    .filter((m) => (m as { type?: string }).type === "planning_update")
    .map((m) => (m as { content?: string }).content ?? "");
}

// A configured provider stub for the find_model tool (no capabilities → no
// models). Enough to make the planner register the find_model tool.
const stubModelProvider = {
  getCapabilities: () => []
} as unknown as BaseProvider;

// Execution tools used only by formatToolsInfo (not registered in the loop).
class SchemaTool extends Tool {
  readonly name = "my_tool";
  readonly description = "does things";
  get inputSchema() {
    return {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a"]
    } as never;
  }
  async process(): Promise<unknown> {
    return "ok";
  }
}

class BareTool extends Tool {
  readonly name = "bare";
  readonly description = "bare tool";
  async process(): Promise<unknown> {
    return "ok";
  }
}

describe("GraphPlanner — coverage", () => {
  it("builds a graph from one submission, streams chunks, and formats tool-call messages", async () => {
    const script: ToolCall[] = [
      { id: "t1", name: "search_nodes", args: { query: "text" } },
      {
        id: "t2",
        name: "get_node_info",
        args: { node_type: "nodetool.text.Concat" }
      },
      { id: "t3", name: "list_nodes", args: { namespace: "nodetool.text" } },
      { id: "t4", name: "find_model", args: { capability: "text_to_image" } },
      { id: "t5", name: "unknown_tool", args: {} },
      {
        id: "t6",
        name: "submit_graph",
        args: {
          code: `const a = node("${AGENT_NODE_TYPE}", { prompt: "a" }, "n1");
node("${AGENT_NODE_TYPE}", { prompt: a.output() }, "n3");
return graph();`
        }
      }
    ];

    const provider = createScriptedProvider([script], {
      chunks: ["thinking..."]
    });
    const planner = new GraphPlanner({
      provider,
      model: "opus",
      registry: stubRegistry,
      providers: { openai: stubModelProvider }
    });

    const { messages, value } = await collect(
      planner.plan("Build a graph", createMockContext() as ProcessingContext)
    );

    expect(value).not.toBeNull();
    expect(value!.nodes).toHaveLength(2);
    expect(value!.edges).toHaveLength(1);
    expect(value!.edges[0]).toEqual({
      source: "n1",
      sourceHandle: "output",
      target: "n3",
      targetHandle: "prompt"
    });

    const tm = toolMessages(messages);
    expect(tm).toContain('Searching nodes for "text"');
    expect(tm).toContain("Inspecting nodetool.text.Concat");
    expect(tm).toContain("Listing nodes in nodetool.text");
    expect(tm).toContain("Finding model for text_to_image");
    expect(tm).toContain("Calling unknown_tool");
    expect(tm).toContain("Submitting workflow graph");

    // The streamed non-final chunk is forwarded.
    const chunkContents = messages
      .filter((m) => (m as { type?: string }).type === "chunk")
      .map((m) => (m as { content?: string }).content ?? "");
    expect(chunkContents).toContain("thinking...");

    // Success planning update.
    expect(
      planningContents(messages).some((c) => /Graph built: 2 nodes/.test(c))
    ).toBe(true);
  });

  it("prefers the LLM-authored _message over the formatted fallback", async () => {
    const script: ToolCall[] = [
      {
        id: "t1",
        name: "submit_graph",
        args: { code: VALID_PROGRAM, _message: "Custom status line" }
      }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script]),
      model: "opus",
      registry: stubRegistry
    });
    const { messages, value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).not.toBeNull();
    expect(toolMessages(messages)).toContain("Custom status line");
  });

  it("round-trips validation errors within one attempt (feedback rounds)", async () => {
    const capture: ProviderCapture = { toolResults: [] };
    // First submission: empty graph -> validation_failed as the tool result.
    // Second submission in the SAME attempt: fixed program -> accepted.
    const script: ToolCall[] = [
      { id: "s1", name: "submit_graph", args: { code: "return graph();" } },
      { id: "s2", name: "submit_graph", args: { code: VALID_PROGRAM } }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    const { value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).not.toBeNull();
    expect(value!.nodes).toHaveLength(1);

    // The failed round returned its errors to the model as the tool result.
    expect(capture.toolResults![0]).toContain("validation_failed");
    expect(capture.toolResults![0]).toContain("at least one node");
    expect(capture.toolResults![1]).toContain("graph_accepted");
  });

  it("returns code errors for a broken program as the tool result", async () => {
    const capture: ProviderCapture = { toolResults: [] };
    const script: ToolCall[] = [
      { id: "s1", name: "submit_graph", args: { code: "const x = ;" } },
      { id: "s2", name: "submit_graph", args: { code: VALID_PROGRAM } }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    const { value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).not.toBeNull();
    expect(capture.toolResults![0]).toContain("code_error");
  });

  it("rejects unknown node types", async () => {
    const capture: ProviderCapture = { toolResults: [] };
    const script: ToolCall[] = [
      {
        id: "s1",
        name: "submit_graph",
        args: {
          code: `node("nodetool.made.Up", {});
return graph();`
        }
      }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script]),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    const { value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).toBeNull();

    const planner2 = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    await collect(planner2.plan("obj", createMockContext() as ProcessingContext));
    expect(capture.toolResults![0]).toContain("Unknown node type: 'nodetool.made.Up'");
  });

  it("rejects an Agent node with no prompt property and no prompt edge", async () => {
    const capture: ProviderCapture = { toolResults: [] };
    const script: ToolCall[] = [
      {
        id: "s1",
        name: "submit_graph",
        args: {
          code: `node("${AGENT_NODE_TYPE}", {});
return graph();`
        }
      }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    const { value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).toBeNull();
    expect(capture.toolResults![0]).toContain('needs a \\"prompt\\"');
  });

  it("retries after a failed attempt and carries the last program into the retry prompt", async () => {
    const capture: ProviderCapture = {};
    // Attempt 0: one invalid submission, then the model stops.
    // Attempt 1: fixed submission -> success.
    const attempt0: ToolCall[] = [
      { id: "s0", name: "submit_graph", args: { code: "return graph();" } }
    ];
    const attempt1: ToolCall[] = [
      { id: "s1", name: "submit_graph", args: { code: VALID_PROGRAM } }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([attempt0, attempt1], { capture }),
      model: "opus",
      registry: stubRegistry
    });
    const { messages, value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).not.toBeNull();
    expect(value!.nodes).toHaveLength(1);
    expect(
      planningContents(messages).some((c) => c.includes("Retry attempt 2/3"))
    ).toBe(true);

    // The retry turn showed the model its previous program and the errors.
    const msgs = capture.lastArgs!.messages;
    const retryMsg = msgs[msgs.length - 1];
    expect(retryMsg.role).toBe("user");
    expect(retryMsg.content).toContain("return graph();");
    expect(retryMsg.content).toContain("at least one node");
    expect(retryMsg.content).toContain("FULL corrected program");
  });

  it("renders caller inputs into the planning prompt", async () => {
    const capture: ProviderCapture = {};
    const script: ToolCall[] = [
      { id: "s1", name: "submit_graph", args: { code: VALID_PROGRAM } }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry,
      inputs: { prompt: "a red fox", count: 3 }
    });
    await collect(planner.plan("obj", createMockContext() as ProcessingContext));

    const userPrompt = capture.lastArgs!.messages[1].content;
    expect(userPrompt).toContain('- prompt: "a red fox"');
    expect(userPrompt).toContain("- count: 3");
    expect(userPrompt).toContain("nodetool.input.");
  });

  it("returns null after all attempts fail (no submit_graph)", async () => {
    // Every attempt yields no tool calls at all.
    const planner = new GraphPlanner({
      provider: createScriptedProvider([[], []]),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 2
    });
    const { messages, value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).toBeNull();

    const chunkContents = messages
      .filter((m) => (m as { type?: string }).type === "chunk")
      .map((m) => (m as { content?: string }).content ?? "");
    expect(
      chunkContents.some((c) =>
        c.includes("Failed to build workflow graph after 2 attempts")
      )
    ).toBe(true);
    expect(
      planningContents(messages).some((c) =>
        c.includes("Graph building failed after 2 attempts")
      )
    ).toBe(true);
  });

  it("reports the stopped-without-submit error", async () => {
    const attempt: ToolCall[] = [
      { id: "t1", name: "search_nodes", args: { query: "text" } }
      // no submit_graph
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([attempt]),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    const { messages, value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).toBeNull();
    expect(
      planningContents(messages).some((c) =>
        c.includes("LLM stopped without calling submit_graph")
      )
    ).toBe(true);
  });

  it("reports exhaustion when the per-turn tool-call budget is spent", async () => {
    // 20 discovery calls with no submission -> hits the budget.
    const attempt: ToolCall[] = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`,
      name: "search_nodes",
      args: { query: `q${i}` }
    }));
    const planner = new GraphPlanner({
      provider: createScriptedProvider([attempt]),
      model: "opus",
      registry: stubRegistry,
      maxRetries: 1
    });
    const { messages, value } = await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    expect(value).toBeNull();
    expect(
      planningContents(messages).some((c) =>
        c.includes("Exceeded maximum tool calls (20)")
      )
    ).toBe(true);
  });

  it("uses a custom systemPrompt and renders outputSchema + execution tools", async () => {
    const capture: ProviderCapture = {};
    const script: ToolCall[] = [
      { id: "s1", name: "submit_graph", args: { code: VALID_PROGRAM } }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry,
      systemPrompt: "CUSTOM SYSTEM PROMPT",
      outputSchema: {
        type: "object",
        properties: { summary: { type: "string" } }
      },
      tools: [new SchemaTool(), new BareTool()]
    });

    const { value } = await collect(
      planner.plan("Do the thing", createMockContext() as ProcessingContext)
    );
    expect(value).not.toBeNull();

    const msgs = capture.lastArgs!.messages;
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toBe("CUSTOM SYSTEM PROMPT");

    const userPrompt = msgs[1].content;
    expect(userPrompt).toContain("Do the thing");
    // outputSchema serialized into the prompt.
    expect(userPrompt).toContain('"summary"');
    // Execution-tools formatting: schema tool shows required/optional args.
    expect(userPrompt).toContain("- my_tool: does things | Args: a (required), b");
    // Bare tool has no properties -> no Args suffix.
    expect(userPrompt).toContain("- bare: bare tool");
    expect(userPrompt).not.toContain("- bare: bare tool | Args");
  });

  it('renders "None specified" when no outputSchema is given', async () => {
    const capture: ProviderCapture = {};
    const script: ToolCall[] = [
      { id: "s1", name: "submit_graph", args: { code: VALID_PROGRAM } }
    ];
    const planner = new GraphPlanner({
      provider: createScriptedProvider([script], { capture }),
      model: "opus",
      registry: stubRegistry
    });
    await collect(
      planner.plan("obj", createMockContext() as ProcessingContext)
    );
    const userPrompt = capture.lastArgs!.messages[1].content;
    expect(userPrompt).toContain("None specified");
    expect(userPrompt).toContain("No execution tools available.");
  });
});
