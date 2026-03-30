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
  toolThenFinishScript,
} from "../../src/providers/scripted-provider.js";
import type { ProviderTool, Message } from "../../src/providers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string): ProviderTool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object", properties: {} },
  };
}

function makeMessages(content: string): Message[] {
  return [{ role: "user", content }];
}

async function collectStream(
  gen: AsyncGenerator<unknown>,
): Promise<unknown[]> {
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
        model: "fake",
      }),
    );
    expect(items).toHaveLength(1);
    expect((items[0] as { type: string }).type).toBe("chunk");
    expect((items[0] as { content: string }).content).toBe("Hello!");
  });

  it("yields tool calls from toolCallScript", async () => {
    const provider = new ScriptedProvider([
      toolCallScript("calculator", { expression: "2+2" }),
    ]);
    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("test"),
        model: "fake",
      }),
    );
    expect(items).toHaveLength(1);
    expect((items[0] as { name: string }).name).toBe("calculator");
    expect((items[0] as { args: Record<string, unknown> }).args).toEqual({
      expression: "2+2",
    });
    // Should have an auto-generated id
    expect((items[0] as { id: string }).id).toBeTruthy();
  });

  it("advances through scripts in sequence", async () => {
    const provider = new ScriptedProvider([
      textScript("first"),
      textScript("second"),
      textScript("third"),
    ]);

    const items1 = await collectStream(
      provider.generateMessages({
        messages: makeMessages("a"),
        model: "fake",
      }),
    );
    expect((items1[0] as { content: string }).content).toBe("first");

    const items2 = await collectStream(
      provider.generateMessages({
        messages: makeMessages("b"),
        model: "fake",
      }),
    );
    expect((items2[0] as { content: string }).content).toBe("second");

    const items3 = await collectStream(
      provider.generateMessages({
        messages: makeMessages("c"),
        model: "fake",
      }),
    );
    expect((items3[0] as { content: string }).content).toBe("third");
  });

  it("repeats last script when exhausted", async () => {
    const provider = new ScriptedProvider([
      textScript("only"),
    ]);

    await collectStream(
      provider.generateMessages({
        messages: makeMessages("1"),
        model: "fake",
      }),
    );
    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("2"),
        model: "fake",
      }),
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
        tools,
      }),
    );

    expect(provider.callLog).toHaveLength(1);
    expect(provider.callLog[0].messages).toBe(msgs);
    expect(provider.callLog[0].tools).toBe(tools);
  });

  it("resets state correctly", async () => {
    const provider = new ScriptedProvider([
      textScript("first"),
      textScript("second"),
    ]);

    await collectStream(
      provider.generateMessages({
        messages: makeMessages("a"),
        model: "fake",
      }),
    );
    expect(provider.callLog).toHaveLength(1);

    provider.reset();
    expect(provider.callLog).toHaveLength(0);

    const items = await collectStream(
      provider.generateMessages({
        messages: makeMessages("b"),
        model: "fake",
      }),
    );
    // After reset, should start from first script again
    expect((items[0] as { content: string }).content).toBe("first");
  });

  it("generateMessage buffers chunks into content string", async () => {
    const provider = new ScriptedProvider([textScript("buffered content")]);
    const msg = await provider.generateMessage({
      messages: makeMessages("test"),
      model: "fake",
    });
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("buffered content");
  });

  it("generateMessage returns 'Done.' when no text chunks", async () => {
    const provider = new ScriptedProvider([
      toolCallScript("some-tool", {}),
    ]);
    const msg = await provider.generateMessage({
      messages: makeMessages("test"),
      model: "fake",
    });
    expect(msg.content).toBe("Done.");
  });
});

// ---------------------------------------------------------------------------
// Script factory helpers
// ---------------------------------------------------------------------------

describe("planScript", () => {
  it("creates a create_task tool call", () => {
    const script = planScript({
      title: "Test Plan",
      steps: [{ id: "s1", instructions: "Do something" }],
    });
    const items = script([], []);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("tool_call");
    expect((items[0] as { name: string }).name).toBe("create_task");
    expect((items[0] as { args: { title: string } }).args.title).toBe("Test Plan");
  });
});

describe("stepScript", () => {
  it("creates a finish_step tool call", () => {
    const script = stepScript({ answer: 42 });
    const items = script([], []);
    expect(items).toHaveLength(1);
    expect((items[0] as { name: string }).name).toBe("finish_step");
    expect((items[0] as { args: { result: unknown } }).args.result).toEqual({
      answer: 42,
    });
  });
});

describe("autoScript", () => {
  it("calls create_task when available and plan provided", () => {
    const script = autoScript({
      plan: { title: "Plan", steps: [] },
      result: "fallback",
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
      { summary: "found it" },
    );
    expect(scripts).toHaveLength(2);

    // First script: tool calls
    const items1 = scripts[0]([], []);
    expect(items1).toHaveLength(1);
    expect((items1[0] as { name: string }).name).toBe("search");

    // Second script: finish_step
    const items2 = scripts[1]([], []);
    expect((items2[0] as { name: string }).name).toBe("finish_step");
    expect(
      (items2[0] as { args: { result: unknown } }).args.result,
    ).toEqual({ summary: "found it" });
  });

  it("supports multiple tool calls", () => {
    const scripts = toolThenFinishScript(
      [
        { name: "search", args: { query: "a" } },
        { name: "read", args: { file: "b.txt" } },
      ],
      "done",
    );

    const items = scripts[0]([], []);
    expect(items).toHaveLength(2);
    expect((items[0] as { name: string }).name).toBe("search");
    expect((items[1] as { name: string }).name).toBe("read");
  });
});
