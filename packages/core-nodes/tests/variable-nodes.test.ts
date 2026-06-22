import { describe, it, expect } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { SetVariableNode, GetVariableNode } from "../src/nodes/variable.js";

function makeContext(): ProcessingContext {
  return new ProcessingContext({ jobId: "variable-test" });
}

describe("SetVariableNode", () => {
  it("writes the value to the shared processing context", async () => {
    const ctx = makeContext();
    const node = new SetVariableNode();
    node.assign({ name: "greeting", value: "hello" });

    const result = await node.process(ctx);

    expect(result.output).toBe("hello");
    expect(ctx.get("greeting")).toBe("hello");
    expect(ctx.hasVariable("greeting")).toBe(true);
  });

  it("passes the value through to the output unchanged", async () => {
    const ctx = makeContext();
    const node = new SetVariableNode();
    const value = { nested: [1, 2, 3] };
    node.assign({ name: "payload", value });

    const result = await node.process(ctx);

    expect(result.output).toBe(value);
    expect(ctx.get("payload")).toBe(value);
  });

  it("trims surrounding whitespace from the variable name", async () => {
    const ctx = makeContext();
    const node = new SetVariableNode();
    node.assign({ name: "  spaced  ", value: 7 });

    await node.process(ctx);

    expect(ctx.get("spaced")).toBe(7);
  });

  it("throws when the variable name is empty", async () => {
    const ctx = makeContext();
    const node = new SetVariableNode();
    node.assign({ name: "   ", value: "x" });

    await expect(node.process(ctx)).rejects.toThrow(
      /non-empty variable name/
    );
  });
});

describe("GetVariableNode", () => {
  it("reads a value written earlier on the same context", async () => {
    const ctx = makeContext();
    const setter = new SetVariableNode();
    setter.assign({ name: "topic", value: "robots" });
    await setter.process(ctx);

    const getter = new GetVariableNode();
    getter.assign({ name: "topic" });
    const result = await getter.process(ctx);

    expect(result.output).toBe("robots");
  });

  it("returns null for a variable that was never set", async () => {
    const ctx = makeContext();
    const getter = new GetVariableNode();
    getter.assign({ name: "missing" });

    const result = await getter.process(ctx);

    expect(result.output).toBeNull();
  });

  it("ignores the trigger input value", async () => {
    const ctx = makeContext();
    ctx.set("color", "blue");

    const getter = new GetVariableNode();
    getter.assign({ name: "color", trigger: "anything" });
    const result = await getter.process(ctx);

    expect(result.output).toBe("blue");
  });

  it("throws when the variable name is empty", async () => {
    const ctx = makeContext();
    const getter = new GetVariableNode();
    getter.assign({ name: "" });

    await expect(getter.process(ctx)).rejects.toThrow(
      /non-empty variable name/
    );
  });
});

describe("Set/Get Variable round trip", () => {
  it("shares variables across nodes through one context", async () => {
    const ctx = makeContext();

    const setName = new SetVariableNode();
    setName.assign({ name: "subject", value: "a wizard" });
    await setName.process(ctx);

    const setMood = new SetVariableNode();
    setMood.assign({ name: "mood", value: "mysterious" });
    await setMood.process(ctx);

    const getSubject = new GetVariableNode();
    getSubject.assign({ name: "subject" });
    const getMood = new GetVariableNode();
    getMood.assign({ name: "mood" });

    expect((await getSubject.process(ctx)).output).toBe("a wizard");
    expect((await getMood.process(ctx)).output).toBe("mysterious");
  });
});
