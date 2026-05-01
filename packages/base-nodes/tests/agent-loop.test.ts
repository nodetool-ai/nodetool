import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/nodes/agents.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

function createMockContext(providerFactory: () => any): ProcessingContext {
  return {
    getProvider: vi.fn().mockImplementation(async () => providerFactory())
  } as unknown as ProcessingContext;
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
    }
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
      }
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
});
