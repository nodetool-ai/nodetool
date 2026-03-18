import { describe, it, expect } from "vitest";
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

describe("ScriptedProvider constructor", () => {
  it("throws when given an empty scripts array", () => {
    expect(() => new ScriptedProvider([])).toThrow(
      "ScriptedProvider requires at least one script"
    );
  });

  it("creates a provider with the 'fake' id", () => {
    const p = new ScriptedProvider([textScript("hi")]);
    expect(p.provider).toBe("fake");
  });
});

describe("ScriptedProvider.generateMessages", () => {
  it("yields text chunks from a textScript", async () => {
    const p = new ScriptedProvider([textScript("hello world")]);
    const items: unknown[] = [];
    for await (const item of p.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "chunk",
      content: "hello world",
      done: true,
    });
  });

  it("yields tool calls from a toolCallScript", async () => {
    const p = new ScriptedProvider([
      toolCallScript("search", { query: "test" }),
    ]);
    const items: unknown[] = [];
    for await (const item of p.generateMessages({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    const tc = items[0] as { id: string; name: string; args: Record<string, unknown> };
    expect(tc.name).toBe("search");
    expect(tc.args).toEqual({ query: "test" });
    expect(tc.id).toBeTruthy();
  });

  it("advances through scripts on successive calls", async () => {
    const p = new ScriptedProvider([
      textScript("first"),
      textScript("second"),
      textScript("third"),
    ]);

    const collect = async () => {
      const items: unknown[] = [];
      for await (const item of p.generateMessages({
        messages: [],
        model: "m",
      })) {
        items.push(item);
      }
      return items;
    };

    const first = await collect();
    expect(first[0]).toMatchObject({ content: "first" });

    const second = await collect();
    expect(second[0]).toMatchObject({ content: "second" });

    const third = await collect();
    expect(third[0]).toMatchObject({ content: "third" });
  });

  it("repeats the last script when exhausted", async () => {
    const p = new ScriptedProvider([textScript("only")]);

    const collect = async () => {
      const items: unknown[] = [];
      for await (const item of p.generateMessages({
        messages: [],
        model: "m",
      })) {
        items.push(item);
      }
      return items;
    };

    await collect();
    const second = await collect();
    expect(second[0]).toMatchObject({ content: "only" });
  });

  it("records call log", async () => {
    const p = new ScriptedProvider([textScript("x")]);
    const msgs: Message[] = [{ role: "user", content: "hello" }];
    const tools: ProviderTool[] = [{ name: "t1", description: "desc" }];
    for await (const _ of p.generateMessages({
      messages: msgs,
      model: "m",
      tools,
    })) {
      // consume
    }
    expect(p.callLog).toHaveLength(1);
    expect(p.callLog[0].messages).toEqual(msgs);
    expect(p.callLog[0].tools).toEqual(tools);
  });
});

describe("ScriptedProvider.generateMessage", () => {
  it("returns aggregated text from streaming", async () => {
    const p = new ScriptedProvider([textScript("hello")]);
    const result = await p.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    });
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("hello");
  });

  it("returns 'Done.' when no text chunks", async () => {
    const p = new ScriptedProvider([
      toolCallScript("fn", { a: 1 }),
    ]);
    const result = await p.generateMessage({
      messages: [{ role: "user", content: "hi" }],
      model: "m",
    });
    expect(result.content).toBe("Done.");
  });
});

describe("ScriptedProvider.reset", () => {
  it("resets call index and call log", async () => {
    const p = new ScriptedProvider([textScript("a"), textScript("b")]);
    for await (const _ of p.generateMessages({ messages: [], model: "m" })) {
      // consume call 0
    }
    expect(p.callLog).toHaveLength(1);

    p.reset();
    expect(p.callLog).toHaveLength(0);

    // After reset, should start from script 0 again
    const items: unknown[] = [];
    for await (const item of p.generateMessages({ messages: [], model: "m" })) {
      items.push(item);
    }
    expect(items[0]).toMatchObject({ content: "a" });
  });
});

describe("planScript", () => {
  it("generates a create_task tool call", async () => {
    const plan = {
      title: "Test Plan",
      steps: [{ id: "s1", instructions: "do something" }],
    };
    const p = new ScriptedProvider([planScript(plan)]);
    const items: unknown[] = [];
    for await (const item of p.generateMessages({ messages: [], model: "m" })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    const tc = items[0] as { name: string; args: Record<string, unknown> };
    expect(tc.name).toBe("create_task");
    expect(tc.args).toMatchObject({ title: "Test Plan" });
  });
});

describe("stepScript", () => {
  it("generates a finish_step tool call", async () => {
    const p = new ScriptedProvider([stepScript({ answer: 42 })]);
    const items: unknown[] = [];
    for await (const item of p.generateMessages({ messages: [], model: "m" })) {
      items.push(item);
    }
    expect(items).toHaveLength(1);
    const tc = items[0] as { name: string; args: Record<string, unknown> };
    expect(tc.name).toBe("finish_step");
    expect(tc.args).toEqual({ result: { answer: 42 } });
  });
});

describe("autoScript", () => {
  it("calls create_task when tool is available and plan is given", async () => {
    const plan = { title: "P", steps: [{ id: "s1", instructions: "x" }] };
    const script = autoScript({ plan });
    const items = script([], [{ name: "create_task" }, { name: "finish_step" }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "tool_call", name: "create_task" });
  });

  it("calls finish_step when tool is available but no plan", async () => {
    const script = autoScript({ result: "done" });
    const items = script([], [{ name: "finish_step" }]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "tool_call",
      name: "finish_step",
      args: { result: "done" },
    });
  });

  it("emits text chunk when no matching tools", async () => {
    const script = autoScript({ text: "fallback" });
    const items = script([], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "chunk",
      content: "fallback",
      done: true,
    });
  });

  it("uses default text when no text option", async () => {
    const script = autoScript({});
    const items = script([], []);
    expect(items[0]).toMatchObject({ content: "Task completed." });
  });
});

describe("toolThenFinishScript", () => {
  it("returns two scripts: tool calls then finish_step", async () => {
    const scripts = toolThenFinishScript(
      [{ name: "calculator", args: { expr: "2+2" } }],
      { answer: 4 }
    );
    expect(scripts).toHaveLength(2);

    const p = new ScriptedProvider(scripts);

    // First call: tool calls
    const firstItems: unknown[] = [];
    for await (const item of p.generateMessages({ messages: [], model: "m" })) {
      firstItems.push(item);
    }
    expect(firstItems).toHaveLength(1);
    expect(firstItems[0]).toMatchObject({ name: "calculator" });

    // Second call: finish_step
    const secondItems: unknown[] = [];
    for await (const item of p.generateMessages({ messages: [], model: "m" })) {
      secondItems.push(item);
    }
    expect(secondItems).toHaveLength(1);
    expect(secondItems[0]).toMatchObject({
      name: "finish_step",
      args: { result: { answer: 4 } },
    });
  });
});
