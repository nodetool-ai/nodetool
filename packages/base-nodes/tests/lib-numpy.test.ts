import { describe, expect, it } from "vitest";
import {
  // Arithmetic
  AddArrayNode,
  SubtractArrayNode,
  MultiplyArrayNode,
  DivideArrayNode,
  ModulusArrayNode,
  // Math
  AbsArrayNode,
  SineArrayNode,
  CosineArrayNode,
  ExpArrayNode,
  LogArrayNode,
  SqrtArrayNode,
  PowerArrayNode,
  // Statistics
  SumArrayNode,
  MeanArrayNode,
  MinArrayNode,
  MaxArrayNode,
  ArgMinArrayNode,
  ArgMaxArrayNode,
  // Manipulation
  SliceArrayNode,
  IndexArrayNode,
  TransposeArrayNode,
  MatMulNode,
  StackNode,
  SplitArrayNode,
  // Reshaping
  Reshape1DNode,
  Reshape2DNode,
  Reshape3DNode,
  Reshape4DNode,
  // Conversion
  ListToArrayNode,
  ArrayToListNode,
  ScalarToArrayNode,
  ArrayToScalarNode,
  // Utils
  BinaryOperationNode
} from "../src/index.js";

// Helper to build NdArray inputs
const arr = (data: number[], shape: number[]) => ({ data, shape });

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

describe("lib.array.arithmetic", () => {
  const a = arr([1, 2, 3, 4], [4]);
  const b = arr([4, 3, 2, 1], [4]);

  it("AddArray — element-wise addition", async () => {
    const res = await new AddArrayNode({ a, b }).process();
    expect(res).toEqual({ output: arr([5, 5, 5, 5], [4]) });
  });

  it("SubtractArray — element-wise subtraction", async () => {
    const res = await new SubtractArrayNode({ a, b }).process();
    expect(res).toEqual({ output: arr([-3, -1, 1, 3], [4]) });
  });

  it("MultiplyArray — element-wise multiplication", async () => {
    const res = await new MultiplyArrayNode({ a, b }).process();
    expect(res).toEqual({ output: arr([4, 6, 6, 4], [4]) });
  });

  it("DivideArray — element-wise division", async () => {
    const res = await new DivideArrayNode({ a, b }).process();
    expect((res.output as any).data[0]).toBeCloseTo(0.25);
    expect((res.output as any).data[1]).toBeCloseTo(0.6667, 3);
    expect((res.output as any).data[2]).toBeCloseTo(1.5);
    expect((res.output as any).data[3]).toBeCloseTo(4);
  });

  it("ModulusArray — element-wise modulus", async () => {
    const res = await new ModulusArrayNode({
      a: arr([10, 7, 5], [3]),
      b: arr([3, 4, 2], [3])
    }).process();
    expect(res).toEqual({ output: arr([1, 3, 1], [3]) });
  });

  it("AddArray — scalar broadcast", async () => {
    const res = await new AddArrayNode({
      a: arr([1, 2, 3], [3]),
      b: 10
    }).process();
    expect(res).toEqual({ output: arr([11, 12, 13], [3]) });
  });

  it("MultiplyArray — single-element arrays return scalar", async () => {
    const res = await new MultiplyArrayNode({ a: 3, b: 4 }).process();
    expect(res).toEqual({ output: 12 });
  });
});

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

describe("lib.array.math", () => {
  it("AbsArray — absolute values", async () => {
    const res = await new AbsArrayNode({
      values: arr([-3, -1, 0, 2], [4])
    }).process();
    expect(res).toEqual({ output: arr([3, 1, 0, 2], [4]) });
  });

  it("SineArray — sin of angles", async () => {
    const res = await new SineArrayNode({
      angle_rad: arr([0, Math.PI / 2, Math.PI], [3])
    }).process();
    const out = res.output as any;
    expect(out.data[0]).toBeCloseTo(0);
    expect(out.data[1]).toBeCloseTo(1);
    expect(out.data[2]).toBeCloseTo(0);
  });

  it("CosineArray — cos of angles", async () => {
    const res = await new CosineArrayNode({
      angle_rad: arr([0, Math.PI], [2])
    }).process();
    const out = res.output as any;
    expect(out.data[0]).toBeCloseTo(1);
    expect(out.data[1]).toBeCloseTo(-1);
  });

  it("ExpArray — e^x", async () => {
    const res = await new ExpArrayNode({
      values: arr([0, 1, 2], [3])
    }).process();
    const out = res.output as any;
    expect(out.data[0]).toBeCloseTo(1);
    expect(out.data[1]).toBeCloseTo(Math.E);
    expect(out.data[2]).toBeCloseTo(Math.E * Math.E);
  });

  it("LogArray — natural log", async () => {
    const res = await new LogArrayNode({
      values: arr([1, Math.E, Math.E * Math.E], [3])
    }).process();
    const out = res.output as any;
    expect(out.data[0]).toBeCloseTo(0);
    expect(out.data[1]).toBeCloseTo(1);
    expect(out.data[2]).toBeCloseTo(2);
  });

  it("SqrtArray — square root", async () => {
    const res = await new SqrtArrayNode({
      values: arr([0, 1, 4, 9], [4])
    }).process();
    expect(res).toEqual({ output: arr([0, 1, 2, 3], [4]) });
  });

  it("PowerArray — element-wise exponentiation", async () => {
    const res = await new PowerArrayNode({
      base: arr([2, 3, 4], [3]),
      exponent: arr([3, 2, 0.5], [3])
    }).process();
    const out = res.output as any;
    expect(out.data[0]).toBeCloseTo(8);
    expect(out.data[1]).toBeCloseTo(9);
    expect(out.data[2]).toBeCloseTo(2);
  });

  it("PowerArray — scalar exponent broadcast", async () => {
    const res = await new PowerArrayNode({
      base: arr([1, 2, 3], [3]),
      exponent: 2
    }).process();
    const out = res.output as any;
    expect(out.data).toEqual([1, 4, 9]);
  });

  it("AbsArray — empty array", async () => {
    const res = await new AbsArrayNode({ values: arr([], [0]) }).process();
    expect(res).toEqual({ output: arr([], [0]) });
  });
});

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

describe("lib.array.statistics", () => {
  const vals = arr([1, 2, 3, 4], [4]);

  it("SumArray — sum of 1D array", async () => {
    const res = await new SumArrayNode({ values: vals, axis: 0 }).process();
    expect(res).toEqual({ output: 10 });
  });

  it("MeanArray — mean of 1D array", async () => {
    const res = await new MeanArrayNode({ values: vals, axis: 0 }).process();
    expect(res).toEqual({ output: 2.5 });
  });

  it("MinArray — min of 1D array", async () => {
    const res = await new MinArrayNode({ values: vals, axis: 0 }).process();
    expect(res).toEqual({ output: 1 });
  });

  it("MaxArray — max of 1D array", async () => {
    const res = await new MaxArrayNode({ values: vals, axis: 0 }).process();
    expect(res).toEqual({ output: 4 });
  });

  it("ArgMinArray — index of min", async () => {
    const res = await new ArgMinArrayNode({
      values: arr([5, 3, 8, 1], [4]),
      axis: 0
    }).process();
    expect(res).toEqual({ output: 3 });
  });

  it("ArgMaxArray — index of max", async () => {
    const res = await new ArgMaxArrayNode({
      values: arr([5, 3, 8, 1], [4]),
      axis: 0
    }).process();
    expect(res).toEqual({ output: 2 });
  });

  it("SumArray — 2D along axis 0", async () => {
    // [[1, 2], [3, 4]] sum along axis 0 => [4, 6]
    const res = await new SumArrayNode({
      values: arr([1, 2, 3, 4], [2, 2]),
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([4, 6], [2]) });
  });

  it("SumArray — 2D along axis 1", async () => {
    // [[1, 2], [3, 4]] sum along axis 1 => [3, 7]
    const res = await new SumArrayNode({
      values: arr([1, 2, 3, 4], [2, 2]),
      axis: 1
    }).process();
    expect(res).toEqual({ output: arr([3, 7], [2]) });
  });

  it("MeanArray — 2D along axis 1", async () => {
    const res = await new MeanArrayNode({
      values: arr([2, 4, 6, 8], [2, 2]),
      axis: 1
    }).process();
    expect(res).toEqual({ output: arr([3, 7], [2]) });
  });

  it("MinArray — single element", async () => {
    const res = await new MinArrayNode({
      values: arr([42], [1]),
      axis: 0
    }).process();
    expect(res).toEqual({ output: 42 });
  });
});

// ---------------------------------------------------------------------------
// Manipulation
// ---------------------------------------------------------------------------

describe("lib.array.manipulation", () => {
  it("SliceArray — basic slice", async () => {
    const res = await new SliceArrayNode({
      values: arr([10, 20, 30, 40, 50], [5]),
      start: 1,
      stop: 4,
      step: 1,
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([20, 30, 40], [3]) });
  });

  it("SliceArray — with step", async () => {
    const res = await new SliceArrayNode({
      values: arr([0, 1, 2, 3, 4, 5], [6]),
      start: 0,
      stop: 6,
      step: 2,
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([0, 2, 4], [3]) });
  });

  it("SliceArray — stop=0 means end of axis", async () => {
    const res = await new SliceArrayNode({
      values: arr([10, 20, 30], [3]),
      start: 1,
      stop: 0,
      step: 1,
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([20, 30], [2]) });
  });

  it("IndexArray — select specific indices", async () => {
    const res = await new IndexArrayNode({
      values: arr([10, 20, 30, 40, 50], [5]),
      indices: "0, 2, 4",
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([10, 30, 50], [3]) });
  });

  it("IndexArray — empty indices returns empty", async () => {
    const res = await new IndexArrayNode({
      values: arr([1, 2, 3], [3]),
      indices: "",
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([], [0]) });
  });

  it("TransposeArray — 2D transpose", async () => {
    // [[1, 2, 3], [4, 5, 6]] => [[1, 4], [2, 5], [3, 6]]
    const res = await new TransposeArrayNode({
      values: arr([1, 2, 3, 4, 5, 6], [2, 3])
    }).process();
    expect(res).toEqual({ output: arr([1, 4, 2, 5, 3, 6], [3, 2]) });
  });

  it("TransposeArray — 1D is identity", async () => {
    const res = await new TransposeArrayNode({
      values: arr([1, 2, 3], [3])
    }).process();
    expect(res).toEqual({ output: arr([1, 2, 3], [3]) });
  });

  it("MatMul — 2x2 * 2x2", async () => {
    // [[1,2],[3,4]] * [[5,6],[7,8]] = [[19,22],[43,50]]
    const res = await new MatMulNode({
      a: arr([1, 2, 3, 4], [2, 2]),
      b: arr([5, 6, 7, 8], [2, 2])
    }).process();
    expect(res).toEqual({ output: arr([19, 22, 43, 50], [2, 2]) });
  });

  it("MatMul — 2x3 * 3x1", async () => {
    // [[1,2,3],[4,5,6]] * [[1],[1],[1]] = [[6],[15]]
    const res = await new MatMulNode({
      a: arr([1, 2, 3, 4, 5, 6], [2, 3]),
      b: arr([1, 1, 1], [3, 1])
    }).process();
    expect(res).toEqual({ output: arr([6, 15], [2, 1]) });
  });

  it("MatMul — shape mismatch throws", async () => {
    await expect(
      new MatMulNode({
        a: arr([1, 2, 3], [1, 3]),
        b: arr([1, 2], [1, 2])
      }).process()
    ).rejects.toThrow("Shape mismatch");
  });

  it("Stack — stack two 1D arrays along axis 0", async () => {
    const res = await new StackNode({
      arrays: [arr([1, 2, 3], [3]), arr([4, 5, 6], [3])],
      axis: 0
    }).process();
    expect(res).toEqual({ output: arr([1, 2, 3, 4, 5, 6], [2, 3]) });
  });

  it("Stack — empty arrays", async () => {
    const res = await new StackNode({ arrays: [], axis: 0 }).process();
    expect(res).toEqual({ output: arr([], [0]) });
  });

  it("SplitArray — split evenly", async () => {
    const res = await new SplitArrayNode({
      values: arr([1, 2, 3, 4], [4]),
      num_splits: 2,
      axis: 0
    }).process();
    const out = res.output as any[];
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(arr([1, 2], [2]));
    expect(out[1]).toEqual(arr([3, 4], [2]));
  });

  it("SplitArray — uneven split", async () => {
    const res = await new SplitArrayNode({
      values: arr([1, 2, 3, 4, 5], [5]),
      num_splits: 2,
      axis: 0
    }).process();
    const out = res.output as any[];
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(arr([1, 2, 3], [3]));
    expect(out[1]).toEqual(arr([4, 5], [2]));
  });
});

// ---------------------------------------------------------------------------
// Reshaping
// ---------------------------------------------------------------------------

describe("lib.array.reshaping", () => {
  const data = [1, 2, 3, 4, 5, 6];

  it("Reshape1D — flatten to 1D", async () => {
    const res = await new Reshape1DNode({
      values: arr(data, [2, 3]),
      num_elements: 6
    }).process();
    expect(res).toEqual({ output: arr(data, [6]) });
  });

  it("Reshape1D — num_elements=0 uses data length", async () => {
    const res = await new Reshape1DNode({
      values: arr(data, [2, 3]),
      num_elements: 0
    }).process();
    expect(res).toEqual({ output: arr(data, [6]) });
  });

  it("Reshape2D — reshape to 2x3", async () => {
    const res = await new Reshape2DNode({
      values: arr(data, [6]),
      num_rows: 2,
      num_cols: 3
    }).process();
    expect(res).toEqual({ output: arr(data, [2, 3]) });
  });

  it("Reshape3D — reshape to 1x2x3", async () => {
    const res = await new Reshape3DNode({
      values: arr(data, [6]),
      num_rows: 1,
      num_cols: 2,
      num_depths: 3
    }).process();
    expect(res).toEqual({ output: arr(data, [1, 2, 3]) });
  });

  it("Reshape4D — reshape to 1x1x2x3", async () => {
    const res = await new Reshape4DNode({
      values: arr(data, [6]),
      num_rows: 1,
      num_cols: 1,
      num_depths: 2,
      num_channels: 3
    }).process();
    expect(res).toEqual({ output: arr(data, [1, 1, 2, 3]) });
  });
});

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

describe("lib.array.conversion", () => {
  it("ListToArray — flat list", async () => {
    const res = await new ListToArrayNode({ values: [1, 2, 3] }).process();
    expect(res).toEqual({ output: arr([1, 2, 3], [3]) });
  });

  it("ListToArray — nested list infers 2D shape", async () => {
    const res = await new ListToArrayNode({
      values: [
        [1, 2],
        [3, 4]
      ]
    }).process();
    expect(res).toEqual({ output: arr([1, 2, 3, 4], [2, 2]) });
  });

  it("ArrayToList — 1D array to list", async () => {
    const res = await new ArrayToListNode({
      values: arr([1, 2, 3], [3])
    }).process();
    expect(res).toEqual({ output: [1, 2, 3] });
  });

  it("ArrayToList — 2D array to nested list", async () => {
    const res = await new ArrayToListNode({
      values: arr([1, 2, 3, 4], [2, 2])
    }).process();
    expect(res).toEqual({
      output: [
        [1, 2],
        [3, 4]
      ]
    });
  });

  it("ScalarToArray — converts number to single-element array", async () => {
    const res = await new ScalarToArrayNode({ value: 42 }).process();
    expect(res).toEqual({ output: arr([42], [1]) });
  });

  it("ArrayToScalar — extracts first element", async () => {
    const res = await new ArrayToScalarNode({
      values: arr([7, 8, 9], [3])
    }).process();
    expect(res).toEqual({ output: 7 });
  });

  it("ArrayToScalar — empty array returns 0", async () => {
    const res = await new ArrayToScalarNode({ values: arr([], [0]) }).process();
    expect(res).toEqual({ output: 0 });
  });

  it("ListToArray — empty list", async () => {
    const res = await new ListToArrayNode({ values: [] }).process();
    expect(res).toEqual({ output: arr([], [0]) });
  });
});

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

describe("lib.array.utils", () => {
  it("BinaryOperation — default is addition", async () => {
    const res = await new BinaryOperationNode({
      a: arr([1, 2], [2]),
      b: arr([3, 4], [2])
    }).process();
    expect(res).toEqual({ output: arr([4, 6], [2]) });
  });
});
