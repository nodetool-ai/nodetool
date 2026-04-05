import { prop } from "../decorators.js";
import { BaseNode } from "../base-node.js";

export class Passthrough extends BaseNode {
  static readonly nodeType = "nodetool.test.Passthrough";
  static readonly title = "Passthrough";
  static readonly description = "Passes input value through unchanged";

  @prop({ type: "any", default: null })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }
}

export class Add extends BaseNode {
  static readonly nodeType = "nodetool.test.Add";
  static readonly title = "Add";
  static readonly description = "Adds two numbers";
  @prop({ type: "int", default: 0 })
  declare a: any;

  @prop({ type: "int", default: 0 })
  declare b: any;

  async process(): Promise<Record<string, unknown>> {
    const a = (this.a ?? 0) as number;
    const b = (this.b ?? 0) as number;
    return { result: a + b };
  }
}

export class Multiply extends BaseNode {
  static readonly nodeType = "nodetool.test.Multiply";
  static readonly title = "Multiply";
  static readonly description = "Multiplies two numbers";
  @prop({ type: "int", default: 1 })
  declare a: any;

  @prop({ type: "int", default: 1 })
  declare b: any;

  async process(): Promise<Record<string, unknown>> {
    const a = (this.a ?? 1) as number;
    const b = (this.b ?? 1) as number;
    return { result: a * b };
  }
}

export class Constant extends BaseNode {
  static readonly nodeType = "nodetool.test.Constant";
  static readonly title = "Constant";
  static readonly description = "Outputs a constant value";
  @prop({ type: "any", default: null })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.value };
  }
}

export class StringConcat extends BaseNode {
  static readonly nodeType = "nodetool.test.StringConcat";
  static readonly title = "String Concat";
  static readonly description = "Concatenates two strings";
  @prop({ type: "str", default: "" })
  declare a: any;

  @prop({ type: "str", default: "" })
  declare b: any;

  @prop({ type: "str", default: "" })
  declare separator: any;

  async process(): Promise<Record<string, unknown>> {
    const a = String(this.a ?? "");
    const b = String(this.b ?? "");
    const sep = String(this.separator ?? "");
    return { result: a + sep + b };
  }
}

export class FormatText extends BaseNode {
  static readonly nodeType = "nodetool.test.FormatText";
  static readonly title = "Format Text";
  static readonly description =
    "Formats text by replacing {{ text }} in a template";
  @prop({ type: "str", default: "Hello, {{ text }}" })
  declare template: any;

  @prop({ type: "str", default: "" })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const template = String(this.template ?? "{{ text }}");
    const text = String(this.text ?? "");
    return { result: template.replace(/\{\{\s*text\s*\}\}/g, text) };
  }
}

export class ThresholdProcessor extends BaseNode {
  static readonly nodeType = "nodetool.test.ThresholdProcessor";
  static readonly title = "Threshold Processor";
  static readonly description = "Checks if a value exceeds a threshold";
  static readonly isControlled = true;
  @prop({ type: "int", default: 0 })
  declare value: any;

  @prop({ type: "float", default: 0.5 })
  declare threshold: any;

  @prop({ type: "str", default: "normal" })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const value = (this.value ?? 0) as number;
    const threshold = (this.threshold ?? 0.5) as number;
    const mode = String(this.mode ?? "normal");
    const exceeds = mode === "strict" ? value > threshold : value >= threshold;
    return {
      result: `value=${value}, threshold=${threshold}, mode=${mode}, exceeds=${exceeds}`
    };
  }
}

export class ErrorNode extends BaseNode {
  static readonly nodeType = "nodetool.test.ErrorNode";
  static readonly title = "Error Node";
  static readonly description = "Always throws an error";
  @prop({ type: "str", default: "Node error" })
  declare message: any;

  async process(): Promise<Record<string, unknown>> {
    throw new Error(String(this.message ?? "Node error"));
  }
}

export class SlowNode extends BaseNode {
  static readonly nodeType = "nodetool.test.SlowNode";
  static readonly title = "Slow Node";
  static readonly description = "Delays for a given number of milliseconds";
  @prop({ type: "int", default: 100 })
  declare delayMs: any;

  async process(): Promise<Record<string, unknown>> {
    await new Promise((r) => setTimeout(r, (this.delayMs as number) ?? 100));
    return { result: "completed" };
  }
}

export class StreamingCounter extends BaseNode {
  static readonly nodeType = "nodetool.test.StreamingCounter";
  static readonly title = "Streaming Counter";
  static readonly description = "Streams integers from 0 to count-1";
  static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 3 })
  declare count: any;

  @prop({ type: "int", default: 0 })
  declare start: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const count = (this.count as number) ?? 3;
    const start = (this.start as number) ?? 0;
    for (let i = 0; i < count; i++) {
      yield { value: start + i };
    }
  }
}

export class IntAccumulator extends BaseNode {
  static readonly nodeType = "nodetool.test.IntAccumulator";
  static readonly title = "Int Accumulator";
  static readonly description =
    "Accumulates integer inputs and tracks execution count";

  private _execCount = 0;
  private _accumulated: number[] = [];
  @prop({ type: "int", default: 0 })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    this._execCount++;
    const value = (this.value ?? 0) as number;
    this._accumulated.push(value);
    return {
      count: this._execCount,
      value,
      values: [...this._accumulated]
    };
  }
}

// ---------------------------------------------------------------------------
// Controller nodes (emit control events via __control__ handle)
// ---------------------------------------------------------------------------

/**
 * Source node that emits a single RunEvent on its __control__ output handle.
 * Connect via a control edge (edge_type: "control") to a controlled node.
 */
export class SimpleController extends BaseNode {
  static readonly nodeType = "nodetool.test.SimpleController";
  static readonly title = "Simple Controller";
  static readonly description = "Emits one RunEvent via __control__ handle";
  static readonly isStreamingOutput = true;
  @prop({ type: "float", default: 0.8 })
  declare threshold: any;

  @prop({ type: "str", default: "normal" })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    yield {
      __control__: {
        event_type: "run",
        properties: {
          threshold: this.threshold ?? 0.8,
          mode: this.mode ?? "normal"
        }
      }
    };
  }
}

/**
 * Source node that emits N RunEvents on its __control__ output handle.
 */
export class MultiTriggerController extends BaseNode {
  static readonly nodeType = "nodetool.test.MultiTriggerController";
  static readonly title = "Multi Trigger Controller";
  static readonly description = "Emits N RunEvents via __control__ handle";
  static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 3 })
  declare count: any;

  @prop({ type: "float", default: 0.5 })
  declare threshold: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const count = (this.count as number) ?? 3;
    for (let i = 0; i < count; i++) {
      yield {
        __control__: {
          event_type: "run",
          properties: {
            threshold: this.threshold ?? 0.5,
            index: i
          }
        }
      };
    }
  }
}

/**
 * Source node that emits a StopEvent on its __control__ handle,
 * causing the controlled node to stop immediately.
 */
export class StopEventController extends BaseNode {
  static readonly nodeType = "nodetool.test.StopEventController";
  static readonly title = "Stop Event Controller";
  static readonly description = "Emits a StopEvent via __control__ handle";
  static readonly isStreamingOutput = true;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    yield { __control__: { event_type: "stop" } };
  }
}

// ---------------------------------------------------------------------------
// Streaming nodes
// ---------------------------------------------------------------------------

/**
 * Node with is_streaming_input: true.
 * Called once with empty inputs by the actor.
 */
export class StreamingInputProcessor extends BaseNode {
  static readonly nodeType = "nodetool.test.StreamingInputProcessor";
  static readonly title = "Streaming Input Processor";
  static readonly description =
    "Streaming input node – called once with empty inputs";
  static readonly isStreamingInput = true;

  async process(): Promise<Record<string, unknown>> {
    return { result: "processed" };
  }
}

/**
 * Node with both is_streaming_input and is_streaming_output set.
 * Called once with empty inputs (streaming input takes priority in actor).
 */
export class FullStreamingNode extends BaseNode {
  static readonly nodeType = "nodetool.test.FullStreamingNode";
  static readonly title = "Full Streaming Node";
  static readonly description = "Both streaming input and output";
  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 2 })
  declare count: any;

  async process(): Promise<Record<string, unknown>> {
    return { result: "full-streaming" };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const count = (this.count as number) ?? 2;
    for (let i = 0; i < count; i++) {
      yield { value: i };
    }
  }
}

// ---------------------------------------------------------------------------
// Data processing nodes
// ---------------------------------------------------------------------------

/**
 * Accepts a list of numbers and emits their sum.
 */
export class ListSumProcessor extends BaseNode {
  static readonly nodeType = "nodetool.test.ListSumProcessor";
  static readonly title = "List Sum Processor";
  static readonly description = "Sums an array of numbers";

  @prop({ type: "list[int]", default: [] })
  declare values: any;

  async process(): Promise<Record<string, unknown>> {
    const values = (this.values ?? []) as number[];
    const sum = Array.isArray(values)
      ? values.reduce((a: number, b) => a + (b as number), 0)
      : 0;
    return { sum };
  }
}

/**
 * Throws if shouldFail input or prop is true.
 */
export class ConditionalErrorProcessor extends BaseNode {
  static readonly nodeType = "nodetool.test.ConditionalErrorProcessor";
  static readonly title = "Conditional Error Processor";
  static readonly description = "Throws only if shouldFail is true";
  @prop({ type: "bool", default: false })
  declare shouldFail: any;

  @prop({ type: "str", default: "conditional error" })
  declare message: any;

  async process(): Promise<Record<string, unknown>> {
    const shouldFail = (this.shouldFail ?? false) as boolean;
    if (shouldFail) {
      throw new Error(String(this.message ?? "conditional error"));
    }
    return { result: "ok" };
  }
}

/**
 * Runs successfully but emits no output values.
 */
export class SilentNode extends BaseNode {
  static readonly nodeType = "nodetool.test.SilentNode";
  static readonly title = "Silent Node";
  static readonly description = "Runs but emits no output";

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Typed input source nodes (run as actors, emit their prop value)
// ---------------------------------------------------------------------------

export class IntInput extends BaseNode {
  static readonly nodeType = "nodetool.test.IntInput";
  static readonly title = "Int Input";
  static readonly description = "Source node that emits an integer";
  @prop({ type: "int", default: 0 })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.value ?? 0 };
  }
}

export class FloatInput extends BaseNode {
  static readonly nodeType = "nodetool.test.FloatInput";
  static readonly title = "Float Input";
  static readonly description = "Source node that emits a float";
  @prop({ type: "int", default: 0.0 })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.value ?? 0.0 };
  }
}

export class StringInput extends BaseNode {
  static readonly nodeType = "nodetool.test.StringInput";
  static readonly title = "String Input";
  static readonly description = "Source node that emits a string";
  @prop({ type: "str", default: "" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.value ?? "" };
  }
}

// ---------------------------------------------------------------------------
// Node arrays for bulk registration
// ---------------------------------------------------------------------------

/** All original test nodes */
export const ALL_TEST_NODES = [
  Passthrough,
  Add,
  Multiply,
  Constant,
  StringConcat,
  FormatText,
  ThresholdProcessor,
  ErrorNode,
  SlowNode,
  StreamingCounter,
  IntAccumulator
] as const;

/** Additional E2E-focused test nodes */
export const ALL_CONTROLLER_NODES = [
  SimpleController,
  MultiTriggerController,
  StopEventController,
  StreamingInputProcessor,
  FullStreamingNode,
  ListSumProcessor,
  ConditionalErrorProcessor,
  SilentNode,
  IntInput,
  FloatInput,
  StringInput
] as const;

/** Combined: all test nodes including controller/e2e nodes */
export const ALL_E2E_NODES = [
  ...ALL_TEST_NODES,
  ...ALL_CONTROLLER_NODES
] as const;
