import { describe, it, expect } from "vitest";
import {
  FakeProvider,
  createSimpleFakeProvider,
  createStreamingFakeProvider,
  createToolCallingFakeProvider,
  createFakeToolCall,
} from "../../src/providers/fake-provider.js";
import type { ToolCall } from "../../src/providers/types.js";

describe("FakeProvider constructor", () => {
  it("uses default options", () => {
    const provider = new FakeProvider();
    expect(provider.textResponse).toBe("Hello, this is a fake response!");
    expect(provider.toolCalls).toEqual([]);
    expect(provider.shouldStream).toBe(true);
    expect(provider.chunkSize).toBe(10);
    expect(provider.customResponseFn).toBeNull();
    expect(provider.callCount).toBe(0);
    expect(provider.lastMessages).toBeNull();
    expect(provider.lastModel).toBeNull();
    expect(provider.lastTools).toEqual([]);
  });

  it("accepts custom options", () => {
    const fn = () => "custom";
    const provider = new FakeProvider({
      textResponse: "custom text",
      toolCalls: [{ id: "1", name: "tool1", args: {} }],
      shouldStream: false,
      chunkSize: 20,
      customResponseFn: fn,
    });
    expect(provider.textResponse).toBe("custom text");
    expect(provider.toolCalls).toHaveLength(1);
    expect(provider.shouldStream).toBe(false);
    expect(provider.chunkSize).toBe(20);
    expect(provider.customResponseFn).toBe(fn);
  });
});

describe("FakeProvider.generateMessage", () => {
  it("returns text response", async () => {
    const provider = new FakeProvider({ textResponse: "Hello!" });
    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "Hi" }],
      model: "fake-model",
    });
    expect(result.role).toBe("assistant");
    expect(result.content).toEqual([{ type: "text", text: "Hello!" }]);
    expect(provider.callCount).toBe(1);
    expect(provider.lastModel).toBe("fake-model");
    expect(provider.lastMessages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("returns tool calls when configured", async () => {
    const tc: ToolCall = { id: "t1", name: "search", args: { q: "test" } };
    const provider = new FakeProvider({ toolCalls: [tc] });
    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "search" }],
      model: "m",
    });
    expect(result.role).toBe("assistant");
    expect(result.content).toEqual([]);
    expect(result.toolCalls).toEqual([tc]);
  });

  it("uses customResponseFn", async () => {
    const provider = new FakeProvider({
      customResponseFn: (msgs, model) => `Model: ${model}, count: ${msgs.length}`,
    });
    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }],
      model: "test-model",
    });
    expect(result.content).toEqual([{ type: "text", text: "Model: test-model, count: 2" }]);
  });

  it("uses customResponseFn returning tool calls", async () => {
    const tc: ToolCall = { id: "c1", name: "fn", args: {} };
    const provider = new FakeProvider({
      customResponseFn: () => [tc],
    });
    const result = await provider.generateMessage({
      messages: [{ role: "user", content: "x" }],
      model: "m",
    });
    expect(result.toolCalls).toEqual([tc]);
    expect(result.content).toEqual([]);
  });

  it("records tools", async () => {
    const provider = new FakeProvider();
    await provider.generateMessage({
      messages: [{ role: "user", content: "x" }],
      model: "m",
      tools: [{ name: "t1", description: "desc" }],
    });
    expect(provider.lastTools).toEqual([{ name: "t1", description: "desc" }]);
  });
});

describe("FakeProvider.generateMessages (streaming)", () => {
  it("streams text in chunks", async () => {
    const provider = new FakeProvider({
      textResponse: "Hello, world! This is a test.",
      shouldStream: true,
      chunkSize: 10,
    });
    const chunks: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      chunks.push(item);
    }
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].done).toBe(true);
    const text = chunks.map((c) => c.content).join("");
    expect(text).toBe("Hello, world! This is a test.");
    expect(provider.callCount).toBe(1);
  });

  it("yields single chunk when not streaming", async () => {
    const provider = new FakeProvider({
      textResponse: "Short",
      shouldStream: false,
    });
    const chunks: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      chunks.push(item);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Short");
    expect(chunks[0].done).toBe(true);
  });

  it("yields single chunk when text is shorter than chunkSize", async () => {
    const provider = new FakeProvider({
      textResponse: "Hi",
      shouldStream: true,
      chunkSize: 10,
    });
    const chunks: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      chunks.push(item);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Hi");
    expect(chunks[0].done).toBe(true);
  });

  it("streams tool calls", async () => {
    const tc1: ToolCall = { id: "t1", name: "fn1", args: {} };
    const tc2: ToolCall = { id: "t2", name: "fn2", args: { x: 1 } };
    const provider = new FakeProvider({ toolCalls: [tc1, tc2] });
    const items: any[] = [];
    for await (const item of provider.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(tc1);
    expect(items[1]).toEqual(tc2);
  });

  it("records tools in streaming mode", async () => {
    const provider = new FakeProvider();
    for await (const _ of provider.generateMessages({
      messages: [{ role: "user", content: "x" }],
      model: "m",
      tools: [{ name: "t1" }],
    })) {
      // consume
    }
    expect(provider.lastTools).toEqual([{ name: "t1" }]);
  });
});

describe("FakeProvider.resetCallCount", () => {
  it("resets the call count", async () => {
    const provider = new FakeProvider();
    await provider.generateMessage({ messages: [], model: "m" });
    await provider.generateMessage({ messages: [], model: "m" });
    expect(provider.callCount).toBe(2);
    provider.resetCallCount();
    expect(provider.callCount).toBe(0);
  });
});

describe("FakeProvider.getAvailableLanguageModels", () => {
  it("returns fake models", async () => {
    const provider = new FakeProvider();
    const models = await provider.getAvailableLanguageModels();
    expect(models).toHaveLength(3);
    expect(models[0].id).toBe("fake-model-v1");
    expect(models[0].provider).toBe("fake");
  });
});

describe("createFakeToolCall", () => {
  it("creates a tool call with defaults", () => {
    const tc = createFakeToolCall("myTool");
    expect(tc.name).toBe("myTool");
    expect(tc.args).toEqual({});
    expect(tc.id).toBeTruthy();
  });

  it("creates a tool call with custom args and id", () => {
    const tc = createFakeToolCall("myTool", { key: "val" }, "custom-id");
    expect(tc.name).toBe("myTool");
    expect(tc.args).toEqual({ key: "val" });
    expect(tc.id).toBe("custom-id");
  });
});

describe("createSimpleFakeProvider", () => {
  it("creates a non-streaming provider with default text", () => {
    const p = createSimpleFakeProvider();
    expect(p.textResponse).toBe("Test response");
    expect(p.shouldStream).toBe(false);
  });

  it("creates a non-streaming provider with custom text", () => {
    const p = createSimpleFakeProvider("Custom");
    expect(p.textResponse).toBe("Custom");
  });
});

describe("createStreamingFakeProvider", () => {
  it("creates a streaming provider with defaults", () => {
    const p = createStreamingFakeProvider();
    expect(p.textResponse).toBe("This is a streaming test response");
    expect(p.shouldStream).toBe(true);
    expect(p.chunkSize).toBe(5);
  });

  it("creates a streaming provider with custom params", () => {
    const p = createStreamingFakeProvider("hello", 3);
    expect(p.textResponse).toBe("hello");
    expect(p.chunkSize).toBe(3);
  });
});

describe("createToolCallingFakeProvider", () => {
  it("creates a provider with tool calls", () => {
    const calls: ToolCall[] = [{ id: "1", name: "fn", args: {} }];
    const p = createToolCallingFakeProvider(calls);
    expect(p.toolCalls).toEqual(calls);
  });
});
