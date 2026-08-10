import { describe, it, expect } from "vitest";
import { RepeatCountNode, RepeatValueStreamNode } from "@nodetool-ai/core-nodes";

describe("RepeatCountNode", () => {
  it("streams count ticks with index", async () => {
    const node = new RepeatCountNode();
    node.assign({ count: 3 });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([
      { output: 0, index: 0 },
      { output: 1, index: 1 },
      { output: 2, index: 2 }
    ]);
  });

  it("emits nothing when count is 0", async () => {
    const node = new RepeatCountNode();
    node.assign({ count: 0 });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([]);
  });
});

describe("RepeatValueStreamNode", () => {
  it("streams the same value N times with index", async () => {
    const node = new RepeatValueStreamNode();
    node.assign({ value: "sunset", count: 3 });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([
      { output: "sunset", index: 0 },
      { output: "sunset", index: 1 },
      { output: "sunset", index: 2 }
    ]);
  });

  it("preserves object identity across emissions", async () => {
    const payload = { prompt: "test" };
    const node = new RepeatValueStreamNode();
    node.assign({ value: payload, count: 2 });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess({})) {
      out.push(part);
    }

    expect(out[0]?.output).toBe(payload);
    expect(out[1]?.output).toBe(payload);
  });
});
