/**
 * Hermetic fixture nodes for journeys the real node registry has no node
 * for: a controllable long-running actor (mid-run cancellation while a node
 * is `running`) and an externally-fed streaming input (mid-run cancellation
 * while a node is mid-stream). Every other C2 journey uses real registered
 * `nodetool.*` node classes from `@nodetool-ai/base-nodes` (§5: "prefer core
 * nodes... so the kernel driver can run them too") — these three fill the
 * one gap: no shipped node exposes a controllable busy-loop or a
 * `pushInput`-fed external stream.
 *
 * Registered identically into both drivers' registries (`registry.ts` for
 * the kernel driver, `configureRegistry` for the ws-server driver) so their
 * behavior is byte-identical on both surfaces — modeled on the equivalent
 * fixtures in `packages/execution/tests/fixtures.ts`.
 */
import {
  BaseNode,
  prop,
  type NodeRegistry,
  type StreamingInputs,
  type StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/**
 * External input node whose output is structurally streaming (the trivial
 * `genProcess` override flips `hasStreamingOutput()`), so the kernel keeps
 * its downstream inbox open for `pushInput`/`finishInputStream` (and the
 * ws-server's `stream_input`/`end_input_stream` commands) instead of
 * dispatching a one-shot default. The generator itself is never invoked when
 * the node has no incoming edges — the kernel dispatches it as an external
 * input, not a spawned actor.
 *
 * The `nodetool.input.` prefix is load-bearing, not cosmetic: the kernel's
 * `_isExternalInputNode`/`_dispatchInputs` (`runner.ts`) recognize external
 * inputs by type-prefix, not by the `genProcess` override alone. A type
 * outside that prefix (e.g. an early `test.reliability.*` draft of this
 * fixture) gets spawned as an ordinary zero-input actor instead — it runs
 * `genProcess` once to completion immediately, which defeats the whole
 * point of a `pushInput`-fed external stream.
 */
export class ReliabilityStreamingInputNode extends BaseNode {
  static readonly nodeType = "nodetool.input.ReliabilityStreamingInput";
  static readonly title = "Reliability Streaming Input";
  static readonly description =
    "Test fixture: external input fed by pushInput/stream_input.";

  @prop({ type: "any", default: null })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value };
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    yield { output: this.value };
  }
}

/** Collects every value streamed on its `value` input into one terminal array. */
export class ReliabilityStreamSinkNode extends BaseNode {
  static readonly nodeType = "test.reliability.StreamSink";
  static readonly title = "Reliability Stream Sink";
  static readonly description = "Test fixture: collects streamed values.";
  static readonly isStreamingInput = true;

  /** Never invoked directly — the kernel dispatches streaming-input nodes
   * through `run()`. Required only to satisfy `BaseNode`'s abstract member. */
  async process(): Promise<Record<string, unknown>> {
    return { output: [] };
  }

  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const collected: unknown[] = [];
    for await (const value of inputs.stream("value")) {
      collected.push(value);
    }
    // A cancellation is exactly what closes the loop above without a
    // natural EOS. Skipping the final emit in that case is deliberate, not
    // just tidy: `WorkflowRunner._sendMessages` (the code path an
    // `outputs.emit()` call after the loop would reach) gates on
    // `this._cancelled` and no-ops once it's set — but the kernel driver's
    // in-process `cancel()` and the ws-server driver's networked
    // `cancel_job` command reach that flag at genuinely different wall-clock
    // offsets from this actor's own scheduling, so whether the runner's own
    // gate has already flipped by the time this line would run is a race
    // between the two surfaces, not just within one. Checking the signal
    // here makes the "no output_update after a cancellation" outcome this
    // fixture's own deterministic behavior instead of an incidental timing
    // race the recorded stream would otherwise expose.
    if (inputs.signal.aborted) return;
    await outputs.emit("output", collected);
  }
}

/**
 * A busy node with no incoming edges: parked on the run's own
 * `AbortSignal` — busy from the graph's perspective, distinct from journey
 * 6b's `nodetool.input.*`-fed streaming node — until the run is cancelled.
 *
 * Two earlier designs both raced:
 *   - Polling `inputs.signal.aborted` in a `setTimeout`-paced loop raced the
 *     runner's own cancel bookkeeping — whether this actor's `run()`
 *     returned before or after `WorkflowRunner` finished processing
 *     `cancel()` depended on `setTimeout` scheduling granularity, so the
 *     exact frame sequence differed from run to run *on the same driver*,
 *     not just across drivers (§6: "two runs ... produce identical
 *     normalized streams").
 *   - Blocking on `inputs.stream()` for a handle no edge ever targets
 *     doesn't block at all: the inbox has zero registered writers for it
 *     from the start, so `stream()` resolves as an immediate EOS and the
 *     actor "completes" before any cancel command can possibly land.
 *
 * Listening for the signal's `abort` event is neither: it makes no progress
 * of its own to race, and resolves only once, however long that takes.
 */
export class ReliabilityCancelProbeNode extends BaseNode {
  static readonly nodeType = "test.reliability.CancelProbe";
  static readonly title = "Reliability Cancel Probe";
  static readonly description = "Test fixture: blocks until cancelled.";
  static readonly isStreamingInput = true;

  /** Never invoked directly — see {@link ReliabilityStreamSinkNode.process}. */
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(inputs: StreamingInputs): Promise<void> {
    if (inputs.signal.aborted) return;
    await new Promise<void>((resolve) => {
      inputs.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }
}

/**
 * Writes bytes through `context.storage` — the one write op every real
 * asset-producing node eventually calls. Exists purely as a deterministic,
 * hermetic target for task D3's `host-disk-full` fault: no shipped node
 * writes an asset without also touching media-ref plumbing this fixture
 * doesn't need to exercise. A missing `context.storage` (the normal
 * fault-free hermetic default — `ExecutionSession`'s own minimal context
 * wires none) is a configuration error for a journey using this node, not a
 * silent no-op, so it throws rather than skipping the write.
 */
export class ReliabilityStorageWriteNode extends BaseNode {
  static readonly nodeType = "test.reliability.StorageWrite";
  static readonly title = "Reliability Storage Write";
  static readonly description =
    "Test fixture: writes bytes through context.storage (task D3's host-disk-full fault).";

  @prop({ type: "str", default: "reliability-fixture" })
  declare key: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    if (!context?.storage) {
      throw new Error(
        "ReliabilityStorageWriteNode requires a ProcessingContext with storage wired"
      );
    }
    const uri = await context.storage.store(
      `${this.key}.bin`,
      new Uint8Array([1, 2, 3]),
      "application/octet-stream"
    );
    return { output: uri };
  }
}

export const RELIABILITY_FIXTURE_NODES = [
  ReliabilityStreamingInputNode,
  ReliabilityStreamSinkNode,
  ReliabilityCancelProbeNode,
  ReliabilityStorageWriteNode
] as const;

/** Registers the harness's own fixture nodes into a live registry. Idempotent
 * (last-write-wins, matching `NodeRegistry.register`), so it's safe to call
 * on both a fresh kernel-driver registry and a shared ws-server registry via
 * `configureRegistry`. */
export function registerFixtureNodes(registry: NodeRegistry): void {
  for (const nodeClass of RELIABILITY_FIXTURE_NODES) {
    registry.register(nodeClass);
  }
}
