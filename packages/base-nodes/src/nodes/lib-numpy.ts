import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// NdArray helpers
// ---------------------------------------------------------------------------

type NdArray = { data: number[]; shape: number[] };

function totalSize(shape: number[]): number {
  return shape.reduce((a, b) => a * b, 1);
}

function asNdArray(v: unknown): NdArray {
  if (v && typeof v === "object" && "data" in v && "shape" in v) {
    return v as NdArray;
  }
  if (typeof v === "number") {
    return { data: [v], shape: [1] };
  }
  if (Array.isArray(v)) {
    return { data: (v as number[]).map(Number), shape: [v.length] };
  }
  return { data: [], shape: [0] };
}

function elementwiseUnary(arr: NdArray, fn: (x: number) => number): NdArray {
  return { data: arr.data.map(fn), shape: [...arr.shape] };
}

function padArrays(a: NdArray, b: NdArray): [NdArray, NdArray] {
  if (a.data.length === 1 || b.data.length === 1) return [a, b];
  if (a.data.length === b.data.length) return [a, b];
  const maxLen = Math.max(a.data.length, b.data.length);
  const padA = a.data.length < maxLen
    ? { data: [...a.data, ...new Array(maxLen - a.data.length).fill(0)], shape: [maxLen] }
    : a;
  const padB = b.data.length < maxLen
    ? { data: [...b.data, ...new Array(maxLen - b.data.length).fill(0)], shape: [maxLen] }
    : b;
  return [padA, padB];
}

function elementwiseBinary(
  a: NdArray,
  b: NdArray,
  fn: (x: number, y: number) => number
): NdArray {
  const [pa, pb] = padArrays(a, b);
  if (pa.data.length === 1) {
    return { data: pb.data.map((v) => fn(pa.data[0], v)), shape: [...pb.shape] };
  }
  if (pb.data.length === 1) {
    return { data: pa.data.map((v) => fn(v, pb.data[0])), shape: [...pa.shape] };
  }
  return {
    data: pa.data.map((v, i) => fn(v, pb.data[i])),
    shape: [...pa.shape],
  };
}

function convertOutput(arr: NdArray): Record<string, unknown> {
  if (arr.data.length === 1) {
    return { output: arr.data[0] };
  }
  return { output: { data: arr.data, shape: arr.shape } };
}

// Reduction helpers for axis-based operations
function reduceAlongAxis(
  arr: NdArray,
  axis: number,
  reduceFn: (values: number[]) => number
): NdArray {
  if (arr.shape.length === 0 || arr.data.length === 0) {
    return { data: [], shape: [] };
  }

  const ndim = arr.shape.length;
  const clampedAxis = ((axis % ndim) + ndim) % ndim;

  if (ndim === 1) {
    return { data: [reduceFn(arr.data)], shape: [1] };
  }

  const newShape = arr.shape.filter((_, i) => i !== clampedAxis);
  const newSize = totalSize(newShape);
  const result: number[] = new Array(newSize);

  const axisLen = arr.shape[clampedAxis];
  const outerStride = arr.shape.slice(clampedAxis + 1).reduce((a, b) => a * b, 1);
  const axisStride = outerStride;
  const outerLen = arr.shape.slice(0, clampedAxis).reduce((a, b) => a * b, 1);
  const innerLen = outerStride;

  let idx = 0;
  for (let o = 0; o < outerLen; o++) {
    for (let inner = 0; inner < innerLen; inner++) {
      const values: number[] = [];
      for (let a = 0; a < axisLen; a++) {
        values.push(arr.data[o * axisLen * axisStride + a * axisStride + inner]);
      }
      result[idx++] = reduceFn(values);
    }
  }

  return { data: result, shape: newShape };
}

// WAV encoding (from lib-synthesis.ts pattern)
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return new Uint8Array(buffer);
}

function audioRefFromWav(wav: Uint8Array): Record<string, unknown> {
  return { uri: "", data: Buffer.from(wav).toString("base64") };
}

// ---------------------------------------------------------------------------
// Arithmetic (5 nodes)
// ---------------------------------------------------------------------------

export class AddArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.arithmetic.AddArray";
            static readonly title = "Add Array";
            static readonly description = "Performs addition on two arrays.\n    math, plus, add, addition, sum, +";
        static readonly metadataOutputTypes = {
    output: "union[int, float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[int, float, np_array]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float, np_array]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a ?? 0);
    const b = asNdArray(inputs.b ?? this.b ?? 0);
    return convertOutput(elementwiseBinary(a, b, (x, y) => x + y));
  }
}

export class SubtractArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.arithmetic.SubtractArray";
            static readonly title = "Subtract Array";
            static readonly description = "Subtracts the second array from the first.\n    math, minus, difference, -";
        static readonly metadataOutputTypes = {
    output: "union[int, float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[int, float, np_array]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float, np_array]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a ?? 0);
    const b = asNdArray(inputs.b ?? this.b ?? 0);
    return convertOutput(elementwiseBinary(a, b, (x, y) => x - y));
  }
}

export class MultiplyArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.arithmetic.MultiplyArray";
            static readonly title = "Multiply Array";
            static readonly description = "Multiplies two arrays.\n    math, product, times, *";
        static readonly metadataOutputTypes = {
    output: "union[int, float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[int, float, np_array]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float, np_array]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a ?? 0);
    const b = asNdArray(inputs.b ?? this.b ?? 0);
    return convertOutput(elementwiseBinary(a, b, (x, y) => x * y));
  }
}

export class DivideArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.arithmetic.DivideArray";
            static readonly title = "Divide Array";
            static readonly description = "Divides the first array by the second.\n    math, division, arithmetic, quotient, /";
        static readonly metadataOutputTypes = {
    output: "union[int, float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[int, float, np_array]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float, np_array]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a ?? 0);
    const b = asNdArray(inputs.b ?? this.b ?? 1);
    return convertOutput(elementwiseBinary(a, b, (x, y) => x / y));
  }
}

export class ModulusArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.arithmetic.ModulusArray";
            static readonly title = "Modulus Array";
            static readonly description = "Calculates the element-wise remainder of division.\n    math, modulo, remainder, mod, %\n\n    Use cases:\n    - Implementing cyclic behaviors\n    - Checking for even/odd numbers\n    - Limiting values to a specific range";
        static readonly metadataOutputTypes = {
    output: "union[int, float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[int, float, np_array]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float, np_array]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a ?? 0);
    const b = asNdArray(inputs.b ?? this.b ?? 1);
    return convertOutput(elementwiseBinary(a, b, (x, y) => x % y));
  }
}

// ---------------------------------------------------------------------------
// Math (7 nodes)
// ---------------------------------------------------------------------------

export class AbsArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.AbsArray";
            static readonly title = "Abs Array";
            static readonly description = "Compute the absolute value of each element in a array.\n    array, absolute, magnitude\n\n    Use cases:\n    - Calculate magnitudes of complex numbers\n    - Preprocess data for certain algorithms\n    - Implement activation functions in neural networks";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to compute the absolute values from." })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    return convertOutput(elementwiseUnary(arr, Math.abs));
  }
}

export class SineArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.SineArray";
            static readonly title = "Sine Array";
            static readonly description = "Computes the sine of input angles in radians.\n    math, trigonometry, sine, sin\n\n    Use cases:\n    - Calculating vertical components in physics\n    - Generating smooth periodic functions\n    - Audio signal processing";
        static readonly metadataOutputTypes = {
    output: "union[float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[float, int, np_array]", default: 0, title: "Angle (Radians)" })
  declare angle_rad: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.angle_rad ?? this.angle_rad ?? 0);
    return convertOutput(elementwiseUnary(arr, Math.sin));
  }
}

export class CosineArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.CosineArray";
            static readonly title = "Cosine Array";
            static readonly description = "Computes the cosine of input angles in radians.\n    math, trigonometry, cosine, cos\n\n    Use cases:\n    - Calculating horizontal components in physics\n    - Creating circular motions\n    - Phase calculations in signal processing";
        static readonly metadataOutputTypes = {
    output: "union[float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[float, int, np_array]", default: 0, title: "Angle (Radians)" })
  declare angle_rad: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.angle_rad ?? this.angle_rad ?? 0);
    return convertOutput(elementwiseUnary(arr, Math.cos));
  }
}

export class ExpArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.ExpArray";
            static readonly title = "Exp Array";
            static readonly description = "Calculate the exponential of each element in a array.\n    array, exponential, math, activation\n\n    Use cases:\n    - Implement exponential activation functions\n    - Calculate growth rates in scientific models\n    - Transform data for certain statistical analyses";
        static readonly metadataOutputTypes = {
    output: "union[float, int, np_array]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    return convertOutput(elementwiseUnary(arr, Math.exp));
  }
}

export class LogArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.LogArray";
            static readonly title = "Log Array";
            static readonly description = "Calculate the natural logarithm of each element in a array.\n    array, logarithm, math, transformation\n\n    Use cases:\n    - Implement log transformations on data\n    - Calculate entropy in information theory\n    - Normalize data with large ranges";
        static readonly metadataOutputTypes = {
    output: "union[float, int, np_array]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    return convertOutput(elementwiseUnary(arr, Math.log));
  }
}

export class SqrtArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.SqrtArray";
            static readonly title = "Sqrt Array";
            static readonly description = "Calculates the square root of the input array element-wise.\n    math, square root, sqrt, √\n\n    Use cases:\n    - Normalizing data\n    - Calculating distances in Euclidean space\n    - Finding intermediate values in binary search";
        static readonly metadataOutputTypes = {
    output: "union[float, int, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    return convertOutput(elementwiseUnary(arr, Math.sqrt));
  }
}

export class PowerArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.math.PowerArray";
            static readonly title = "Power Array";
            static readonly description = "Raises the base array to the power of the exponent element-wise.\n    math, exponentiation, power, pow, **\n\n    Use cases:\n    - Calculating compound interest\n    - Implementing polynomial functions\n    - Applying non-linear transformations to data";
        static readonly metadataOutputTypes = {
    output: "union[float, int, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[float, int, np_array]", default: 1, title: "Base" })
  declare base: any;

  @prop({ type: "union[float, int, np_array]", default: 2, title: "Exponent" })
  declare exponent: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = asNdArray(inputs.base ?? this.base ?? 1);
    const exp = asNdArray(inputs.exponent ?? this.exponent ?? 2);
    return convertOutput(elementwiseBinary(base, exp, Math.pow));
  }
}

// ---------------------------------------------------------------------------
// Statistics (6 nodes)
// ---------------------------------------------------------------------------

export class SumArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.statistics.SumArray";
            static readonly title = "Sum Array";
            static readonly description = "Calculate the sum of values along a specified axis of a array.\n    array, summation, reduction, statistics\n\n    Use cases:\n    - Compute total values across categories\n    - Implement sum pooling in neural networks\n    - Calculate cumulative metrics in time series data";
        static readonly metadataOutputTypes = {
    output: "union[np_array, float, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to compute sum" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    const res = reduceAlongAxis(arr, axis, (vals) => vals.reduce((a, b) => a + b, 0));
    return convertOutput(res);
  }
}

export class MeanArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.statistics.MeanArray";
            static readonly title = "Mean Array";
            static readonly description = "Compute the mean value along a specified axis of a array.\n    array, average, reduction, statistics\n\n    Use cases:\n    - Calculate average values in datasets\n    - Implement mean pooling in neural networks\n    - Compute centroids in clustering algorithms";
        static readonly metadataOutputTypes = {
    output: "union[np_array, float, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to compute mean" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    const res = reduceAlongAxis(arr, axis, (vals) =>
      vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    );
    return convertOutput(res);
  }
}

export class MinArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.statistics.MinArray";
            static readonly title = "Min Array";
            static readonly description = "Calculate the minimum value along a specified axis of a array.\n    array, minimum, reduction, statistics\n\n    Use cases:\n    - Find lowest values in datasets\n    - Implement min pooling in neural networks\n    - Determine minimum thresholds across categories";
        static readonly metadataOutputTypes = {
    output: "union[np_array, float, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to compute minimum" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    const res = reduceAlongAxis(arr, axis, (vals) => Math.min(...vals));
    return convertOutput(res);
  }
}

export class MaxArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.statistics.MaxArray";
            static readonly title = "Max Array";
            static readonly description = "Compute the maximum value along a specified axis of a array.\n    array, maximum, reduction, statistics\n\n    Use cases:\n    - Find peak values in time series data\n    - Implement max pooling in neural networks\n    - Determine highest scores across multiple categories";
        static readonly metadataOutputTypes = {
    output: "union[np_array, float, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to compute maximum" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    const res = reduceAlongAxis(arr, axis, (vals) => Math.max(...vals));
    return convertOutput(res);
  }
}

export class ArgMinArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.statistics.ArgMinArray";
            static readonly title = "Arg Min Array";
            static readonly description = "Find indices of minimum values along a specified axis of a array.\n    array, argmin, index, minimum\n\n    Use cases:\n    - Locate lowest-performing items in datasets\n    - Find troughs in signal processing\n    - Determine least likely classes in classification tasks";
        static readonly metadataOutputTypes = {
    output: "union[np_array, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to find minimum indices" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    const res = reduceAlongAxis(arr, axis, (vals) => {
      let minIdx = 0;
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] < vals[minIdx]) minIdx = i;
      }
      return minIdx;
    });
    return convertOutput(res);
  }
}

export class ArgMaxArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.statistics.ArgMaxArray";
            static readonly title = "Arg Max Array";
            static readonly description = "Find indices of maximum values along a specified axis of a array.\n    array, argmax, index, maximum\n\n    Use cases:\n    - Determine winning classes in classification tasks\n    - Find peaks in signal processing\n    - Locate best-performing items in datasets";
        static readonly metadataOutputTypes = {
    output: "union[np_array, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Input array" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to find maximum indices" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    const res = reduceAlongAxis(arr, axis, (vals) => {
      let maxIdx = 0;
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] > vals[maxIdx]) maxIdx = i;
      }
      return maxIdx;
    });
    return convertOutput(res);
  }
}

// ---------------------------------------------------------------------------
// Manipulation (6 nodes)
// ---------------------------------------------------------------------------

export class SliceArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.manipulation.SliceArray";
            static readonly title = "Slice Array";
            static readonly description = "Extract a slice of an array along a specified axis.\n    array, slice, subset, index\n\n    Use cases:\n    - Extract specific time periods from time series data\n    - Select subset of features from datasets\n    - Create sliding windows over sequential data";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to slice" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Start", description: "Starting index (inclusive)" })
  declare start: any;

  @prop({ type: "int", default: 0, title: "Stop", description: "Ending index (exclusive)" })
  declare stop: any;

  @prop({ type: "int", default: 1, title: "Step", description: "Step size between elements" })
  declare step: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to slice" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const start = Number(inputs.start ?? this.start ?? 0);
    const stop = Number(inputs.stop ?? this.stop ?? 0);
    const step = Number(inputs.step ?? this.step ?? 1);
    const axis = Number(inputs.axis ?? this.axis ?? 0);

    const ndim = arr.shape.length;
    if (ndim === 0) return { output: { data: [], shape: [] } };

    const clampedAxis = ((axis % ndim) + ndim) % ndim;
    const axisLen = arr.shape[clampedAxis];
    const effectiveStop = stop === 0 ? axisLen : Math.min(stop, axisLen);

    const indices: number[] = [];
    for (let i = start; i < effectiveStop; i += step) {
      indices.push(i);
    }

    return this.takeAlongAxis(arr, indices, clampedAxis);
  }

  private takeAlongAxis(arr: NdArray, indices: number[], axis: number): Record<string, unknown> {
    const newShape = [...arr.shape];
    newShape[axis] = indices.length;
    const newData: number[] = new Array(totalSize(newShape));

    const outerLen = arr.shape.slice(0, axis).reduce((a, b) => a * b, 1);
    const innerLen = arr.shape.slice(axis + 1).reduce((a, b) => a * b, 1);
    const axisLen = arr.shape[axis];

    let idx = 0;
    for (let o = 0; o < outerLen; o++) {
      for (const selIdx of indices) {
        for (let inner = 0; inner < innerLen; inner++) {
          newData[idx++] = arr.data[o * axisLen * innerLen + selIdx * innerLen + inner];
        }
      }
    }

    return convertOutput({ data: newData, shape: newShape });
  }
}

export class IndexArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.manipulation.IndexArray";
            static readonly title = "Index Array";
            static readonly description = "Select specific indices from an array along a specified axis.\n    array, index, select, subset\n\n    Use cases:\n    - Extract specific samples from a dataset\n    - Select particular features or dimensions\n    - Implement batch sampling operations";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to index" })
  declare values: any;

  @prop({ type: "str", default: "", title: "Indices", description: "The comma separated indices to select" })
  declare indices: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to index" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const indicesStr = String(inputs.indices ?? this.indices ?? "");
    const axis = Number(inputs.axis ?? this.axis ?? 0);

    const indices = indicesStr.split(",").filter((s) => s.trim()).map((s) => parseInt(s.trim(), 10));
    if (indices.length === 0) return { output: { data: [], shape: [0] } };

    const ndim = arr.shape.length;
    const clampedAxis = ((axis % ndim) + ndim) % ndim;
    const newShape = [...arr.shape];
    newShape[clampedAxis] = indices.length;

    const outerLen = arr.shape.slice(0, clampedAxis).reduce((a, b) => a * b, 1);
    const innerLen = arr.shape.slice(clampedAxis + 1).reduce((a, b) => a * b, 1);
    const axisLen = arr.shape[clampedAxis];

    const newData: number[] = [];
    for (let o = 0; o < outerLen; o++) {
      for (const selIdx of indices) {
        for (let inner = 0; inner < innerLen; inner++) {
          newData.push(arr.data[o * axisLen * innerLen + selIdx * innerLen + inner]);
        }
      }
    }

    return { output: { data: newData, shape: newShape } };
  }
}

export class TransposeArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.manipulation.TransposeArray";
            static readonly title = "Transpose Array";
            static readonly description = "Transpose the dimensions of the input array.\n    array, transpose, reshape, dimensions\n\n    Use cases:\n    - Convert row vectors to column vectors\n    - Rearrange data for compatibility with other operations\n    - Implement certain linear algebra operations";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
          static readonly layout = "small";
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Array to transpose" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const ndim = arr.shape.length;

    if (ndim <= 1) return { output: { data: [...arr.data], shape: [...arr.shape] } };

    if (ndim === 2) {
      const [rows, cols] = arr.shape;
      const newData: number[] = new Array(rows * cols);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          newData[c * rows + r] = arr.data[r * cols + c];
        }
      }
      return { output: { data: newData, shape: [cols, rows] } };
    }

    // General n-dim transpose (reverse axes)
    const newShape = [...arr.shape].reverse();
    const newData: number[] = new Array(arr.data.length);
    const strides: number[] = new Array(ndim);
    strides[ndim - 1] = 1;
    for (let i = ndim - 2; i >= 0; i--) strides[i] = strides[i + 1] * arr.shape[i + 1];

    const newStrides: number[] = new Array(ndim);
    newStrides[ndim - 1] = 1;
    for (let i = ndim - 2; i >= 0; i--) newStrides[i] = newStrides[i + 1] * newShape[i + 1];

    for (let flatIdx = 0; flatIdx < arr.data.length; flatIdx++) {
      let remaining = flatIdx;
      let newFlatIdx = 0;
      for (let d = 0; d < ndim; d++) {
        const coord = Math.floor(remaining / strides[d]);
        remaining %= strides[d];
        newFlatIdx += coord * newStrides[ndim - 1 - d];
      }
      newData[newFlatIdx] = arr.data[flatIdx];
    }

    return { output: { data: newData, shape: newShape } };
  }
}

export class MatMulNode extends BaseNode {
  static readonly nodeType = "lib.numpy.manipulation.MatMul";
            static readonly title = "Mat Mul";
            static readonly description = "Perform matrix multiplication on two input arrays.\n    array, matrix, multiplication, linear algebra\n\n    Use cases:\n    - Implement linear transformations\n    - Calculate dot products of vectors\n    - Perform matrix operations in neural networks";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
          static readonly layout = "small";
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "A", description: "First input array" })
  declare a: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "B", description: "Second input array" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a);
    const b = asNdArray(inputs.b ?? this.b);

    if (a.shape.length !== 2 || b.shape.length !== 2) {
      throw new Error("MatMul requires 2D arrays");
    }

    const [m, k1] = a.shape;
    const [k2, n] = b.shape;
    if (k1 !== k2) throw new Error(`Shape mismatch: ${k1} vs ${k2}`);

    const result: number[] = new Array(m * n);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < k1; k++) {
          sum += a.data[i * k1 + k] * b.data[k * n + j];
        }
        result[i * n + j] = sum;
      }
    }

    return { output: { data: result, shape: [m, n] } };
  }
}

export class StackNode extends BaseNode {
  static readonly nodeType = "lib.numpy.manipulation.Stack";
            static readonly title = "Stack";
            static readonly description = "Stack multiple arrays along a specified axis.\n    array, stack, concatenate, join, merge, axis\n\n    Use cases:\n    - Combine multiple 2D arrays into a 3D array\n    - Stack time series data from multiple sources\n    - Merge feature vectors for machine learning models";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "list[np_array]", default: [], title: "Arrays", description: "Arrays to stack" })
  declare arrays: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "The axis to stack along.", min: 0 })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const rawArrays = (inputs.arrays ?? this.arrays ?? []) as unknown[];
    const axis = Number(inputs.axis ?? this.axis ?? 0);
    if (rawArrays.length === 0) return { output: { data: [], shape: [0] } };

    const arrays = rawArrays.map(asNdArray);
    const refShape = arrays[0].shape;
    const newShape = [...refShape];
    newShape.splice(axis, 0, arrays.length);

    const outerLen = refShape.slice(0, axis).reduce((a, b) => a * b, 1);
    const innerLen = refShape.slice(axis).reduce((a, b) => a * b, 1);

    const newData: number[] = [];
    for (let o = 0; o < outerLen; o++) {
      for (const arr of arrays) {
        for (let inner = 0; inner < innerLen; inner++) {
          newData.push(arr.data[o * innerLen + inner]);
        }
      }
    }

    return { output: { data: newData, shape: newShape } };
  }
}

export class SplitArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.manipulation.SplitArray";
            static readonly title = "Split Array";
            static readonly description = "Split an array into multiple sub-arrays along a specified axis.\n    array, split, divide, partition\n\n    Use cases:\n    - Divide datasets into training/validation splits\n    - Create batches from large arrays\n    - Separate multi-channel data";
        static readonly metadataOutputTypes = {
    output: "list[np_array]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to split" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Num Splits", description: "Number of equal splits to create" })
  declare num_splits: any;

  @prop({ type: "int", default: 0, title: "Axis", description: "Axis along which to split" })
  declare axis: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const numSplits = Number(inputs.num_splits ?? this.num_splits ?? 1);
    const axis = Number(inputs.axis ?? this.axis ?? 0);

    const ndim = arr.shape.length;
    const clampedAxis = ((axis % ndim) + ndim) % ndim;
    const axisLen = arr.shape[clampedAxis];

    const splitSizes: number[] = [];
    const base = Math.floor(axisLen / numSplits);
    const remainder = axisLen % numSplits;
    for (let i = 0; i < numSplits; i++) {
      splitSizes.push(base + (i < remainder ? 1 : 0));
    }

    const outerLen = arr.shape.slice(0, clampedAxis).reduce((a, b) => a * b, 1);
    const innerLen = arr.shape.slice(clampedAxis + 1).reduce((a, b) => a * b, 1);

    const results: NdArray[] = [];
    let offset = 0;
    for (const size of splitSizes) {
      const newShape = [...arr.shape];
      newShape[clampedAxis] = size;
      const newData: number[] = [];
      for (let o = 0; o < outerLen; o++) {
        for (let s = 0; s < size; s++) {
          for (let inner = 0; inner < innerLen; inner++) {
            newData.push(arr.data[o * axisLen * innerLen + (offset + s) * innerLen + inner]);
          }
        }
      }
      results.push({ data: newData, shape: newShape });
      offset += size;
    }

    return { output: results };
  }
}

// ---------------------------------------------------------------------------
// Reshaping (4 nodes)
// ---------------------------------------------------------------------------

export class Reshape1DNode extends BaseNode {
  static readonly nodeType = "lib.numpy.reshaping.Reshape1D";
            static readonly title = "Reshape 1D";
            static readonly description = "Reshape an array to a 1D shape without changing its data.\n    array, reshape, vector, flatten\n\n    Use cases:\n    - Flatten multi-dimensional data for certain algorithms\n    - Convert images to vector form for machine learning\n    - Prepare data for 1D operations";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to reshape" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Num Elements", description: "The number of elements" })
  declare num_elements: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const numElements = Number(inputs.num_elements ?? this.num_elements ?? arr.data.length);
    const n = numElements || arr.data.length;
    return { output: { data: arr.data.slice(0, n), shape: [n] } };
  }
}

export class Reshape2DNode extends BaseNode {
  static readonly nodeType = "lib.numpy.reshaping.Reshape2D";
            static readonly title = "Reshape 2D";
            static readonly description = "Reshape an array to a new shape without changing its data.\n    array, reshape, dimensions, structure\n\n    Use cases:\n    - Convert between different dimensional representations\n    - Prepare data for specific model architectures\n    - Flatten or unflatten arrays";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to reshape" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Num Rows", description: "The number of rows" })
  declare num_rows: any;

  @prop({ type: "int", default: 0, title: "Num Cols", description: "The number of columns" })
  declare num_cols: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const rows = Number(inputs.num_rows ?? this.num_rows ?? 0);
    const cols = Number(inputs.num_cols ?? this.num_cols ?? 0);
    return { output: { data: [...arr.data], shape: [rows, cols] } };
  }
}

export class Reshape3DNode extends BaseNode {
  static readonly nodeType = "lib.numpy.reshaping.Reshape3D";
            static readonly title = "Reshape 3D";
            static readonly description = "Reshape an array to a 3D shape without changing its data.\n    array, reshape, dimensions, volume\n\n    Use cases:\n    - Convert data for 3D visualization\n    - Prepare image data with channels\n    - Structure data for 3D convolutions";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to reshape" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Num Rows", description: "The number of rows" })
  declare num_rows: any;

  @prop({ type: "int", default: 0, title: "Num Cols", description: "The number of columns" })
  declare num_cols: any;

  @prop({ type: "int", default: 0, title: "Num Depths", description: "The number of depths" })
  declare num_depths: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const rows = Number(inputs.num_rows ?? this.num_rows ?? 0);
    const cols = Number(inputs.num_cols ?? this.num_cols ?? 0);
    const depths = Number(inputs.num_depths ?? this.num_depths ?? 0);
    return { output: { data: [...arr.data], shape: [rows, cols, depths] } };
  }
}

export class Reshape4DNode extends BaseNode {
  static readonly nodeType = "lib.numpy.reshaping.Reshape4D";
            static readonly title = "Reshape 4D";
            static readonly description = "Reshape an array to a 4D shape without changing its data.\n    array, reshape, dimensions, batch\n\n    Use cases:\n    - Prepare batch data for neural networks\n    - Structure spatiotemporal data\n    - Format data for 3D image processing with channels";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to reshape" })
  declare values: any;

  @prop({ type: "int", default: 0, title: "Num Rows", description: "The number of rows" })
  declare num_rows: any;

  @prop({ type: "int", default: 0, title: "Num Cols", description: "The number of columns" })
  declare num_cols: any;

  @prop({ type: "int", default: 0, title: "Num Depths", description: "The number of depths" })
  declare num_depths: any;

  @prop({ type: "int", default: 0, title: "Num Channels", description: "The number of channels" })
  declare num_channels: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const rows = Number(inputs.num_rows ?? this.num_rows ?? 0);
    const cols = Number(inputs.num_cols ?? this.num_cols ?? 0);
    const depths = Number(inputs.num_depths ?? this.num_depths ?? 0);
    const channels = Number(inputs.num_channels ?? this.num_channels ?? 0);
    return { output: { data: [...arr.data], shape: [rows, cols, depths, channels] } };
  }
}

// ---------------------------------------------------------------------------
// Conversion (7 nodes)
// ---------------------------------------------------------------------------

export class ListToArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ListToArray";
            static readonly title = "List To Array";
            static readonly description = "Convert a list of values to a array.\n    list, array, conversion, type\n\n    Use cases:\n    - Prepare list data for array operations\n    - Create arrays from Python data structures\n    - Convert sequence data to array format";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "list[any]", default: [], title: "Values", description: "List of values to convert to array" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    const flat = flattenNestedList(values);
    const shape = inferShape(values);
    return { output: { data: flat, shape } };
  }
}

function flattenNestedList(val: unknown): number[] {
  if (Array.isArray(val)) {
    const result: number[] = [];
    for (const item of val) {
      result.push(...flattenNestedList(item));
    }
    return result;
  }
  return [Number(val)];
}

function inferShape(val: unknown): number[] {
  if (!Array.isArray(val)) return [];
  const shape: number[] = [val.length];
  if (val.length > 0 && Array.isArray(val[0])) {
    shape.push(...inferShape(val[0]));
  }
  return shape;
}

export class ArrayToListNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ArrayToList";
            static readonly title = "Array To List";
            static readonly description = "Convert a array to a nested list structure.\n    array, list, conversion, type\n\n    Use cases:\n    - Prepare array data for JSON serialization\n    - Convert array outputs to Python data structures\n    - Interface array data with non-array operations";
        static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Array to convert to list" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    return { output: toNestedList(arr.data, arr.shape, 0, 0).value };
  }
}

function toNestedList(
  data: number[],
  shape: number[],
  dim: number,
  offset: number
): { value: unknown; consumed: number } {
  if (dim >= shape.length) {
    return { value: data[offset] ?? 0, consumed: 1 };
  }
  if (dim === shape.length - 1) {
    const slice = data.slice(offset, offset + shape[dim]);
    return { value: slice, consumed: shape[dim] };
  }
  const result: unknown[] = [];
  let pos = offset;
  for (let i = 0; i < shape[dim]; i++) {
    const sub = toNestedList(data, shape, dim + 1, pos);
    result.push(sub.value);
    pos += sub.consumed;
  }
  return { value: result, consumed: pos - offset };
}

export class ScalarToArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ScalarToArray";
            static readonly title = "Scalar To Array";
            static readonly description = "Convert a scalar value to a single-element array.\n    scalar, array, conversion, type\n\n    Use cases:\n    - Prepare scalar inputs for array operations\n    - Create constant arrays for computations\n    - Initialize array values in workflows";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "union[float, int]", default: 0, title: "Value", description: "Scalar value to convert to array" })
  declare value: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = Number(inputs.value ?? this.value ?? 0);
    return { output: { data: [value], shape: [1] } };
  }
}

export class ArrayToScalarNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ArrayToScalar";
            static readonly title = "Array To Scalar";
            static readonly description = "Convert a single-element array to a scalar value.\n    array, scalar, conversion, type\n\n    Use cases:\n    - Extract final results from array computations\n    - Prepare values for non-array operations\n    - Simplify output for human-readable results";
        static readonly metadataOutputTypes = {
    output: "union[float, int]"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Array to convert to scalar" })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    return { output: arr.data[0] ?? 0 };
  }
}

export class ConvertToImageNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ConvertToImage";
            static readonly title = "Convert To Image";
            static readonly description = "Convert array data to PIL Image format.\n    array, image, conversion, denormalization\n\n    Use cases:\n    - Visualize array data as images\n    - Save processed array results as images\n    - Convert model outputs back to viewable format";
        static readonly metadataOutputTypes = {
    output: "image"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The input array to convert to an image. Should have either 1, 3, or 4 channels." })
  declare values: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    if (arr.data.length === 0) throw new Error("The input array is not connected.");

    const ndim = arr.shape.length;
    if (ndim !== 2 && ndim !== 3) throw new Error("The array should have 2 or 3 dimensions (HxW or HxWxC).");

    let height: number, width: number, channels: number;
    if (ndim === 2) {
      [height, width] = arr.shape;
      channels = 1;
    } else {
      [height, width, channels] = arr.shape;
      if (channels !== 1 && channels !== 3 && channels !== 4) {
        throw new Error("The array channels should be either 1, 3, or 4.");
      }
    }

    const effectiveChannels = channels === 1 ? 1 : channels;
    const pixelData = new Uint8Array(height * width * effectiveChannels);
    for (let i = 0; i < arr.data.length; i++) {
      pixelData[i] = Math.round(Math.max(0, Math.min(1, arr.data[i])) * 255);
    }

    const pngBuffer = await sharp(pixelData, {
      raw: { width, height, channels: effectiveChannels as 1 | 3 | 4 },
    })
      .png()
      .toBuffer();

    return {
      output: {
        type: "image",
        uri: "",
        data: pngBuffer.toString("base64"),
      },
    };
  }
}

export class ConvertToAudioNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ConvertToAudio";
            static readonly title = "Convert To Audio";
            static readonly description = "Converts a array object back to an audio file.\n    audio, conversion, array\n\n    Use cases:\n    - Save processed audio data as a playable file\n    - Convert generated or modified audio arrays to audio format\n    - Output results of audio processing pipelinesr";
        static readonly metadataOutputTypes = {
    output: "audio"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The array to convert to an audio file." })
  declare values: any;

  @prop({ type: "int", default: 44100, title: "Sample Rate", description: "The sample rate of the audio file.", min: 0, max: 44100 })
  declare sample_rate: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const sampleRate = Number(inputs.sample_rate ?? this.sample_rate ?? 44100);
    const samples = new Float32Array(arr.data);
    const wav = encodeWav(samples, sampleRate);
    return { output: audioRefFromWav(wav) };
  }
}

export class ConvertToArrayNumpyNode extends BaseNode {
  static readonly nodeType = "lib.numpy.conversion.ConvertToArray";
            static readonly title = "Convert To Array";
            static readonly description = "Convert PIL Image to normalized tensor representation.\n    image, tensor, conversion, normalization\n\n    Use cases:\n    - Prepare images for machine learning models\n    - Convert between image formats for processing\n    - Normalize image data for consistent calculations";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels." })
  declare image: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const image = (inputs.image ?? this.image ?? {}) as Record<string, unknown>;

    let rawData: Uint8Array | null = null;
    if (image.data && typeof image.data === "string") {
      rawData = Uint8Array.from(Buffer.from(image.data, "base64"));
    }

    if (!rawData) throw new Error("The input image is not connected.");

    const metadata = await sharp(rawData).metadata();
    const { width, height, channels } = metadata;
    if (!width || !height) throw new Error("Could not read image dimensions.");

    const ch = channels ?? 3;
    const pixelBuf = await sharp(rawData)
      .ensureAlpha(ch === 4 ? undefined : undefined)
      .raw()
      .toBuffer();

    const actualChannels = pixelBuf.length / (width * height);
    const data: number[] = new Array(pixelBuf.length);
    for (let i = 0; i < pixelBuf.length; i++) {
      data[i] = pixelBuf[i] / 255.0;
    }

    const shape = actualChannels === 1
      ? [height, width, 1]
      : [height, width, actualChannels];

    return { output: { data, shape } };
  }
}

// ---------------------------------------------------------------------------
// IO (1 node)
// ---------------------------------------------------------------------------

export class SaveArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.io.SaveArray";
            static readonly title = "Save Array";
            static readonly description = "Save a numpy array to a file in the specified folder.\n    array, save, file, storage\n\n    Use cases:\n    - Store processed arrays for later use\n    - Save analysis results\n    - Create checkpoints in processing pipelines";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "The array to save." })
  declare values: any;

  @prop({ type: "folder", default: {
  "type": "folder",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Folder", description: "The folder to save the array in." })
  declare folder: any;

  @prop({ type: "str", default: "%Y-%m-%d_%H-%M-%S.npy", title: "Name", description: "\n        The name of the asset to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        " })
  declare name: any;




  async process(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    const nameTemplate = String(inputs.name ?? this.name ?? "array.json");

    const now = new Date();
    const filename = nameTemplate
      .replace(/%Y/g, String(now.getFullYear()))
      .replace(/%m/g, String(now.getMonth() + 1).padStart(2, "0"))
      .replace(/%d/g, String(now.getDate()).padStart(2, "0"))
      .replace(/%H/g, String(now.getHours()).padStart(2, "0"))
      .replace(/%M/g, String(now.getMinutes()).padStart(2, "0"))
      .replace(/%S/g, String(now.getSeconds()).padStart(2, "0"))
      .replace(/\.npy$/, ".json");

    const json = JSON.stringify({ data: arr.data, shape: arr.shape });

    if (context?.storage) {
      const uri = await context.storage.store(filename, new TextEncoder().encode(json), "application/json");
      return { output: { data: arr.data, shape: arr.shape, uri } };
    }

    return { output: { data: arr.data, shape: arr.shape } };
  }
}

// ---------------------------------------------------------------------------
// Utils (1 node)
// ---------------------------------------------------------------------------

export class BinaryOperationNode extends BaseNode {
  static readonly nodeType = "lib.numpy.utils.BinaryOperation";
            static readonly title = "Binary Operation";
            static readonly description = "";
        static readonly metadataOutputTypes = {
    output: "union[int, float, np_array]"
  };
          static readonly layout = "small";
  
  @prop({ type: "union[int, float, np_array]", default: 0, title: "A" })
  declare a: any;

  @prop({ type: "union[int, float, np_array]", default: 0, title: "B" })
  declare b: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = asNdArray(inputs.a ?? this.a ?? 0);
    const b = asNdArray(inputs.b ?? this.b ?? 0);
    return convertOutput(elementwiseBinary(a, b, (x, y) => x + y));
  }
}

// ---------------------------------------------------------------------------
// Visualization (1 node)
// ---------------------------------------------------------------------------

export class PlotArrayNode extends BaseNode {
  static readonly nodeType = "lib.numpy.visualization.PlotArray";
            static readonly title = "Plot Array";
            static readonly description = "Create a plot visualization of array data.\n    array, plot, visualization, graph\n\n    Use cases:\n    - Visualize trends in array data\n    - Create charts for reports or dashboards\n    - Debug array outputs in workflows";
        static readonly metadataOutputTypes = {
    output: "image"
  };
  
  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Values", description: "Array to plot" })
  declare values: any;

  @prop({ type: "enum", default: "line", title: "Plot Type", description: "Type of plot to create", values: [
  "line",
  "bar",
  "scatter"
] })
  declare plot_type: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const arr = asNdArray(inputs.values ?? this.values);
    if (arr.data.length === 0) throw new Error("Empty array");

    const ndim = arr.shape.length;
    let height: number, width: number;

    if (ndim === 2) {
      [height, width] = arr.shape;
    } else {
      height = 256;
      width = arr.data.length;
    }

    // Normalize data to 0-255 for grayscale visualization
    let min = Infinity, max = -Infinity;
    for (const v of arr.data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    if (ndim === 2) {
      // 2D: render as grayscale image
      const pixels = new Uint8Array(height * width);
      for (let i = 0; i < arr.data.length; i++) {
        pixels[i] = Math.round(((arr.data[i] - min) / range) * 255);
      }
      const pngBuffer = await sharp(pixels, {
        raw: { width, height, channels: 1 },
      }).png().toBuffer();

      return {
        output: {
          type: "image",
          uri: "",
          data: pngBuffer.toString("base64"),
        },
      };
    }

    // 1D: simple line plot as image
    const imgWidth = Math.max(width, 400);
    const imgHeight = 256;
    const pixels = new Uint8Array(imgHeight * imgWidth).fill(255);

    for (let x = 0; x < arr.data.length && x < imgWidth; x++) {
      const normalized = (arr.data[x] - min) / range;
      const y = Math.round((1 - normalized) * (imgHeight - 1));
      const clampedY = Math.max(0, Math.min(imgHeight - 1, y));
      pixels[clampedY * imgWidth + x] = 0;
      // Draw a vertical line from baseline to point for visibility
      const baseline = imgHeight - 1;
      const startY = Math.min(clampedY, baseline);
      const endY = Math.max(clampedY, baseline);
      for (let py = startY; py <= endY; py++) {
        const existing = pixels[py * imgWidth + x];
        pixels[py * imgWidth + x] = Math.min(existing, 128);
      }
    }

    const pngBuffer = await sharp(pixels, {
      raw: { width: imgWidth, height: imgHeight, channels: 1 },
    }).png().toBuffer();

    return {
      output: {
        type: "image",
        uri: "",
        data: pngBuffer.toString("base64"),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Export all 38 nodes
// ---------------------------------------------------------------------------

export const LIB_NUMPY_NODES = [
  // arithmetic (5)
  AddArrayNode,
  SubtractArrayNode,
  MultiplyArrayNode,
  DivideArrayNode,
  ModulusArrayNode,
  // math (7)
  AbsArrayNode,
  SineArrayNode,
  CosineArrayNode,
  ExpArrayNode,
  LogArrayNode,
  SqrtArrayNode,
  PowerArrayNode,
  // statistics (6)
  SumArrayNode,
  MeanArrayNode,
  MinArrayNode,
  MaxArrayNode,
  ArgMinArrayNode,
  ArgMaxArrayNode,
  // manipulation (6)
  SliceArrayNode,
  IndexArrayNode,
  TransposeArrayNode,
  MatMulNode,
  StackNode,
  SplitArrayNode,
  // reshaping (4)
  Reshape1DNode,
  Reshape2DNode,
  Reshape3DNode,
  Reshape4DNode,
  // conversion (7)
  ListToArrayNode,
  ArrayToListNode,
  ScalarToArrayNode,
  ArrayToScalarNode,
  ConvertToImageNode,
  ConvertToAudioNode,
  ConvertToArrayNumpyNode,
  // io (1)
  SaveArrayNode,
  // utils (1)
  BinaryOperationNode,
  // visualization (1)
  PlotArrayNode,
] as const;
