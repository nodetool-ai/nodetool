import { describe, it, expect } from "vitest";
import {
  RangeNode,
  TileNode,
  RepeatEachNode,
  RepeatValueNode,
  RepeatCountNode,
  RepeatValueStreamNode,
  ForEachNode
} from "@nodetool-ai/core-nodes";

describe("list nodes", () => {
  it("RangeNode produces [0..count-1] when stop is default", async () => {
    const node = new RangeNode();
    node.assign({ count: 4, stop: -1 });
    await expect(node.process()).resolves.toEqual({ output: [0, 1, 2, 3] });
  });

  it("RangeNode produces Python-style start/stop/step", async () => {
    const node = new RangeNode();
    node.assign({ start: 1, stop: 4, step: 1 });
    await expect(node.process()).resolves.toEqual({ output: [1, 2, 3] });
  });

  it("RangeNode rejects zero step", async () => {
    const node = new RangeNode();
    node.assign({ start: 0, stop: 3, step: 0 });
    await expect(node.process()).rejects.toThrow(/step must not be zero/i);
  });

  it("RangeNode enforces max_output_length", async () => {
    const node = new RangeNode();
    node.assign({ count: 5, max_output_length: 3 });
    await expect(node.process()).rejects.toThrow(/max_output_length/i);
  });

  it("TileNode repeats the full list N times", async () => {
    const node = new TileNode();
    node.assign({ input_list: ["A", "B", "C"], times: 3 });
    await expect(node.process()).resolves.toEqual({
      output: ["A", "B", "C", "A", "B", "C", "A", "B", "C"]
    });
  });

  it("TileNode returns empty list when times is 0", async () => {
    const node = new TileNode();
    node.assign({ input_list: ["A"], times: 0 });
    await expect(node.process()).resolves.toEqual({ output: [] });
  });

  it("RepeatEachNode repeats each item N times", async () => {
    const node = new RepeatEachNode();
    node.assign({ input_list: ["A", "B", "C"], times: 2 });
    await expect(node.process()).resolves.toEqual({
      output: ["A", "A", "B", "B", "C", "C"]
    });
  });

  it("RepeatEachNode enforces max_output_length", async () => {
    const node = new RepeatEachNode();
    node.assign({ input_list: [1, 2, 3], times: 2, max_output_length: 5 });
    await expect(node.process()).rejects.toThrow(/max_output_length/i);
  });

  it("RepeatValueNode duplicates a scalar into a list", async () => {
    const node = new RepeatValueNode();
    node.assign({ value: "prompt", times: 3 });
    await expect(node.process()).resolves.toEqual({
      output: ["prompt", "prompt", "prompt"]
    });
  });

  it("RepeatValueNode returns empty list when times is 0", async () => {
    const node = new RepeatValueNode();
    node.assign({ value: "x", times: 0 });
    await expect(node.process()).resolves.toEqual({ output: [] });
  });
});

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

describe("list repeat composition", () => {
  it("Tile then ForEach iterates the tiled list", async () => {
    const tile = new TileNode();
    tile.assign({ input_list: ["A", "B"], times: 2 });
    const tiled = await tile.process();

    const each = new ForEachNode();
    each.assign({ input_list: tiled.output });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of each.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([
      { output: "A", index: 0 },
      { output: "B", index: 1 },
      { output: "A", index: 2 },
      { output: "B", index: 3 }
    ]);
  });

  it("Range then ForEach iterates numeric indices", async () => {
    const range = new RangeNode();
    range.assign({ start: 1, stop: 4, step: 1 });
    const ranged = await range.process();

    const each = new ForEachNode();
    each.assign({ input_list: ranged.output });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of each.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([
      { output: 1, index: 0 },
      { output: 2, index: 1 },
      { output: 3, index: 2 }
    ]);
  });

  it("RepeatValue then ForEach iterates duplicated scalar", async () => {
    const repeat = new RepeatValueNode();
    repeat.assign({ value: "go", times: 2 });
    const repeated = await repeat.process();

    const each = new ForEachNode();
    each.assign({ input_list: repeated.output });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of each.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([
      { output: "go", index: 0 },
      { output: "go", index: 1 }
    ]);
  });
});
