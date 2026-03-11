import { describe, expect, it } from "vitest";
import {
  AverageNode,
  ChunkNode,
  DifferenceNode,
  FlattenNode,
  IntersectionNode,
  MaximumNode,
  MinimumNode,
  ProductNode,
  SumNode,
} from "../src/index.js";

async function run<T extends { process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> }>(
  NodeClass: new () => T,
  inputs: Record<string, unknown>,
) {
  return new NodeClass().process(inputs);
}

describe("list parity: numeric reducers", () => {
  it("sums floats and mixed int/float values", async () => {
    await expect(run(SumNode, { values: [1.5, 2.5, 3.0] })).resolves.toEqual({
      output: 7,
    });
    await expect(run(SumNode, { values: [1, 2.5, 3, 4.5] })).resolves.toEqual({
      output: 11,
    });
  });

  it("averages float values", async () => {
    await expect(run(AverageNode, { values: [1.0, 2.0, 3.0] })).resolves.toEqual({
      output: 2,
    });
  });

  it("finds extrema for negative values", async () => {
    await expect(run(MinimumNode, { values: [-5, -2, -8, -1] })).resolves.toEqual({
      output: -8,
    });
    await expect(run(MaximumNode, { values: [-5, -2, -8, -1] })).resolves.toEqual({
      output: -1,
    });
  });

  it("handles zero and single-element products", async () => {
    await expect(run(ProductNode, { values: [2, 0, 4] })).resolves.toEqual({
      output: 0,
    });
    await expect(run(ProductNode, { values: [5] })).resolves.toEqual({
      output: 5,
    });
  });
});

describe("list parity: structural transforms", () => {
  it("flattens deeply nested structures with unlimited depth", async () => {
    await expect(
      run(FlattenNode, { values: [[1, [2, [3, [4]]]], [5]], max_depth: -1 }),
    ).resolves.toEqual({ output: [1, 2, 3, 4, 5] });
  });

  it("respects explicit flatten depth and mixed scalar values", async () => {
    await expect(
      run(FlattenNode, { values: [[[1, 2], [3]], [[4], [5, 6]]], max_depth: 2 }),
    ).resolves.toEqual({ output: [1, 2, 3, 4, 5, 6] });
    await expect(
      run(FlattenNode, { values: [["a", "b"], ["c"], "d"] }),
    ).resolves.toEqual({ output: ["a", "b", "c", "d"] });
  });

  it("chunks uneven lists into a shorter final chunk", async () => {
    await expect(run(ChunkNode, { values: [1, 2, 3, 4, 5], chunk_size: 2 })).resolves.toEqual({
      output: [[1, 2], [3, 4], [5]],
    });
  });
});

describe("list parity: set-like operations", () => {
  it("handles intersection with no overlap and subset overlap", async () => {
    await expect(run(IntersectionNode, { list1: [1, 2], list2: [3, 4] })).resolves.toEqual({
      output: [],
    });
    const subset = await run(IntersectionNode, { list1: [1, 2, 3], list2: [1, 2, 3, 4, 5] });
    expect(new Set(subset.output as unknown[])).toEqual(new Set([1, 2, 3]));
  });

  it("handles list difference with overlapping inputs", async () => {
    await expect(run(DifferenceNode, { list1: [1, 2, 3, 4], list2: [3, 4, 5, 6] })).resolves.toEqual({
      output: [1, 2],
    });
  });
});
