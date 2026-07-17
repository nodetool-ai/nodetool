import { describe, it, expect, vi } from "vitest";
// Import from source (not the package's stale dist) so the test exercises the
// current runAgentLoop. registerBuiltinAgentToolClasses must come from the same
// source module so it shares the builtin-tool registry runAgentLoop hydrates from.
import { runAgentLoop } from "../src/nodes/agents.js";
import { classifyProviderStream } from "../src/nodes/agent-utils.js";
import { registerBuiltinAgentToolClasses } from "../src/nodes/agent-tool-hydration.js";
import { BaseProvider } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

function createMockContext(providerFactory: () => any): ProcessingContext {
  return {
    getProvider: vi.fn().mockImplementation(async () => providerFactory())
  } as unknown as ProcessingContext;
}

// Delegate to the real base loop so these completion-style mocks (which only
// implement generateMessagesTraced) drive runAgentLoop through generateLoop.
function delegateGenerateLoop(this: any, args: unknown) {
  return (
    BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
  ).generateLoop.call(this, args);
}

function makeMockProvider(callSequences: Array<Array<any>>) {
  let callIndex = 0;
  return () => ({
    provider: "mock",
    generateMessages: async function* () {
      const items = callSequences[callIndex++] ?? [];
      for (const item of items) yield item;
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    generateLoop: delegateGenerateLoop
  });
}

describe("runAgentLoop", () => {
  it("returns text from single LLM call (no tools)", async () => {
    const provider = makeMockProvider([
      [
        { type: "chunk", content: "Hello ", done: false },
        { type: "chunk", content: "world", done: true }
      ]
    ]);
    const context = createMockContext(provider);
    const result = await runAgentLoop({
      context,
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "You are helpful.",
      prompt: "Say hello",
      tools: []
    });
    expect(result.text).toBe("Hello world");
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("executes tool and loops for second LLM call", async () => {
    const toolProcessFn = vi
      .fn()
      .mockResolvedValue({ success: true, stdout: "42\n" });
    const tools: any[] = [
      {
        name: "execute_bash",
        description: "Run a bash command",
        inputSchema: {
          type: "object",
          properties: { command: { type: "string" } },
          required: ["command"]
        },
        process: toolProcessFn
      }
    ];

    const provider = makeMockProvider([
      [
        { type: "chunk", content: "Let me check", done: false },
        { id: "tc_1", name: "execute_bash", args: { command: "echo 42" } }
      ],
      [{ type: "chunk", content: "The answer is 42", done: true }]
    ]);

    const context = createMockContext(provider);
    const result = await runAgentLoop({
      context,
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "You are helpful.",
      prompt: "What is the answer?",
      tools
    });

    expect(toolProcessFn).toHaveBeenCalledOnce();
    expect(toolProcessFn).toHaveBeenCalledWith(expect.anything(), {
      command: "echo 42"
    });
    expect(result.text).toBe("The answer is 42");
  });

  it("handles multiple tool calls in one iteration", async () => {
    const toolA = vi.fn().mockResolvedValue({ result: "a" });
    const toolB = vi.fn().mockResolvedValue({ result: "b" });
    const tools: any[] = [
      { name: "tool_a", process: toolA, inputSchema: {} },
      { name: "tool_b", process: toolB, inputSchema: {} }
    ];

    const provider = makeMockProvider([
      [
        { id: "tc_a", name: "tool_a", args: { x: 1 } },
        { id: "tc_b", name: "tool_b", args: { y: 2 } }
      ],
      [{ type: "chunk", content: "Both done", done: true }]
    ]);

    const context = createMockContext(provider);
    const result = await runAgentLoop({
      context,
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "do both",
      tools
    });

    expect(toolA).toHaveBeenCalledOnce();
    expect(toolB).toHaveBeenCalledOnce();
    expect(result.text).toBe("Both done");
  });

  it("stops after maxIterations", async () => {
    const provider = makeMockProvider(
      Array.from({ length: 5 }, () => [
        { type: "chunk", content: "thinking...", done: false },
        { id: "tc_loop", name: "execute_bash", args: { command: "echo loop" } }
      ])
    );

    const tools: any[] = [
      {
        name: "execute_bash",
        process: vi.fn().mockResolvedValue({ success: true, stdout: "loop\n" }),
        inputSchema: {}
      }
    ];

    const context = createMockContext(provider);
    const result = await runAgentLoop({
      context,
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "go",
      tools,
      maxIterations: 3
    });

    expect(tools[0].process).toHaveBeenCalledTimes(3);
    expect(result.text).toBeTruthy();
  });

  it("throws when provider resolution fails", async () => {
    const context = {
      getProvider: vi.fn().mockRejectedValue(new Error("No such provider"))
    } as unknown as ProcessingContext;

    await expect(
      runAgentLoop({
        context,
        providerId: "nonexistent",
        modelId: "test-model",
        systemPrompt: "sys",
        prompt: "go",
        tools: []
      })
    ).rejects.toThrow("No such provider");
  });

  it("includes contentParts in user message", async () => {
    let capturedMessages: any[] = [];
    const provider = () => ({
      provider: "mock",
      generateMessages: async function* (args: any) {
        capturedMessages = args.messages;
        yield {
          type: "chunk" as const,
          content: "I see the image",
          done: true
        };
      },
      async *generateMessagesTraced(...args: any[]) {
        yield* (this as any).generateMessages(...args);
      },
      generateLoop: delegateGenerateLoop
    });

    const context = createMockContext(provider);
    const imagePart = {
      type: "image" as const,
      image: { data: "abc123", mimeType: "image/png" }
    };

    const result = await runAgentLoop({
      context,
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "describe this",
      tools: [],
      contentParts: [imagePart]
    });

    expect(result.text).toBe("I see the image");
    const userMsg = capturedMessages.find((m: any) => m.role === "user");
    expect(Array.isArray(userMsg?.content)).toBe(true);
    expect(userMsg.content).toHaveLength(2);
    expect(userMsg.content[1].type).toBe("image");
  });

  it("streams text deltas via onText", async () => {
    const provider = makeMockProvider([
      [
        { type: "chunk", content: "Navi", done: false },
        { type: "chunk", content: "gating", done: true }
      ]
    ]);
    const deltas: string[] = [];
    const result = await runAgentLoop({
      context: createMockContext(provider),
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "go",
      tools: [],
      onText: (d) => deltas.push(d)
    });
    expect(deltas).toEqual(["Navi", "gating"]);
    expect(result.text).toBe("Navigating");
  });

  it("emits a tool_call chunk via onToolCall before the tool runs", async () => {
    const order: string[] = [];
    const toolFn = vi.fn().mockImplementation(async () => {
      order.push("tool-ran");
      return { ok: true };
    });
    const tools: any[] = [
      { name: "browser_navigate", process: toolFn, inputSchema: {} }
    ];
    const provider = makeMockProvider([
      [{ id: "tc1", name: "browser_navigate", args: { url: "https://x.test" } }],
      [{ type: "chunk", content: "done", done: true }]
    ]);

    const toolCallChunks: any[] = [];
    await runAgentLoop({
      context: createMockContext(provider),
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "navigate",
      tools,
      onToolCall: (chunk) => {
        order.push("chunk");
        toolCallChunks.push(chunk);
      }
    });

    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0]).toMatchObject({
      type: "chunk",
      content_type: "tool_call",
      content_metadata: { tool_name: "browser_navigate" }
    });
    expect(toolCallChunks[0].content).toContain("browser_navigate");
    // Fired before the tool executed.
    expect(order).toEqual(["chunk", "tool-ran"]);
  });

  it("hydrates a bare name-stub into a registered builtin tool and runs it", async () => {
    const ran = vi.fn().mockResolvedValue({ ok: true });
    class FakeBuiltinTool {
      readonly name = "fake_builtin_hydration_tool";
      readonly description = "fake";
      readonly inputSchema = { type: "object", properties: {} };
      process = ran;
    }
    registerBuiltinAgentToolClasses([FakeBuiltinTool as any]);

    const provider = makeMockProvider([
      [{ id: "t1", name: "fake_builtin_hydration_tool", args: { a: 1 } }],
      [{ type: "chunk", content: "ok", done: true }]
    ]);

    // Pass a bare stub (no process) — runAgentLoop must hydrate it from the
    // registry, otherwise the call is rejected as "Unknown tool" and `ran`
    // never fires.
    const result = await runAgentLoop({
      context: createMockContext(provider),
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "use the tool",
      tools: [{ name: "fake_builtin_hydration_tool" } as any]
    });

    expect(ran).toHaveBeenCalledOnce();
    expect(ran).toHaveBeenCalledWith(expect.anything(), { a: 1 });
    expect(result.text).toBe("ok");
  });

  it("keeps tool_call chunks out of the text output and onText stream", async () => {
    const provider = makeMockProvider([
      [
        { type: "chunk", content: "The result is ", content_type: "text", done: false },
        // A provider that streams the tool call as a tool_call chunk — must NOT
        // land in `text` or the onText stream.
        {
          type: "chunk",
          content: 'browser_navigate({"url":"https://x"})',
          content_type: "tool_call",
          done: false
        },
        { type: "chunk", content: "ready.", content_type: "text", done: true }
      ]
    ]);
    const deltas: string[] = [];
    const result = await runAgentLoop({
      context: createMockContext(provider),
      providerId: "mock",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "go",
      tools: [],
      onText: (d) => deltas.push(d)
    });
    expect(result.text).toBe("The result is ready.");
    expect(result.text).not.toContain("browser_navigate");
    expect(deltas).toEqual(["The result is ", "ready."]);
  });

  it("drives tools when the provider runs its OWN loop (agent SDK style)", async () => {
    // The agent SDK provider's generateMessages is tool-free (mcp: null) — tools
    // only reach the model through the provider's own generateLoop. This mock
    // mirrors that: the single-turn primitives yield no tool calls, but the
    // generateLoop override drives the scripted call by dispatching to the
    // provider tool's own `execute` (the new mechanism, matching how the real
    // Claude Agent SDK provider runs tools) and translates the result into
    // ToolCall + tool-result message events.
    const toolFn = vi.fn().mockResolvedValue({ ok: true, value: 7 });
    const tools: any[] = [
      { name: "sdk_tool", process: toolFn, inputSchema: {} }
    ];
    const scriptedCall = { id: "tc_sdk", name: "sdk_tool", args: { q: "x" } };

    const provider = () => ({
      provider: "sdk_loop",
      // Tool-free single-turn primitives — never surface the tool call.
      async *generateMessages() {
        yield { type: "chunk", content: "", done: true };
      },
      async *generateMessagesTraced() {
        yield { type: "chunk", content: "", done: true };
      },
      async *generateLoop(args: any) {
        yield scriptedCall;
        const tool = (args.tools ?? []).find(
          (t: any) => t.name === scriptedCall.name
        );
        const content = tool?.execute
          ? await tool.execute(scriptedCall.args)
          : args.executeTool
            ? await args.executeTool(scriptedCall)
            : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: scriptedCall.id,
            content
          }
        };
        yield { type: "chunk", content: "Tool says 7", done: true };
        yield {
          type: "message",
          message: { role: "assistant", content: "Tool says 7" }
        };
      }
    });

    const toolCallChunks: any[] = [];
    const result = await runAgentLoop({
      context: createMockContext(provider),
      providerId: "sdk_loop",
      modelId: "test-model",
      systemPrompt: "sys",
      prompt: "use sdk tool",
      tools,
      onToolCall: (c) => toolCallChunks.push(c)
    });

    // The tool ran via the provider's own loop, even though the single-turn
    // primitive never emitted a tool call.
    expect(toolFn).toHaveBeenCalledOnce();
    expect(toolFn).toHaveBeenCalledWith(expect.anything(), { q: "x" });
    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].content_metadata.tool_name).toBe("sdk_tool");
    expect(result.text).toBe("Tool says 7");
    // The streamed tool-result message landed in the returned conversation.
    expect(result.messages.some((m: any) => m.role === "tool")).toBe(true);
  });
});

describe("classifyProviderStream", () => {
  it("maps each raw stream item to its typed event, splitting message roles", async () => {
    async function* raw() {
      yield { id: "t1", name: "search", args: { q: "x" } }; // tool call
      yield { type: "chunk", content: "reasoning", thinking: true }; // thinking
      yield { type: "chunk", content: "AAA", content_type: "audio" }; // audio
      yield { type: "chunk", content: "hi", content_type: "text" }; // text
      yield { type: "chunk", content: "no-type" }; // normalized to text
      yield { type: "message", message: { role: "assistant", content: "done" } };
      yield { type: "message", message: { role: "tool", content: "result" } };
    }
    const events: any[] = [];
    for await (const ev of classifyProviderStream(raw())) events.push(ev);
    expect(events.map((e) => e.kind)).toEqual([
      "tool_call",
      "thinking",
      "audio",
      "text",
      "text",
      "assistant_message",
      "tool_message"
    ]);
    expect(events[0].toolCall.name).toBe("search");
    expect(events[3].delta).toBe("hi");
    // A chunk lacking content_type is normalized to text with content_type set.
    expect(events[4].chunk.content_type).toBe("text");
    expect(events[5].message.role).toBe("assistant");
  });
});
