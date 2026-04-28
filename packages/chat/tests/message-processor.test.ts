import { describe, it, expect, vi } from "vitest";
import {
  processChat,
  runTool,
  defaultSerializer
} from "../src/message-processor.js";
import type {
  Message,
  ToolCall,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool/runtime";
import type { ProcessingContext } from "@nodetool/runtime";
import type { Chunk } from "@nodetool/protocol";
import { Tool } from "@nodetool/agents";

// ---------------------------------------------------------------------------
// Mock Tool
// ---------------------------------------------------------------------------

class EchoTool extends Tool {
  readonly name = "echo";
  readonly description = "Echoes back the input";
  readonly inputSchema = {
    type: "object",
    properties: { text: { type: "string" } }
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return { echoed: params.text };
  }
}

class AddTool extends Tool {
  readonly name = "add";
  readonly description = "Adds two numbers";
  readonly inputSchema = {
    type: "object",
    properties: { a: { type: "number" }, b: { type: "number" } }
  };

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return { sum: (params.a as number) + (params.b as number) };
  }
}

// ---------------------------------------------------------------------------
// Mock Provider
// ---------------------------------------------------------------------------

function createMockProvider(sequences: ProviderStreamItem[][]) {
  let callIndex = 0;
  return {
    provider: "mock",
    hasToolSupport: async () => true,
    generateMessages: async function* (_args: {
      messages: Message[];
      model: string;
      tools?: ProviderTool[];
    }): AsyncGenerator<ProviderStreamItem> {
      const seq = sequences[callIndex] ?? [];
      callIndex++;
      for (const item of seq) {
        yield item;
      }
    },
    async *generateMessagesTraced(...args: any[]) {
      yield* (this as any).generateMessages(...args);
    },
    async generateMessageTraced(...args: any[]) {
      return (this as any).generateMessage(...args);
    },
    generateMessage: vi.fn(),
    getAvailableLanguageModels: vi.fn().mockResolvedValue([]),
    getAvailableImageModels: vi.fn().mockResolvedValue([]),
    getAvailableVideoModels: vi.fn().mockResolvedValue([]),
    getAvailableTTSModels: vi.fn().mockResolvedValue([]),
    getAvailableASRModels: vi.fn().mockResolvedValue([]),
    getAvailableEmbeddingModels: vi.fn().mockResolvedValue([]),
    getContainerEnv: () => ({}),
    textToImage: vi.fn(),
    imageToImage: vi.fn(),
    textToSpeech: vi.fn(),
    automaticSpeechRecognition: vi.fn(),
    textToVideo: vi.fn(),
    imageToVideo: vi.fn(),
    generateEmbedding: vi.fn(),
    isContextLengthError: () => false
  } as any;
}

function createMockContext(): ProcessingContext {
  return {} as any;
}

function chunk(content: string): Chunk {
  return { type: "chunk", content, done: false };
}

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>
): ToolCall {
  return { id, name, args };
}

// ---------------------------------------------------------------------------
// defaultSerializer tests
// ---------------------------------------------------------------------------

describe("defaultSerializer", () => {
  it("calls toJSON on objects that have it", () => {
    const value = { toJSON: () => ({ serialized: true }) };
    expect(defaultSerializer("key", value)).toEqual({ serialized: true });
  });

  it("returns primitive values unchanged", () => {
    expect(defaultSerializer("key", 42)).toBe(42);
    expect(defaultSerializer("key", "hello")).toBe("hello");
    expect(defaultSerializer("key", null)).toBeNull();
  });

  it("returns objects without toJSON unchanged", () => {
    const obj = { a: 1 };
    expect(defaultSerializer("key", obj)).toBe(obj);
  });
});

// ---------------------------------------------------------------------------
// runTool tests
// ---------------------------------------------------------------------------

describe("runTool", () => {
  it("finds and executes a tool, returning the result", async () => {
    const ctx = createMockContext();
    const tools = [new EchoTool()];
    const tc: ToolCall = { id: "tc1", name: "echo", args: { text: "hello" } };

    const result = await runTool(ctx, tc, tools);

    expect(result.id).toBe("tc1");
    expect(result.name).toBe("echo");
    expect(result.args).toEqual({ text: "hello" });
    expect((result as any).result).toEqual({ echoed: "hello" });
  });

  it("throws when the tool is not found", async () => {
    const ctx = createMockContext();
    const tools = [new EchoTool()];
    const tc: ToolCall = { id: "tc2", name: "nonexistent", args: {} };

    await expect(runTool(ctx, tc, tools)).rejects.toThrow(
      'Tool "nonexistent" not found'
    );
  });
});

// ---------------------------------------------------------------------------
// processChat tests
// ---------------------------------------------------------------------------

describe("processChat", () => {
  it("returns assembled assistant message for a simple text response", async () => {
    const provider = createMockProvider([[chunk("Hello "), chunk("world!")]]);

    const messages: Message[] = [];
    const result = await processChat({
      userInput: "Hi",
      messages,
      model: "test-model",
      provider,
      context: createMockContext()
    });

    // Should have user message + assistant message
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: "user", content: "Hi" });
    expect(result[1]).toEqual({ role: "assistant", content: "Hello world!" });
  });

  it("executes a tool call and feeds result back for final response", async () => {
    const provider = createMockProvider([
      // First round: tool call
      [toolCall("tc1", "echo", { text: "ping" })],
      // Second round: final text after tool result
      [chunk("Got it: pong")]
    ]);

    const messages: Message[] = [];
    const result = await processChat({
      userInput: "Echo ping",
      messages,
      model: "test-model",
      provider,
      context: createMockContext(),
      tools: [new EchoTool()]
    });

    // user, assistant (tool_calls), tool (result), assistant (final text)
    expect(result.some((m) => m.role === "tool")).toBe(true);
    const toolMsg = result.find((m) => m.role === "tool");
    expect(toolMsg?.toolCallId).toBe("tc1");
    expect(JSON.parse(toolMsg!.content as string)).toEqual({ echoed: "ping" });

    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toBe("Got it: pong");
  });

  it("invokes onChunk, onToolCall, and onToolResult callbacks", async () => {
    const onChunk = vi.fn();
    const onToolCall = vi.fn();
    const onToolResult = vi.fn();

    const provider = createMockProvider([
      [chunk("Thinking..."), toolCall("tc1", "echo", { text: "x" })],
      [chunk("Done")]
    ]);

    await processChat({
      userInput: "test",
      messages: [],
      model: "test-model",
      provider,
      context: createMockContext(),
      tools: [new EchoTool()],
      callbacks: { onChunk, onToolCall, onToolResult }
    });

    expect(onChunk).toHaveBeenCalledWith("Thinking...");
    expect(onChunk).toHaveBeenCalledWith("Done");
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tc1", name: "echo" })
    );
    expect(onToolResult).toHaveBeenCalledTimes(1);
    expect(onToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tc1" }),
      { echoed: "x" }
    );
  });

  it("handles multiple tool calls in sequence across rounds", async () => {
    const provider = createMockProvider([
      // First round: two tool calls
      [
        toolCall("tc1", "echo", { text: "a" }),
        toolCall("tc2", "add", { a: 1, b: 2 })
      ],
      // Second round: final text
      [chunk("All done")]
    ]);

    const messages: Message[] = [];
    const result = await processChat({
      userInput: "Do both",
      messages,
      model: "test-model",
      provider,
      context: createMockContext(),
      tools: [new EchoTool(), new AddTool()]
    });

    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);

    const echoResult = JSON.parse(toolMsgs[0].content as string);
    expect(echoResult).toEqual({ echoed: "a" });

    const addResult = JSON.parse(toolMsgs[1].content as string);
    expect(addResult).toEqual({ sum: 3 });

    const lastMsg = result[result.length - 1];
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toBe("All done");
  });

  it("handles chunks with null/undefined content", async () => {
    const provider = createMockProvider([
      [
        { type: "chunk", content: undefined, done: false } as unknown as Chunk,
        chunk("hello")
      ]
    ]);

    const result = await processChat({
      userInput: "Hi",
      messages: [],
      model: "test-model",
      provider,
      context: createMockContext()
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ role: "assistant", content: "hello" });
  });

  it("executes multiple tool calls in a single round in parallel", async () => {
    const executionLog: string[] = [];

    class SlowTool extends Tool {
      readonly name = "slow";
      readonly description = "Sleeps briefly";
      readonly inputSchema = {
        type: "object",
        properties: { id: { type: "string" } }
      };
      async process(
        _ctx: ProcessingContext,
        params: Record<string, unknown>
      ): Promise<unknown> {
        executionLog.push(`start_${params.id}`);
        await new Promise((r) => setTimeout(r, 50));
        executionLog.push(`end_${params.id}`);
        return { id: params.id };
      }
    }

    const provider = createMockProvider([
      // Single round with two tool calls
      [
        toolCall("tc1", "slow", { id: "a" }),
        toolCall("tc2", "slow", { id: "b" })
      ],
      // Final text
      [chunk("Done")]
    ]);

    await processChat({
      userInput: "Go",
      messages: [],
      model: "test-model",
      provider,
      context: createMockContext(),
      tools: [new SlowTool()]
    });

    // If parallel: both start before either finishes
    expect(executionLog[0]).toBe("start_a");
    expect(executionLog[1]).toBe("start_b");
    // Both ends come after both starts
    expect(executionLog.slice(2).sort()).toEqual(["end_a", "end_b"]);
  });

  it("works with no tools provided", async () => {
    const provider = createMockProvider([[chunk("Simple reply")]]);

    const result = await processChat({
      userInput: "Hello",
      messages: [],
      model: "test-model",
      provider,
      context: createMockContext()
    });

    expect(result).toHaveLength(2);
    expect(result[1].content).toBe("Simple reply");
  });
});
