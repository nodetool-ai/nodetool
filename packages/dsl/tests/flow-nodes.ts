/**
 * Test nodes for the native-flow suites. Registered into a local
 * {@link NodeRegistry} per test file, so nothing leaks into `NodeRegistry.global`.
 */
import { BaseNode, NodeRegistry, prop } from "@nodetool-ai/node-sdk";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/runtime";

/** Records what each node instance did, so tests can assert on lifecycle. */
export const lifecycle = {
  initialized: [] as string[],
  finalized: [] as string[],
  processed: [] as string[],
  cleanedUp: [] as string[],
  emitted: 0,
  reset(): void {
    this.initialized = [];
    this.finalized = [];
    this.processed = [];
    this.cleanedUp = [];
    this.emitted = 0;
  }
};

export class EchoNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.Echo";
  static readonly title = "Echo";

  @prop({ type: "str", default: "" })
  declare text: string;

  async initialize(): Promise<void> {
    lifecycle.initialized.push(EchoNode.nodeType);
  }

  async finalize(): Promise<void> {
    lifecycle.finalized.push(EchoNode.nodeType);
  }

  async process(): Promise<Record<string, unknown>> {
    lifecycle.processed.push(EchoNode.nodeType);
    return { output: this.text };
  }
}

/** Yields `count` records; the folded result must be the last one. */
export class CounterNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.Counter";
  static readonly title = "Counter";

  @prop({ type: "int", default: 3 })
  declare count: number;

  async process(): Promise<Record<string, unknown>> {
    return { value: this.count, done: false };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    try {
      for (let i = 0; i < this.count; i++) {
        yield { value: i };
      }
      yield { done: true };
    } finally {
      lifecycle.cleanedUp.push(CounterNode.nodeType);
    }
  }
}

/** Never ends on its own — for abort and early-break tests. */
export class ForeverNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.Forever";
  static readonly title = "Forever";

  @prop({ type: "int", default: 5 })
  declare delayMs: number;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    try {
      for (let i = 0; ; i++) {
        await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        yield { value: i };
      }
    } finally {
      lifecycle.cleanedUp.push(ForeverNode.nodeType);
    }
  }
}

export class BoomNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.Boom";
  static readonly title = "Boom";

  async finalize(): Promise<void> {
    lifecycle.finalized.push(BoomNode.nodeType);
  }

  async process(): Promise<Record<string, unknown>> {
    throw new Error("boom");
  }
}

/** Streaming-input node: reads `items`, emits one `line` per item. */
export class UppercaseStreamNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.UppercaseStream";
  static readonly title = "Uppercase Stream";
  static readonly isStreamingInput = true;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    _context?: ProcessingContext
  ): Promise<void> {
    try {
      for await (const item of inputs.stream("items")) {
        await outputs.emit("line", String(item).toUpperCase());
        lifecycle.emitted++;
      }
      await outputs.emit("count", lifecycle.emitted);
    } finally {
      lifecycle.cleanedUp.push(UppercaseStreamNode.nodeType);
    }
  }
}

/** Streaming-input node draining `any()`, so arrival order is observable. */
export class InterleaveNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.Interleave";
  static readonly title = "Interleave";
  static readonly isStreamingInput = true;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    for await (const [handle, item] of inputs.any()) {
      await outputs.emit("pair", `${handle}:${String(item)}`);
    }
  }
}

/** Emits a group of three slots at once — the flow flattens it. */
export class GroupEmitNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.GroupEmit";
  static readonly title = "Group Emit";
  static readonly isStreamingInput = true;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    for await (const item of inputs.stream("items")) {
      await outputs.emitGroup({ left: item, right: item, index: 0 });
    }
  }
}

/** Emits `count` items as fast as it can — for the backpressure test. */
export class FloodNode extends BaseNode {
  static readonly nodeType = "nodetool.flowtest.Flood";
  static readonly title = "Flood";
  static readonly isStreamingInput = true;

  @prop({ type: "int", default: 10 })
  declare count: number;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs
  ): Promise<void> {
    for (let i = 0; i < this.count; i++) {
      await outputs.emit("value", i);
      lifecycle.emitted++;
    }
  }
}

export function buildTestRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  for (const NodeClass of [
    EchoNode,
    CounterNode,
    ForeverNode,
    BoomNode,
    UppercaseStreamNode,
    InterleaveNode,
    GroupEmitNode,
    FloodNode
  ]) {
    registry.register(NodeClass);
  }
  return registry;
}
