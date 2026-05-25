import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsPortable } from "../platform-tags.js";

export const DEFAULT_MAX_LIST_LENGTH = 10_000;

export function asList(raw: unknown): unknown[] {
  const values = raw ?? [];
  return Array.isArray(values) ? values : [values];
}

export function clampTimes(raw: unknown, fallback = 1): number {
  const n = Math.floor(Number(raw ?? fallback));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

export function assertOutputLength(
  length: number,
  max: number,
  nodeName: string
): void {
  if (length > max) {
    throw new Error(
      `${nodeName} would produce ${length} items, exceeding max_output_length (${max}).`
    );
  }
}

export function buildRange(
  start: number,
  stop: number,
  step: number
): number[] {
  if (step === 0) {
    throw new Error("Range step must not be zero.");
  }
  const out: number[] = [];
  if (step > 0) {
    for (let i = start; i < stop; i += step) {
      out.push(i);
    }
  } else {
    for (let i = start; i > stop; i += step) {
      out.push(i);
    }
  }
  return out;
}

export function buildRepeatedValues(value: unknown, times: number): unknown[] {
  const output: unknown[] = [];
  for (let t = 0; t < times; t++) {
    output.push(value);
  }
  return output;
}

export class RangeNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Range";
  static readonly title = "Range";
  static readonly description =
    "Build a list of integers like Python range(start, stop, step).\n    list, range, sequence, numbers, index, enumerate\n\n    Use cases:\n    - Generate [0, 1, ..., N-1] for iteration with For Each\n    - Produce numbered indices for batch naming or sequencing\n    - Create arithmetic sequences with custom start, stop, and step";
  static readonly metadataOutputTypes = {
    output: "list[int]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["start", "stop"];

  @prop({
    type: "int",
    default: 0,
    title: "Start",
    description: "First value (inclusive)."
  })
  declare start: any;

  @prop({
    type: "int",
    default: -1,
    title: "Stop",
    description:
      "Exclusive end. When -1 (default), uses Count instead to produce [0, 1, ..., count-1]."
  })
  declare stop: any;

  @prop({
    type: "int",
    default: 10,
    title: "Count",
    description: "Used when Stop is -1. Produces [0, 1, ..., count-1]."
  })
  declare count: any;

  @prop({
    type: "int",
    default: 1,
    title: "Step",
    description: "Increment between values."
  })
  declare step: any;

  @prop({
    type: "int",
    default: DEFAULT_MAX_LIST_LENGTH,
    title: "Max Output Length",
    description: "Maximum number of integers to produce."
  })
  declare max_output_length: any;

  async process(): Promise<Record<string, unknown>> {
    const rawStop = Number(this.stop ?? -1);
    const step = Number(this.step ?? 1);
    const maxLen = Math.max(
      1,
      Number(this.max_output_length ?? DEFAULT_MAX_LIST_LENGTH)
    );

    let values: number[];
    if (Number.isFinite(rawStop) && rawStop >= 0) {
      const start = Number(this.start ?? 0);
      values = buildRange(start, rawStop, step);
    } else {
      const count = clampTimes(this.count ?? 0, 0);
      values = buildRange(0, count, 1);
    }

    assertOutputLength(values.length, maxLen, "Range");
    return { output: values };
  }
}

export class TileNode extends BaseNode {
  static readonly nodeType = "nodetool.list.Tile";
  static readonly title = "Tile List";
  static readonly description =
    "Repeat an entire list end-to-end N times.\n    list, repeat, tile, cycle, loop, concatenate\n\n    Use cases:\n    - Run the same item sequence multiple times before For Each\n    - Duplicate a prompt list for batch generation\n    - [A, B, C] × 3 → [A, B, C, A, B, C, A, B, C]";
  static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["input_list"];

  @prop({
    type: "list[any]",
    default: [],
    title: "Input List",
    description: "List to repeat."
  })
  declare input_list: any;

  @prop({
    type: "int",
    default: 1,
    min: 0,
    title: "Times",
    description: "How many times to repeat the full list."
  })
  declare times: any;

  @prop({
    type: "int",
    default: DEFAULT_MAX_LIST_LENGTH,
    title: "Max Output Length",
    description: "Maximum number of items in the output list."
  })
  declare max_output_length: any;

  async process(): Promise<Record<string, unknown>> {
    const list = asList(this.input_list);
    const times = clampTimes(this.times ?? 1, 1);
    const maxLen = Math.max(
      1,
      Number(this.max_output_length ?? DEFAULT_MAX_LIST_LENGTH)
    );
    const outLength = list.length * times;

    assertOutputLength(outLength, maxLen, "Tile");

    if (times === 0 || list.length === 0) {
      return { output: [] };
    }

    const output: unknown[] = [];
    for (let t = 0; t < times; t++) {
      output.push(...list);
    }
    return { output };
  }
}

export class RepeatEachNode extends BaseNode {
  static readonly nodeType = "nodetool.list.RepeatEach";
  static readonly title = "Repeat Each";
  static readonly description =
    "Repeat each list item consecutively N times.\n    list, repeat, duplicate, interleave, expand\n\n    Use cases:\n    - Generate multiple variants per input item\n    - [A, B, C] × 2 → [A, A, B, B, C, C]\n    - Feed expanded lists into For Each";
  static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["input_list"];

  @prop({
    type: "list[any]",
    default: [],
    title: "Input List",
    description: "List whose items are repeated individually."
  })
  declare input_list: any;

  @prop({
    type: "int",
    default: 1,
    min: 0,
    title: "Times",
    description: "How many times to repeat each item."
  })
  declare times: any;

  @prop({
    type: "int",
    default: DEFAULT_MAX_LIST_LENGTH,
    title: "Max Output Length",
    description: "Maximum number of items in the output list."
  })
  declare max_output_length: any;

  async process(): Promise<Record<string, unknown>> {
    const list = asList(this.input_list);
    const times = clampTimes(this.times ?? 1, 1);
    const maxLen = Math.max(
      1,
      Number(this.max_output_length ?? DEFAULT_MAX_LIST_LENGTH)
    );
    const outLength = list.length * times;

    assertOutputLength(outLength, maxLen, "RepeatEach");

    if (times === 0 || list.length === 0) {
      return { output: [] };
    }

    const output: unknown[] = [];
    for (const item of list) {
      for (let t = 0; t < times; t++) {
        output.push(item);
      }
    }
    return { output };
  }
}

export class RepeatValueNode extends BaseNode {
  static readonly nodeType = "nodetool.list.RepeatValue";
  static readonly title = "Repeat Value";
  static readonly description =
    "Duplicate a single value into a list N times.\n    list, repeat, duplicate, fill, scalar, constant\n\n    Use cases:\n    - Build [v, v, v] from one prompt or parameter before For Each\n    - Expand a scalar into a list for list-typed inputs\n    - v × 3 → [v, v, v]";
  static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["value"];

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "Single value to repeat."
  })
  declare value: any;

  @prop({
    type: "int",
    default: 1,
    min: 0,
    title: "Times",
    description: "How many copies to produce."
  })
  declare times: any;

  @prop({
    type: "int",
    default: DEFAULT_MAX_LIST_LENGTH,
    title: "Max Output Length",
    description: "Maximum number of items in the output list."
  })
  declare max_output_length: any;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value ?? null;
    const times = clampTimes(this.times ?? 1, 1);
    const maxLen = Math.max(
      1,
      Number(this.max_output_length ?? DEFAULT_MAX_LIST_LENGTH)
    );

    assertOutputLength(times, maxLen, "RepeatValue");
    return { output: buildRepeatedValues(value, times) };
  }
}

export const LIST_NODES = tagAsPortable([
  RangeNode,
  TileNode,
  RepeatEachNode,
  RepeatValueNode
]);
