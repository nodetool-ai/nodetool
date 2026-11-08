/**
 * Tests for ScriptedProvider — deterministic fake provider for E2E tests.
 */

import { describe, expect, it } from "vitest";
import {
  ScriptedProvider,
  planScript,
  stepScript,
  textScript,
  toolCallScript,
  autoScript,
  toolThenFinishScript
} from "../../src/providers/scripted-provider.js";
import type { ProviderTool, Message } from "../../src/providers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string): ProviderTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object", properties: {} }
  };
}

function makeMessages(content: string): Message[] {
  return [{ role: "user", content }];
}

async function collectStream(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------
// ScriptedProvider
// ---------------------------------------------------------------------------

describe("ScriptedProvider", () => {
  it("throws on empty scripts array", () => {
    expect(() => new ScriptedProvider([])).toThrow("at least one script");
  });

  it("yields text chunks from textScript", async () => {
    const provider = new ScriptedProvider([textScript("Hello!")]);
    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("test"),
        model: "fake"
      })
    );
    expect(items).toHaveLength(1);
    expect((items[0] as { type: string }).type).toBe("chunk");
    expect((items[0] as { content: string }).content).toBe("Hello!");
  });

  it("yields tool calls from toolCallScript", async () => {
    const provider = new ScriptedProvider([
      toolCallScript("calculator", { expression: "2+2" })
    ]);
    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("test"),
        model: "fake"
      })
    );
    expect(items).toHaveLength(1);
    expect((items[0] as { name: string }).name).toBe("calculator");
    expect((items[0] as { args: Record<string, unknown> }).args).toEqual({
      expression: "2+2"
    });
    // Should have an auto-generated id
    expect((items[0] as { id: string }).id).toBeTruthy();
  });

  it("preserves tool calls in generateMessage", async () => {
    const provider = new ScriptedProvider([
      toolCallScript("calculator", { expression: "2+2" })
    ]);
    const message = await provider.generateMessage({
      messages: makeMessages("test"),
      model: "fake"
    });
    expect(message.content).toBeNull();
    expect(message.toolCalls).toEqual([
      expect.objectContaining({
        name: "calculator",
        args: { expression: "2+2" }
      })
    ]);
  });

  it("marks only the final unspecified chunk as done", async () => {
    const provider = new ScriptedProvider([
      () => [
        { type: "chunk", content: "hel" },
        { type: "chunk", content: "lo" }
      ]
    ]);
    const items = await collectStream(
      provider.generateMessages({ messages: makeMessages("test"), model: "fake" })
    );
    expect(items).toMatchObject([{ done: false }, { done: true }]);
  });

  it("advances through scripts in sequence", async () => {
    const provider = new ScriptedProvider([
      textScript("first"),
      textScript("second"),
      textScript("third")
    ]);

    const items1 = await collectStream(
      provider.generateMessages({
        messages: makeMessages("a"),
        model: "fake"
      })
    );
    expect((items1[0] as { content: string }).content).toBe("first");

    const items2 = await collectStream(
      provider.generateMessages({
        messages: makeMessages("b"),
        model: "fake"
      })
    );
    expect((items2[0] as { content: string }).content).toBe("second");

    const items3 = await collectStream(
      provider.generateMessages({
        messages: makeMessages("c"),
        model: "fake"
      })
    );
    expect((items3[0] as { content: string }).content).toBe("third");
  });

  it("repeats last script when exhausted", async () => {
    const provider = new ScriptedProvider([textScript("only")]);

    await collectStream(
      provider.generateMessages({
        messages: makeMessages("1"),
        model: "fake"
      })
    );
    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("2"),
        model: "fake"
      })
    );
    expect((items[0] as { content: string }).content).toBe("only");
  });

  it("logs all calls", async () => {
    const provider = new ScriptedProvider([textScript("ok")]);
    const msgs = makeMessages("hello");
    const tools = [makeTool("t1")];

    await collectStream(
      provider.generateMessages({
        messages: msgs,
        model: "fake",
        tools
      })
    );

    expect(provider.callLog).toHaveLength(1);
    expect(provider.callLog[0].messages).toBe(msgs);
    expect(provider.callLog[0].tools).toBe(tools);
  });

  it("resets state correctly", async () => {
    const provider = new ScriptedProvider([
      textScript("first"),
      textScript("second")
    ]);

    await collectStream(
      provider.generateMessages({
        messages: makeMessages("a"),
        model: "fake"
      })
    );
    expect(provider.callLog).toHaveLength(1);

    provider.reset();
    expect(provider.callLog).toHaveLength(0);

    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("b"),
        model: "fake"
      })
    );
    // After reset, should start from first script again
    expect((items[0] as { content: string }).content).toBe("first");
  });

  it("generateMessage buffers chunks into content string", async () => {
    const provider = new ScriptedProvider([textScript("buffered content")]);
    const msg = await provider.generateMessage({
      messages: makeMessages("test"),
      model: "fake"
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("buffered content");
  });

  it("generateMessage returns the tool call when no text chunks exist", async () => {
    const provider = new ScriptedProvider([toolCallScript("some-tool", {})]);
    const msg = await provider.generateMessage({
      messages: makeMessages("test"),
      model: "fake"
    });
    expect(msg.content).toBeNull();
    expect(msg.toolCalls?.[0]).toMatchObject({ name: "some-tool", args: {} });
  });
});

// ---------------------------------------------------------------------------
// Script factory helpers
// ---------------------------------------------------------------------------

describe("planScript", () => {
  it("creates a create_task tool call", () => {
    const script = planScript({
      title: "Test Plan",
      steps: [{ id: "s1", instructions: "Do something" }]
    });
    const items = script([], []);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("tool_call");
    expect((items[0] as { name: string }).name).toBe("create_task");
    expect((items[0] as { args: { title: string } }).args.title).toBe(
      "Test Plan"
    );
  });
});

describe("stepScript", () => {
  it("creates a finish_step tool call", () => {
    const script = stepScript({ answer: 42 });
    const items = script([], []);
    expect(items).toHaveLength(1);
    expect((items[0] as { name: string }).name).toBe("finish_step");
    expect((items[0] as { args: { result: unknown } }).args.result).toEqual({
      answer: 42
    });
  });
});

describe("autoScript", () => {
  it("calls create_task when available and plan provided", () => {
    const script = autoScript({
      plan: { title: "Plan", steps: [] },
      result: "fallback"
    });
    const items = script([], [makeTool("create_task")]);
    expect((items[0] as { name: string }).name).toBe("create_task");
  });

  it("calls finish_step when available", () => {
    const script = autoScript({ result: "done" });
    const items = script([], [makeTool("finish_step")]);
    expect((items[0] as { name: string }).name).toBe("finish_step");
  });

  it("falls back to text chunk when no matching tools", () => {
    const script = autoScript({ text: "fallback text" });
    const items = script([], []);
    expect(items[0].type).toBe("chunk");
    expect((items[0] as { content: string }).content).toBe("fallback text");
  });

  it("answers a prompt carrying a JSON schema with a fenced object", () => {
    const script = autoScript({ text: "fallback text" });
    const schema = { type: "object", properties: { title: { type: "string" } } };
    const items = script(
      [{ role: "user", content: `<JSON_SCHEMA>\n${JSON.stringify(schema)}\n</JSON_SCHEMA>` }],
      []
    );
    expect((items[0] as { content: string }).content).toBe('```json\n{"title":"fake"}\n```');
  });

  it("uses default text when no text provided", () => {
    const script = autoScript({});
    const items = script([], []);
    expect((items[0] as { content: string }).content).toBe("Task completed.");
  });
});

describe("toolThenFinishScript", () => {
  it("returns two scripts: tool calls then finish", () => {
    const scripts = toolThenFinishScript(
      [{ name: "search", args: { query: "test" } }],
      { summary: "found it" }
    );
    expect(scripts).toHaveLength(2);

    // First script: tool calls
    const items1 = scripts[0]([], []);
    expect(items1).toHaveLength(1);
    expect((items1[0] as { name: string }).name).toBe("search");

    // Second script: finish_step
    const items2 = scripts[1]([], []);
    expect((items2[0] as { name: string }).name).toBe("finish_step");
    expect((items2[0] as { args: { result: unknown } }).args.result).toEqual({
      summary: "found it"
    });
  });

  it("supports multiple tool calls", () => {
    const scripts = toolThenFinishScript(
      [
        { name: "search", args: { query: "a" } },
        { name: "read", args: { file: "b.txt" } }
      ],
      "done"
    );

    const items = scripts[0]([], []);
    expect(items).toHaveLength(2);
    expect((items[0] as { name: string }).name).toBe("search");
    expect((items[1] as { name: string }).name).toBe("read");
  });
});

describe("ScriptedProvider endpoint scripting", () => {
  const OUT = { images: [{ url: "https://cdn.example/a.png" }] };

  it("still requires a script when no options are given", () => {
    expect(() => new ScriptedProvider([])).toThrow(
      "ScriptedProvider requires at least one script"
    );
    expect(new ScriptedProvider([textScript("hi")]).supportsEndpointCalls()).toBe(
      false
    );
  });

  it("answers endpoint calls per model, repeats the last reply and logs each request", async () => {
    const provider = new ScriptedProvider([], {
      providerId: "replicate",
      endpoints: {
        "owner/model": [
          { output: OUT, requestId: "pred-1", metadata: { cost: 1 } },
          { output: "second" }
        ],
        "*": { output: "fallback", requestId: null }
      }
    });
    expect(provider.provider).toBe("replicate");
    expect(provider.supportsEndpointCalls()).toBe(true);

    const first = await provider.callEndpoint({
      model: "owner/model",
      input: { prompt: "a" },
      route: "predictions"
    });
    const second = await provider.callEndpoint({ model: "owner/model", input: {} });
    const third = await provider.callEndpoint({ model: "owner/model", input: {} });
    const other = await provider.callEndpoint({ model: "other", input: {} });

    expect(first).toEqual({ output: OUT, requestId: "pred-1", metadata: { cost: 1 } });
    expect(second).toEqual({ output: "second", requestId: "scripted-request-2" });
    expect(third).toEqual({ output: "second", requestId: "scripted-request-3" });
    expect(other).toEqual({ output: "fallback", requestId: null });
    expect(provider.endpointCalls.map((call) => call.model)).toEqual([
      "owner/model",
      "owner/model",
      "owner/model",
      "other"
    ]);
    expect(provider.endpointCalls[0]).toEqual({
      model: "owner/model",
      input: { prompt: "a" },
      route: "predictions"
    });
  });

  it("reports scripted progress, throws scripted errors and refuses unscripted models", async () => {
    const provider = new ScriptedProvider([textScript("hi")]);
    provider
      .scriptEndpoint("slow", {
        output: 1,
        progress: [{ message: "IN_QUEUE" }, { progress: 0.5 }]
      })
      .scriptEndpoint("broken", new Error("vendor said no"));
    const events: unknown[] = [];

    await provider.callEndpoint({
      model: "slow",
      input: {},
      onProgress: (event) => events.push(event)
    });

    expect(events).toEqual([{ message: "IN_QUEUE" }, { progress: 0.5 }]);
    await expect(provider.callEndpoint({ model: "broken", input: {} })).rejects.toThrow(
      "vendor said no"
    );
    await expect(provider.callEndpoint({ model: "missing", input: {} })).rejects.toThrow(
      'ScriptedProvider has no scripted endpoint reply for "missing"'
    );
    expect(provider.endpointCalls).toHaveLength(3);
  });

  it("builds a reply from the request and honours an aborted signal", async () => {
    const provider = new ScriptedProvider([], {
      endpoints: { echo: (request) => ({ output: request.input }) }
    });
    const echoed = await provider.callEndpoint({ model: "echo", input: { n: 3 } });
    expect(echoed.output).toEqual({ n: 3 });

    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      provider.callEndpoint({ model: "echo", input: {}, signal: controller.signal })
    ).rejects.toThrow("cancelled");
  });

  it("returns deterministic upload URLs and downloads scripted or uploaded bytes", async () => {
    const provider = new ScriptedProvider([], {
      downloads: { "https://cdn.example/out.png": new Uint8Array([9]) }
    });
    const bytes = new Uint8Array([1, 2]);

    const url = await provider.uploadMedia({ bytes, mimeType: "image/png" });
    const named = await provider.uploadMedia({
      bytes,
      mimeType: "audio/wav",
      filename: "voice take.wav"
    });

    expect(url).toBe("https://scripted.invalid/uploads/1/upload");
    expect(named).toBe("https://scripted.invalid/uploads/2/voice%20take.wav");
    expect(await provider.downloadMedia(url)).toBe(bytes);
    expect([...(await provider.downloadMedia("https://cdn.example/out.png"))]).toEqual([9]);
    await expect(provider.downloadMedia("https://cdn.example/none.png")).rejects.toThrow(
      "ScriptedProvider has no scripted download for https://cdn.example/none.png"
    );
    expect(provider.uploadCalls.map((call) => call.url)).toEqual([url, named]);
    expect(provider.downloadCalls.map((call) => call.url)).toEqual([
      url,
      "https://cdn.example/out.png",
      "https://cdn.example/none.png"
    ]);
  });

  it("uses a custom upload URL and clears logs and cursors on reset", async () => {
    const provider = new ScriptedProvider([], {
      uploadUrl: (upload, index) => `https://fal.media/${index}/${upload.mimeType}`,
      endpoints: { m: [{ output: "a" }, { output: "b" }] }
    });
    expect(
      await provider.uploadMedia({ bytes: new Uint8Array([1]), mimeType: "image/png" })
    ).toBe("https://fal.media/1/image/png");
    await provider.callEndpoint({ model: "m", input: {} });

    provider.reset();

    expect(provider.uploadCalls).toEqual([]);
    expect(provider.endpointCalls).toEqual([]);
    expect((await provider.callEndpoint({ model: "m", input: {} })).output).toBe("a");
  });
});
