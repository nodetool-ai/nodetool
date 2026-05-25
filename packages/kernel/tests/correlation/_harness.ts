/**
 * Shared harness for the correlation conformance suite.
 *
 * Builds workflow runs from a declarative description so each conformance
 * file can focus on the algebra under test (forward preserves, iteration
 * extends, aggregate collapses, …) rather than re-implementing executor
 * wiring per test.
 *
 * The suite is organised by capability — see `tests/correlation/README.md`
 * for the test matrix. Most tests assert two things in parallel:
 *
 *   1. **Values**: what the user sees (catches functional bugs).
 *   2. **Lineage envelopes**: what the scheduler sees (catches future
 *      scheduler breakage before it reaches users — e.g. sibling Zip
 *      outputs accidentally getting independent tokens).
 *
 * Helpers in `_assertions.ts` provide the algebraic shorthand
 * (`assertSameLineage`, `assertRootIndex`, …) so tests read as algebra,
 * not bug regressions.
 */

import { expect } from "vitest";
import type {
  CorrelationLineage,
  Edge,
  NodeDescriptor
} from "@nodetool-ai/protocol";
import { WorkflowRunner, type RunResult } from "../../src/runner.js";
import type { NodeExecutor } from "../../src/actor.js";
import type { MessageEnvelope } from "../../src/inbox.js";
import type { NodeInputs, NodeOutputs } from "../../src/io.js";

export type { CorrelationLineage, NodeDescriptor, Edge, MessageEnvelope };

export const FLAG = "NODETOOL_USE_CORRELATION";

/**
 * Run a workflow under `NODETOOL_USE_CORRELATION=1` (or `0`, if `flagOff`),
 * resolve executors from the supplied map keyed by node id, and return the
 * runner result plus the per-handle captured envelopes for any node id
 * declared with `captureFrom`.
 */
export interface RunOptions {
  nodes: NodeDescriptor[];
  edges: Edge[];
  /** Map node id → executor. */
  executors: Record<string, NodeExecutor>;
  /**
   * For each (nodeId, handleList), capture every envelope arriving on
   * those handles. The harness inserts a streaming sink that records
   * envelopes; declare nodes in `nodes` with `is_streaming_input: true`
   * and let the harness install the capture executor.
   */
  captureFrom?: Record<string, string[]>;
  /** Pre-set the flag value; defaults to "1". */
  flag?: "0" | "1";
  /** Optional runtime params. */
  params?: Record<string, unknown>;
  jobId?: string;
}

export interface RunWithCapture {
  result: RunResult;
  /** Node id → handle → envelopes in arrival order. */
  captured: Map<string, Map<string, MessageEnvelope[]>>;
}

/**
 * Convenience: install a capturing executor for every (nodeId, handles)
 * pair declared in `captureFrom`. The capture executor is streaming-input
 * and drains the named handles, pushing each envelope into the result map.
 */
function installCaptureExecutors(
  opts: RunOptions
): {
  executors: Record<string, NodeExecutor>;
  captured: Map<string, Map<string, MessageEnvelope[]>>;
} {
  const captured = new Map<string, Map<string, MessageEnvelope[]>>();
  const executors = { ...opts.executors };
  for (const [nodeId, handles] of Object.entries(opts.captureFrom ?? {})) {
    const perHandle = new Map<string, MessageEnvelope[]>();
    for (const h of handles) perHandle.set(h, []);
    captured.set(nodeId, perHandle);
    executors[nodeId] = {
      async process() {
        return {};
      },
      async run(inputs: NodeInputs) {
        // Drain each named handle concurrently.
        await Promise.all(
          handles.map(async (handle) => {
            for await (const env of inputs.streamWithEnvelope(handle)) {
              perHandle.get(handle)!.push(env);
            }
          })
        );
      }
    };
  }
  return { executors, captured };
}

export async function runWorkflow(opts: RunOptions): Promise<RunWithCapture> {
  const originalFlag = process.env[FLAG];
  process.env[FLAG] = opts.flag ?? "1";
  try {
    const { executors, captured } = installCaptureExecutors(opts);
    const runner = new WorkflowRunner(opts.jobId ?? "conformance", {
      resolveExecutor: (node) => {
        const exec = executors[node.id];
        if (exec) return exec;
        // Input/constant nodes are dispatched by the runner from properties;
        // their executor is never invoked. Return a no-op shell so initialize
        // doesn't trip on missing executors.
        if (
          node.type.startsWith("nodetool.input.") ||
          node.type.startsWith("nodetool.constant.")
        ) {
          return {
            async process() {
              return {};
            }
          };
        }
        throw new Error(`No executor registered for node id "${node.id}"`);
      }
    });
    const result = await runner.run(
      { job_id: opts.jobId ?? "conformance", params: opts.params ?? {} },
      { nodes: opts.nodes, edges: opts.edges }
    );
    return { result, captured };
  } finally {
    if (originalFlag === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalFlag;
    }
  }
}

/**
 * Run a workflow and expect it to fail at graph load with a message
 * matching `pattern`. Returns the error text so the caller can pin
 * additional details if needed.
 */
export async function expectGraphRejected(
  opts: RunOptions,
  pattern: RegExp
): Promise<string> {
  const out = await runWorkflow(opts);
  expect(out.result.status).toBe("failed");
  const err = out.result.error ?? "";
  expect(err).toMatch(pattern);
  return err;
}

// ---------------------------------------------------------------------------
// Common node executors used across many tests
// ---------------------------------------------------------------------------

/**
 * Buffered passthrough: `process(ins)` returns `{ value: ins.value }`.
 * Default executor when the node behaviour is "just forward by lineage
 * identity" — for testing `single`/`forward` semantics.
 */
export function passthrough(): NodeExecutor {
  return {
    async process(ins) {
      return { value: ins.value };
    }
  };
}

/**
 * Buffered map: applies `fn` to `ins.value`.
 */
export function mapNode(fn: (v: unknown) => unknown): NodeExecutor {
  return {
    async process(ins) {
      return { value: fn(ins.value) };
    }
  };
}

/**
 * Stream-mode forward: copies each envelope's lineage via outputs.forward.
 */
export function forwardNode(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      for await (const env of inputs.streamWithEnvelope("value")) {
        await outputs.forward("value", env);
      }
    }
  };
}

/**
 * Stream-mode filter that drops every value failing `pred`. Drops are
 * announced via `outputs.drop(env)` so downstream joins skip the key.
 */
export function filterNode(pred: (v: unknown) => boolean): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      for await (const env of inputs.streamWithEnvelope("value")) {
        if (pred(env.data)) {
          await outputs.forward("value", env);
        } else {
          await outputs.drop("value", env);
        }
      }
    }
  };
}

/**
 * Streaming-output iteration: emits each element of `list` as a frame.
 * The actor mints tokens; the node may declare `output_correlation` of
 * `iteration` over `__execution__` for the analyzer.
 */
export function foreachNode(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async *genProcess(ins: Record<string, unknown>) {
      const raw = ins.input_list ?? [];
      const list = Array.isArray(raw) ? raw : [raw];
      for (let i = 0; i < list.length; i++) {
        yield { output: list[i], index: i };
      }
    }
  };
}

/**
 * Stream-mode aggregator: drains every value on `input_item` and emits a
 * single `output` list. Used to validate `aggregate(innermost)` collapse.
 */
export function collectNode(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      const items: unknown[] = [];
      for await (const v of inputs.stream("input_item")) {
        items.push(v);
      }
      await outputs.emit("output", items);
    }
  };
}

/**
 * Stream-mode last: emits only the final value. Aggregator collapse.
 */
export function lastNode(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      let last: unknown = undefined;
      let seen = false;
      for await (const v of inputs.stream("input_item")) {
        last = v;
        seen = true;
      }
      if (seen) await outputs.emit("output", last);
    }
  };
}

/**
 * Stream-mode count.
 */
export function countNode(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      let n = 0;
      for await (const _ of inputs.stream("input_item")) {
        n++;
      }
      await outputs.emit("output", n);
    }
  };
}

/**
 * Seed source: emits the given (value, lineage) pairs in order via
 * `outputs.emit(slot, value, { lineage })`. Useful to seed specific
 * lineages without modelling a full upstream chain.
 */
export function seedSource(
  emissions: Array<{ value: unknown; lineage: CorrelationLineage }>,
  slot: string = "value"
): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(_inputs: NodeInputs, outputs: NodeOutputs) {
      for (const { value, lineage } of emissions) {
        await outputs.emit(slot, value, { lineage });
      }
    }
  };
}

/**
 * Joiner that returns `{ value: ins.left + "|" + ins.right }`.
 */
export function joinNode(): NodeExecutor {
  return {
    async process(ins) {
      return { value: `${ins.left}|${ins.right}` };
    }
  };
}

/**
 * Stream-mode Zip implementation matching `ZipNode` semantics. Provided so
 * conformance tests can exercise the actor's emitGroup wiring without
 * pulling base-nodes into the kernel test scope.
 */
export function zipExecutor(): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      const parentScope = inputs.invocationScope();
      const parentSet = new Set(parentScope);
      const findDiff = (handle: string): string => {
        const scope = inputs.scopeFor(handle);
        const d = scope.filter((r) => !parentSet.has(r));
        if (d.length !== 1) {
          throw new Error(
            `Zip handle "${handle}" must have exactly one differing root; got ${d.length}`
          );
        }
        return d[0];
      };
      const ld = findDiff("left");
      const rd = findDiff("right");
      const projParent = (env: MessageEnvelope) =>
        parentScope.length === 0
          ? ""
          : parentScope
              .map((r) => `${r}=${env.correlation_lineage[r]?.index ?? "?"}`)
              .join(",");
      const lefts = new Map<string, { data: unknown; index: number }>();
      const rights = new Map<string, { data: unknown; index: number }>();
      const flush = async () => {
        for (const [k, l] of lefts) {
          const r = rights.get(k);
          if (!r) continue;
          lefts.delete(k);
          rights.delete(k);
          await outputs.emitGroup({
            left: l.data,
            right: r.data,
            index: l.index
          });
        }
      };
      const leftLoop = (async () => {
        for await (const env of inputs.streamWithEnvelope("left")) {
          const idx = env.correlation_lineage[ld].index;
          lefts.set(`${projParent(env)}|${idx}`, { data: env.data, index: idx });
          await flush();
        }
      })();
      const rightLoop = (async () => {
        for await (const env of inputs.streamWithEnvelope("right")) {
          const idx = env.correlation_lineage[rd].index;
          rights.set(`${projParent(env)}|${idx}`, { data: env.data, index: idx });
          await flush();
        }
      })();
      await Promise.all([leftLoop, rightLoop]);
      await flush();
    }
  };
}

/**
 * Stream-mode Cross implementation matching `CrossNode` semantics.
 */
export function crossExecutor(maxOutput: number = 1024): NodeExecutor {
  return {
    async process() {
      return {};
    },
    async run(inputs: NodeInputs, outputs: NodeOutputs) {
      const parentScope = inputs.invocationScope();
      const projParent = (env: MessageEnvelope) =>
        parentScope.length === 0
          ? ""
          : parentScope
              .map((r) => `${r}=${env.correlation_lineage[r]?.index ?? "?"}`)
              .join(",");
      const leftByP = new Map<string, unknown[]>();
      const rightByP = new Map<string, unknown[]>();
      const leftLoop = (async () => {
        for await (const env of inputs.streamWithEnvelope("left")) {
          const pk = projParent(env);
          let b = leftByP.get(pk);
          if (!b) {
            b = [];
            leftByP.set(pk, b);
          }
          b.push(env.data);
        }
      })();
      const rightLoop = (async () => {
        for await (const env of inputs.streamWithEnvelope("right")) {
          const pk = projParent(env);
          let b = rightByP.get(pk);
          if (!b) {
            b = [];
            rightByP.set(pk, b);
          }
          b.push(env.data);
        }
      })();
      await Promise.all([leftLoop, rightLoop]);
      let emitted = 0;
      for (const [pk, ls] of leftByP) {
        const rs = rightByP.get(pk) ?? [];
        for (const l of ls) {
          for (const r of rs) {
            if (emitted >= maxOutput) {
              throw new Error(
                `Cross exceeded max_output_count (${maxOutput})`
              );
            }
            await outputs.emitGroup({ left: l, right: r });
            emitted++;
          }
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Descriptor builders — keep tests readable
// ---------------------------------------------------------------------------

export function iterationOutput(
  group: string,
  source: string = "__execution__"
): { kind: "iteration"; source: string; group: string } {
  return { kind: "iteration", source, group };
}

export function forwardOutput(
  source: string
): { kind: "forward"; source: string } {
  return { kind: "forward", source };
}

export function singleOutput(
  source: string = "__execution__"
): { kind: "single"; source: string } {
  return { kind: "single", source };
}

export function aggregateOutput(
  source: string
): { kind: "aggregate"; source: string; collapse: "innermost" } {
  return { kind: "aggregate", source, collapse: "innermost" };
}

export function chunkOutput(
  source: string = "__execution__"
): { kind: "chunk"; source: string } {
  return { kind: "chunk", source };
}

export function dataEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  id?: string
): Edge {
  return { id: id ?? `${source}.${sourceHandle}->${target}.${targetHandle}`, source, sourceHandle, target, targetHandle };
}
