/**
 * Minimal BaseNode fixtures for ExecutionSession tests. Registered into a
 * fresh `NodeRegistry` per test so tests never share mutable registry state.
 */
import {
  BaseNode,
  NodeRegistry,
  prop,
  type StreamingInputs,
  type StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** External input node: one-shot, seeded via params or `pushInput`. */
export class ValueInput extends BaseNode {
  static readonly nodeType = "nodetool.input.Value";
  static readonly title = "Value";
  static readonly description = "Test value input";

  @prop({ type: "any", default: null })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }
}

/**
 * External input node whose output is structurally streaming (a trivial
 * `genProcess` override flips `hasStreamingOutput()`), so the kernel keeps
 * its downstream inbox open for `pushInputValue`/`finishInputStream` instead
 * of dispatching a one-shot default. The generator itself is never invoked —
 * the node has no incoming edges, so the kernel dispatches it as an external
 * input node, not as a spawned actor.
 */
export class StreamingValueInput extends BaseNode {
  static readonly nodeType = "nodetool.input.StreamingValue";
  static readonly title = "Streaming Value";
  static readonly description = "Test streaming value input";

  @prop({ type: "any", default: null })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    yield { output: this.value };
  }
}

/** Doubles a numeric input. */
export class Double extends BaseNode {
  static readonly nodeType = "test.execution.Double";
  static readonly title = "Double";
  static readonly description = "Doubles a number";

  @prop({ type: "int", default: 0 })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: Number(this.value ?? 0) * 2 };
  }
}

/** Collects every value streamed on its input into a single terminal array. */
export class StreamSink extends BaseNode {
  static readonly nodeType = "test.execution.StreamSink";
  static readonly title = "Stream Sink";
  static readonly description = "Collects streamed values";
  static readonly isStreamingInput = true;

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    const collected: unknown[] = [];
    for await (const value of inputs.stream("value")) {
      collected.push(value);
    }
    await outputs.emit("output", collected);
  }
}

/** Loops emitting increasing integers until the run's cancel signal fires. */
export class Loop extends BaseNode {
  static readonly nodeType = "test.execution.Loop";
  static readonly title = "Loop";
  static readonly description = "Loops until cancelled";
  static readonly isStreamingInput = true;

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    _context?: ProcessingContext
  ): Promise<void> {
    for (let i = 0; i < 100_000; i++) {
      if (inputs.signal.aborted) return;
      await outputs.emit("output", i);
      await new Promise((r) => setTimeout(r, 1));
    }
  }
}

export function buildTestRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registry.register(ValueInput);
  registry.register(StreamingValueInput);
  registry.register(Double);
  registry.register(StreamSink);
  registry.register(Loop);
  return registry;
}
