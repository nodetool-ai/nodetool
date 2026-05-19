import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";

export class IfNode extends BaseNode {
  static readonly nodeType = "nodetool.control.If";
  static readonly title = "If";
  static readonly description =
    "Conditionally executes one of two branches based on a condition.\n    control, flow, condition, logic, else, true, false, switch, toggle, flow-control\n\n    Use cases:\n    - Branch workflow based on conditions\n    - Handle different cases in data processing\n    - Implement decision logic";
  static readonly metadataOutputTypes = {
    if_true: "any",
    if_false: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingOutput = true;
  static readonly syncMode = "zip_all" as const;
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    if_true: { kind: "forward", source: "value" },
    if_false: { kind: "forward", source: "value" }
  };
  @prop({
    type: "bool",
    default: false,
    title: "Condition",
    description: "The condition to evaluate"
  })
  declare condition: any;

  @prop({
    type: "any",
    default: [],
    title: "Value",
    description: "The value to pass to the next node"
  })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const condition = Boolean(this.condition ?? this.condition ?? false);
    const value = this.value ?? this.value ?? null;

    if (condition) {
      return { if_true: value, if_false: null };
    }
    return { if_true: null, if_false: value };
  }
}

export class ForEachNode extends BaseNode {
  static readonly nodeType = "nodetool.control.ForEach";
  static readonly title = "For Each";
  static readonly description =
    "Iterate over a list and emit each item sequentially.\n    iterator, loop, list, sequence, repeat, enumerate, stream, collection\n\n    Use cases:\n    - Process each item of a collection in order\n    - Drive downstream nodes with individual elements";
  static readonly metadataOutputTypes = {
    output: "any",
    index: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "iteration", source: "__execution__", group: "items" },
    index: { kind: "iteration", source: "__execution__", group: "items" }
  };
  @prop({
    type: "list[any]",
    default: [],
    title: "Input List",
    description: "The list of items to iterate over."
  })
  declare input_list: any;

  @prop({
    type: "int",
    default: -1,
    title: "Limit",
    description:
      "Maximum number of items to emit. -1 (default) emits the full list. " +
      "Useful for testing pipelines on a small subset."
  })
  declare limit: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const values = (this.input_list ?? []) as unknown[];
    const list = Array.isArray(values) ? values : [values];
    const rawLimit = Number(this.limit ?? -1);
    const cap =
      Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : list.length;

    for (const [index, item] of list.entries()) {
      if (index >= cap) break;
      yield { output: item, index };
    }
  }
}

export class TakeNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Take";
  static readonly title = "Take";
  static readonly description =
    "Pass through the first N items of a stream and stop.\n    take, head, limit, first, stream, slice, sample, truncate\n\n    Use cases:\n    - Test a pipeline on a small subset of inputs\n    - Cap expensive downstream work at N items\n    - Implement \"first N matches\" semantics over a stream";
  static readonly metadataOutputTypes = {
    output: "any",
    index: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" },
    index: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — each item is forwarded until the limit is reached."
  })
  declare input_item: any;

  @prop({
    type: "int",
    default: 1,
    title: "N",
    description: "Number of items to take from the head of the stream."
  })
  declare n: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const rawN = Number(this.n ?? 1);
    const cap = Number.isFinite(rawN) && rawN > 0 ? Math.floor(rawN) : 0;
    if (cap === 0) return;

    let emitted = 0;
    for await (const item of inputs.stream("input_item")) {
      if (emitted < cap) {
        await outputs.emit("output", item);
        await outputs.emit("index", emitted);
        emitted += 1;
        if (emitted === cap) {
          outputs.complete("output");
          outputs.complete("index");
        }
      }
      // Continue draining without re-emitting so upstream can finish cleanly.
    }
  }
}

export class CollectNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Collect";
  static readonly title = "Collect";
  static readonly description =
    "Collect items until the end of the stream and return them as a list.\n    collector, aggregate, list, stream\n\n    Use cases:\n    - Gather results from multiple processing steps\n    - Collect streaming data into batches\n    - Aggregate outputs from parallel operations";
  static readonly metadataOutputTypes = {
    output: "list[any]"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly syncMode = "on_any" as const;
  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "aggregate", source: "input_item", collapse: "innermost" }
  };

  @prop({
    type: "any",
    default: [],
    title: "Input Item",
    description: "The input item to collect."
  })
  declare input_item: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: [] };
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const items: unknown[] = [];
    for await (const item of inputs.stream("input_item")) {
      items.push(item);
    }
    await outputs.emit("output", items);
  }
}

export class RerouteNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Reroute";
  static readonly title = "Reroute";
  static readonly description =
    "Pass data through unchanged for tidier workflow layouts.\n    reroute, passthrough, organize, tidy, flow, connection, redirect\n\n    Use cases:\n    - Organize complex workflows by routing connections\n    - Create cleaner visual layouts\n    - Redirect data flow without modification";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingOutput = true;
  static readonly syncMode = "on_any" as const;
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_value" }
  };
  @prop({
    type: "any",
    default: [],
    title: "Input Value",
    description: "Value to pass through unchanged"
  })
  declare input_value: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.input_value ?? this.input_value ?? null };
  }
}

export class SwitchNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Switch";
  static readonly title = "Switch";
  static readonly description =
    "Multi-branch routing: match a value against cases and route to the matching output.\n    control, switch, match, case, branch, route, multi-branch, flow-control\n\n    Use cases:\n    - Route data based on string/number matching\n    - Implement multi-way branching logic\n    - Replace chains of If nodes";
  static readonly metadataOutputTypes = {
    matched: "any",
    default: "any",
    index: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    matched: { kind: "forward", source: "input" },
    default: { kind: "forward", source: "input" },
    index: { kind: "single", source: "input" }
  };

  @prop({
    type: "any",
    default: "",
    title: "Value",
    description: "The value to match against cases."
  })
  declare value: any;

  @prop({
    type: "list[any]",
    default: [],
    title: "Cases",
    description: "List of values to match against. The first match wins."
  })
  declare cases: any;

  @prop({
    type: "any",
    default: null,
    title: "Input",
    description: "The data to route to the matched output."
  })
  declare input: any;

  async process(): Promise<Record<string, unknown>> {
    const value = this.value;
    const cases = Array.isArray(this.cases) ? this.cases : [];
    const input = this.input ?? null;

    for (let i = 0; i < cases.length; i++) {
      if (String(value) === String(cases[i])) {
        return { matched: input, default: null, index: i };
      }
    }
    return { matched: null, default: input, index: -1 };
  }
}

export class TryCatchNode extends BaseNode {
  static readonly nodeType = "nodetool.control.TryCatch";
  static readonly title = "Try / Catch";
  static readonly description =
    "Error handling wrapper: passes the value through on success, or returns error info on failure.\n    control, error, try, catch, exception, handling, retry, flow-control\n\n    Use cases:\n    - Gracefully handle errors in workflows\n    - Provide fallback values when operations fail\n    - Log error details for debugging";
  static readonly metadataOutputTypes = {
    output: "any",
    error: "str",
    has_error: "bool"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "value" },
    error: { kind: "single", source: "value" },
    has_error: { kind: "single", source: "value" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "The value to pass through. If this node receives an error signal, the fallback is used."
  })
  declare value: any;

  @prop({
    type: "any",
    default: null,
    title: "Fallback",
    description: "Value to return if an error occurs."
  })
  declare fallback: any;

  async process(): Promise<Record<string, unknown>> {
    try {
      const value = this.value;
      if (value !== null && value !== undefined) {
        return { output: value, error: "", has_error: false };
      }
      return { output: this.fallback ?? null, error: "Value is null or undefined", has_error: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return { output: this.fallback ?? null, error: message, has_error: true };
    }
  }
}

export class DropNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Drop";
  static readonly title = "Drop";
  static readonly description =
    "Skip the first N items of a stream, pass the rest through.\n    drop, skip, head, stream, slice, offset\n\n    Use cases:\n    - Skip headers or warm-up items in a stream\n    - Pagination-style offsets\n    - Drop the first record from a CSV-like feed";
  static readonly metadataOutputTypes = {
    output: "any",
    index: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" },
    index: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — items after the first N are forwarded."
  })
  declare input_item: any;

  @prop({
    type: "int",
    default: 1,
    title: "N",
    description: "Number of items to drop from the head of the stream."
  })
  declare n: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const rawN = Number(this.n ?? 0);
    const skipCount =
      Number.isFinite(rawN) && rawN > 0 ? Math.floor(rawN) : 0;

    let seen = 0;
    let emitted = 0;
    for await (const item of inputs.stream("input_item")) {
      if (seen < skipCount) {
        seen += 1;
        continue;
      }
      await outputs.emit("output", item);
      await outputs.emit("index", emitted);
      emitted += 1;
    }
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export class FilterEqualNode extends BaseNode {
  static readonly nodeType = "nodetool.control.FilterEqual";
  static readonly title = "Filter Equal";
  static readonly description =
    "Pass items through only when they equal a target value.\n    filter, equal, match, predicate, stream, where\n\n    Use cases:\n    - Keep only items matching a status, label, or category\n    - Drop sentinel/null markers from a stream\n    - Select rows by an exact id";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — items pass through if they equal the target value."
  })
  declare input_item: any;

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "Target value. Items deep-equal to this are passed through."
  })
  declare value: any;

  @prop({
    type: "bool",
    default: false,
    title: "Invert",
    description: "When true, pass items NOT equal to the target value."
  })
  declare invert: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const target = this.value;
    const invert = Boolean(this.invert);
    for await (const item of inputs.stream("input_item")) {
      const eq = deepEqual(item, target);
      if (eq !== invert) {
        await outputs.emit("output", item);
      }
    }
  }
}

function compilePredicate(expr: string): (item: unknown) => boolean {
  const src = (expr ?? "").toString().trim();
  if (!src) return () => true;
  const fn = new Function(
    "item",
    `"use strict"; return Boolean(${src});`
  ) as (item: unknown) => unknown;
  return (item: unknown) => {
    try {
      return Boolean(fn(item));
    } catch {
      return false;
    }
  };
}

export class FilterCodeNode extends BaseNode {
  static readonly nodeType = "nodetool.control.FilterCode";
  static readonly title = "Filter (Code)";
  static readonly description =
    "Pass items through when a JavaScript predicate returns truthy.\n    filter, predicate, code, javascript, expression, stream, where\n\n    Use cases:\n    - Keep items matching arbitrary criteria (e.g. item.score > 0.5)\n    - Drop empty or malformed records\n    - Custom field-based filtering";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — each item is tested against the predicate."
  })
  declare input_item: any;

  @prop({
    type: "str",
    default: "true",
    title: "Predicate",
    description:
      "JavaScript expression evaluated per item. The current value is bound to `item`. Examples: `item > 0`, `item.score > 0.5`, `typeof item === 'string'`."
  })
  declare predicate: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const test = compilePredicate(String(this.predicate ?? "true"));
    for await (const item of inputs.stream("input_item")) {
      if (test(item)) {
        await outputs.emit("output", item);
      }
    }
  }
}

export class ChunkNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Chunk";
  static readonly title = "Chunk";
  static readonly description =
    "Group every N items into a list and emit as a batch. Trailing partial batch is emitted at end of stream.\n    chunk, batch, group, window, buffer, stream\n\n    Use cases:\n    - Batched LLM/API calls without giving up streaming\n    - Window-based aggregation\n    - Group rows for bulk inserts";
  static readonly metadataOutputTypes = {
    output: "list[any]",
    index: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "iteration", source: "input_item", group: "batch" },
    index: { kind: "iteration", source: "input_item", group: "batch" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — items are buffered into batches of size N."
  })
  declare input_item: any;

  @prop({
    type: "int",
    default: 10,
    title: "Size",
    description: "Number of items per batch."
  })
  declare size: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const rawSize = Number(this.size ?? 10);
    const size =
      Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 1;

    let buffer: unknown[] = [];
    let batchIndex = 0;
    for await (const item of inputs.stream("input_item")) {
      buffer.push(item);
      if (buffer.length >= size) {
        await outputs.emit("output", buffer);
        await outputs.emit("index", batchIndex);
        batchIndex += 1;
        buffer = [];
      }
    }
    if (buffer.length > 0) {
      await outputs.emit("output", buffer);
      await outputs.emit("index", batchIndex);
    }
  }
}

export class LastNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Last";
  static readonly title = "Last";
  static readonly description =
    "Emit only the final item of a stream.\n    last, final, tail, fold, stream, reduce\n\n    Use cases:\n    - Keep the final answer from an agent token stream\n    - Pick the most recent item in a feed\n    - Cheap fold to a single value";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "aggregate", source: "input_item", collapse: "innermost" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — only the final value is forwarded."
  })
  declare input_item: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    let last: unknown = null;
    let seen = false;
    for await (const item of inputs.stream("input_item")) {
      last = item;
      seen = true;
    }
    if (seen) {
      await outputs.emit("output", last);
    }
  }
}

export class CountStreamNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Count";
  static readonly title = "Count";
  static readonly description =
    "Emit the total number of items when the stream ends.\n    count, length, size, total, fold, stream\n\n    Use cases:\n    - Report how many items a pipeline produced\n    - Measure stream throughput without buffering items\n    - Avoid collecting just to call .length";
  static readonly metadataOutputTypes = {
    output: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "aggregate", source: "input_item", collapse: "innermost" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — items are counted but not forwarded."
  })
  declare input_item: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: 0 };
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    let count = 0;
    for await (const _ of inputs.stream("input_item")) {
      count += 1;
    }
    await outputs.emit("output", count);
  }
}

function distinctKey(item: unknown, expr: string): string {
  const trimmed = expr.trim();
  if (!trimmed) {
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }
  try {
    const fn = new Function(
      "item",
      `"use strict"; return (${trimmed});`
    ) as (item: unknown) => unknown;
    const key = fn(item);
    if (typeof key === "string" || typeof key === "number" || typeof key === "boolean") {
      return String(key);
    }
    return JSON.stringify(key);
  } catch {
    try {
      return JSON.stringify(item);
    } catch {
      return String(item);
    }
  }
}

export class DistinctNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Distinct";
  static readonly title = "Distinct";
  static readonly description =
    "Drop duplicate items from a stream. Optional key expression for grouping.\n    distinct, unique, dedup, deduplicate, stream, set\n\n    Use cases:\n    - Deduplicate URLs, ids, or records\n    - Keep only the first sighting of each value\n    - Field-based dedup with a key expression";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — duplicate items are dropped."
  })
  declare input_item: any;

  @prop({
    type: "str",
    default: "",
    title: "Key",
    description:
      "Optional JavaScript expression for the dedup key. The item is bound to `item`. Examples: `item.id`, `item.url`. Empty means use the whole item."
  })
  declare key: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const keyExpr = String(this.key ?? "");
    const seen = new Set<string>();
    for await (const item of inputs.stream("input_item")) {
      const k = distinctKey(item, keyExpr);
      if (!seen.has(k)) {
        seen.add(k);
        await outputs.emit("output", item);
      }
    }
  }
}

export class TakeWhileNode extends BaseNode {
  static readonly nodeType = "nodetool.control.TakeWhile";
  static readonly title = "Take While";
  static readonly description =
    "Pass items through while a predicate is truthy. Stops at the first failure.\n    take, while, predicate, stream, prefix\n\n    Use cases:\n    - Stream until a sentinel/terminator is reached\n    - Process items while a confidence threshold holds\n    - Cleaner than counting when N is unknown up front";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input."
  })
  declare input_item: any;

  @prop({
    type: "str",
    default: "true",
    title: "Predicate",
    description:
      "JavaScript expression evaluated per item. The current value is bound to `item`. Stream stops at the first item where the predicate is falsy."
  })
  declare predicate: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const test = compilePredicate(String(this.predicate ?? "true"));
    let stopped = false;
    for await (const item of inputs.stream("input_item")) {
      if (stopped) continue;
      if (!test(item)) {
        stopped = true;
        outputs.complete("output");
        continue;
      }
      await outputs.emit("output", item);
    }
  }
}

export class DropWhileNode extends BaseNode {
  static readonly nodeType = "nodetool.control.DropWhile";
  static readonly title = "Drop While";
  static readonly description =
    "Drop items while a predicate is truthy, then pass everything after.\n    drop, skip, while, predicate, stream, suffix\n\n    Use cases:\n    - Skip leading whitespace, headers, or warm-up\n    - Wait for a stream to enter a steady state\n    - Predicate-based version of Drop(N)";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input."
  })
  declare input_item: any;

  @prop({
    type: "str",
    default: "false",
    title: "Predicate",
    description:
      "JavaScript expression evaluated per item. The current value is bound to `item`. Items are dropped until the predicate first returns falsy; everything after is passed through."
  })
  declare predicate: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const test = compilePredicate(String(this.predicate ?? "false"));
    let dropping = true;
    for await (const item of inputs.stream("input_item")) {
      if (dropping) {
        if (test(item)) continue;
        dropping = false;
      }
      await outputs.emit("output", item);
    }
  }
}

export class TapNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Tap";
  static readonly title = "Tap";
  static readonly description =
    "Passthrough that logs each item to the console as a side effect.\n    tap, log, debug, inspect, peek, side-effect, stream\n\n    Use cases:\n    - Inspect a streaming pipeline without altering it\n    - Add lightweight per-item logging\n    - Debug intermediate stages of a workflow";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "forward", source: "input_item" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Input Item",
    description: "Streaming input — forwarded unchanged after logging."
  })
  declare input_item: any;

  @prop({
    type: "str",
    default: "tap",
    title: "Label",
    description: "Label printed alongside each logged item."
  })
  declare label: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const label = String(this.label ?? "tap");
    for await (const item of inputs.stream("input_item")) {
      // eslint-disable-next-line no-console
      console.log(`[${label}]`, item);
      await outputs.emit("output", item);
    }
  }
}

/**
 * Zip — explicit join for two independent iteration sources.
 *
 * §7 of docs/correlation-design.md. Pairs values by matched iteration `index`
 * within the longest common parent prefix. V1 accepts at most one differing
 * iteration root per input after the prefix; deeper differences must be
 * aggregated or zipped in stages first. Emits a new iteration root
 * `${node.id}:zip` so downstream nodes see one ordinary correlated stream.
 */
export class ZipNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Zip";
  static readonly title = "Zip";
  static readonly description =
    "Pair items from two independent iteration sources by matched index within the common parent.";
  static readonly metadataOutputTypes = {
    left: "any",
    right: "any",
    index: "int"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly isJoinNode = true;
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    left: { kind: "iteration", source: "__execution__", group: "zip" },
    right: { kind: "iteration", source: "__execution__", group: "zip" },
    index: { kind: "iteration", source: "__execution__", group: "zip" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Left",
    description: "Left iteration source."
  })
  declare left: any;

  @prop({
    type: "any",
    default: null,
    title: "Right",
    description: "Right iteration source."
  })
  declare right: any;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Unmatched Pairs",
    description:
      "Maximum number of unmatched items to buffer before failing. §7."
  })
  declare max_unmatched_pairs: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    // Buffer each side keyed by the differing root's index, projected to
    // their common-parent key. Once both sides have a value for the same
    // (parent_key, index) bucket, emit a paired frame. The actor mints the
    // group's iteration root; outputs.emit relies on it via the actor's
    // per-slot lineage rules.
    const limit = Math.max(1, Number(this.max_unmatched_pairs ?? 1024));
    const lefts = new Map<string, unknown>();
    const rights = new Map<string, unknown>();

    const bucketKey = (env: { correlation_lineage: Record<string, { index: number }> }): string => {
      // Use a deterministic key from the lineage map: scope-order is not
      // available here, so include every (root,index) pair sorted by root
      // name. This keys per identical lineage projection.
      const parts = Object.keys(env.correlation_lineage)
        .sort()
        .map((k) => `${k}=${env.correlation_lineage[k].index}`);
      return parts.join(",");
    };

    const tryEmit = async () => {
      for (const [key, lval] of lefts) {
        if (rights.has(key)) {
          const rval = rights.get(key);
          lefts.delete(key);
          rights.delete(key);
          await outputs.emit("left", lval);
          await outputs.emit("right", rval);
        }
      }
    };

    const watchLimit = () => {
      if (lefts.size > limit || rights.size > limit) {
        throw new Error(
          `Zip node "${(this as { id?: string }).id ?? "?"}" exceeded ` +
            `max_unmatched_pairs (${limit}). §7 — likely one side is missing values.`
        );
      }
    };

    // Drain both inputs concurrently.
    const leftLoop = (async () => {
      for await (const env of inputs.streamWithEnvelope("left")) {
        lefts.set(bucketKey(env), env.data);
        watchLimit();
        await tryEmit();
      }
    })();
    const rightLoop = (async () => {
      for await (const env of inputs.streamWithEnvelope("right")) {
        rights.set(bucketKey(env), env.data);
        watchLimit();
        await tryEmit();
      }
    })();
    await Promise.all([leftLoop, rightLoop]);
    await tryEmit();
  }
}

/**
 * Cross — cartesian product of two iteration sources within their common
 * parent prefix. §7.
 *
 * V1 buffers both sides until their scopes close for the common parent key
 * and errors before emitting more than `max_output_count` pairs.
 */
export class CrossNode extends BaseNode {
  static readonly nodeType = "nodetool.control.Cross";
  static readonly title = "Cross";
  static readonly description =
    "Emit the cartesian product of two iteration sources within their common parent.";
  static readonly metadataOutputTypes = {
    left: "any",
    right: "any"
  };
  static readonly inlineFields = [];
  static readonly inputFields = [];

  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly isJoinNode = true;
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    left: { kind: "iteration", source: "__execution__", group: "cross" },
    right: { kind: "iteration", source: "__execution__", group: "cross" }
  };

  @prop({
    type: "any",
    default: null,
    title: "Left",
    description: "Left iteration source."
  })
  declare left: any;

  @prop({
    type: "any",
    default: null,
    title: "Right",
    description: "Right iteration source."
  })
  declare right: any;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Output Count",
    description:
      "Maximum number of pairs to emit. Buffering both sides without a cap can blow memory."
  })
  declare max_output_count: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const limit = Math.max(1, Number(this.max_output_count ?? 1024));
    const lefts: unknown[] = [];
    const rights: unknown[] = [];

    const leftLoop = (async () => {
      for await (const v of inputs.stream("left")) {
        lefts.push(v);
      }
    })();
    const rightLoop = (async () => {
      for await (const v of inputs.stream("right")) {
        rights.push(v);
      }
    })();
    await Promise.all([leftLoop, rightLoop]);

    let emitted = 0;
    for (const l of lefts) {
      for (const r of rights) {
        if (emitted >= limit) {
          throw new Error(
            `Cross node exceeded max_output_count (${limit}); ` +
              `truncate the inputs or raise the limit. §7.`
          );
        }
        await outputs.emit("left", l);
        await outputs.emit("right", r);
        emitted++;
      }
    }
  }
}

export const CONTROL_NODES = [
  IfNode,
  ForEachNode,
  TakeNode,
  DropNode,
  TakeWhileNode,
  DropWhileNode,
  FilterEqualNode,
  FilterCodeNode,
  ChunkNode,
  LastNode,
  CountStreamNode,
  DistinctNode,
  TapNode,
  CollectNode,
  RerouteNode,
  SwitchNode,
  TryCatchNode,
  ZipNode,
  CrossNode
] as const;
