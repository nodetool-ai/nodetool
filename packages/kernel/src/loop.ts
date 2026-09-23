/**
 * Loop node runtime: the actor mode for `nodetool.control.Loop`.
 *
 * A Loop starts one run per parent key of `initial`, emits each iteration on
 * `value`/`index` under the loop root, and waits for the body to feed back
 * `next` (and `condition` when wired) for that iteration. It then either
 * starts the next iteration or emits `done` at the parent key.
 *
 * The body is a cycle, so its EOS cannot end the loop. The Loop closes
 * `value`/`index` itself once `initial` has closed and no run is active; EOS
 * then flows around the body into the feedback inputs and the inbox drains.
 * Runs whose feedback can no longer arrive end without a `done` value: when a
 * feedback input has closed, or when the runner reports the graph quiescent.
 * docs/workflow-loops.md.
 */

import { createLogger } from "@nodetool-ai/config";
import type { CorrelationLineage, NodeDescriptor } from "@nodetool-ai/protocol";
import { loopRootId } from "@nodetool-ai/protocol";
import type { NodeAnalysis } from "./correlation-analysis.js";
import { tryProjectLineageKey } from "./correlation-analysis.js";
import type { MessageEnvelope, NodeInbox } from "./inbox.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label
const log = createLogger("nodetool.kernel.loop");

export const DEFAULT_MAX_ITERATIONS = 10;
export const MAX_ITERATIONS_LIMIT = 1000;

/** Clamp the `max_iterations` property to [1, MAX_ITERATIONS_LIMIT]. */
export function resolveMaxIterations(raw: unknown): number {
  const n = Math.floor(Number(raw ?? DEFAULT_MAX_ITERATIONS));
  if (!Number.isFinite(n)) return DEFAULT_MAX_ITERATIONS;
  return Math.min(MAX_ITERATIONS_LIMIT, Math.max(1, n));
}

/** What the Loop runtime needs from its actor. */
export interface LoopHost {
  node: NodeDescriptor;
  inbox: NodeInbox;
  analysis: NodeAnalysis;
  /** Route `value` on `slot` downstream with an explicit lineage. */
  emit(
    slot: string,
    value: unknown,
    lineage: CorrelationLineage
  ): Promise<void>;
  /** Close an output slot early (EOS on its outgoing edges). */
  closeSlot(slot: string): void;
  /** Surface a node warning to the client. */
  warn(message: string): void;
}

interface LoopRun {
  parent: CorrelationLineage;
  iteration: number;
  next?: MessageEnvelope;
  condition?: MessageEnvelope;
}

export async function runLoop(host: LoopHost): Promise<void> {
  const { node, inbox, analysis } = host;
  const parentScope = analysis.invocationScope;
  const root = loopRootId(node.id);
  const maxIterations = resolveMaxIterations(node.properties?.max_iterations);
  const handles = new Set(inbox.handles());
  const initialWired = handles.has("initial");
  const conditionWired = handles.has("condition");

  const runs = new Map<string, LoopRun>();
  const started = new Set<string>();
  let iterationsClosed = false;

  const parentOf = (lineage: CorrelationLineage): CorrelationLineage => {
    const parent: Record<string, { index: number }> = {};
    for (const r of parentScope) {
      const token = lineage[r];
      if (token) parent[r] = token;
    }
    return parent;
  };

  const emitIteration = async (run: LoopRun, value: unknown) => {
    const lineage = { ...run.parent, [root]: { index: run.iteration } };
    await host.emit("value", value, lineage);
    await host.emit("index", run.iteration, lineage);
  };

  const start = async (lineage: CorrelationLineage, value: unknown) => {
    const key = tryProjectLineageKey(lineage, parentScope) ?? "";
    if (started.has(key)) {
      log.warn("Loop ignored a second initial value for the same key", {
        nodeId: node.id,
        key
      });
      return;
    }
    started.add(key);
    const run: LoopRun = { parent: parentOf(lineage), iteration: 0 };
    runs.set(key, run);
    await emitIteration(run, value);
  };

  const endWithoutResult = (key: string, reason: string) => {
    const run = runs.get(key);
    if (!run) return;
    runs.delete(key);
    log.info("Loop run ended without a result", {
      nodeId: node.id,
      key,
      iteration: run.iteration,
      reason
    });
  };

  const decide = async (key: string, run: LoopRun) => {
    const value = run.next!.data;
    const again = conditionWired ? Boolean(run.condition!.data) : true;
    if (again && run.iteration + 1 < maxIterations) {
      run.iteration += 1;
      run.next = undefined;
      run.condition = undefined;
      await emitIteration(run, value);
      return;
    }
    if (again && conditionWired) {
      host.warn(
        `Loop stopped after max_iterations (${maxIterations}) while its condition was still true.`
      );
    }
    runs.delete(key);
    await host.emit("done", value, run.parent);
  };

  const onFeedback = async (handle: "next" | "condition", env: MessageEnvelope) => {
    const key = tryProjectLineageKey(env.correlation_lineage, parentScope);
    const run = key === null ? undefined : runs.get(key);
    const iteration = env.correlation_lineage[root]?.index;
    if (!run || iteration !== run.iteration) {
      log.warn("Loop dropped feedback for an iteration that is not waiting", {
        nodeId: node.id,
        handle,
        key,
        iteration
      });
      return;
    }
    if (run[handle]) {
      log.warn("Loop received a second feedback value for one iteration", {
        nodeId: node.id,
        handle,
        key,
        iteration
      });
    }
    run[handle] = env;
    if (run.next && (!conditionWired || run.condition)) {
      await decide(key!, run);
    }
  };

  const closedAndEmpty = (handle: string) =>
    !inbox.isOpen(handle) && !inbox.hasBuffered(handle);

  if (!initialWired) {
    await start({}, node.properties?.initial ?? null);
  }

  while (true) {
    const popped = inbox.tryPopAnyWithEnvelope();
    if (popped) {
      const [handle, env] = popped;
      if (handle === "initial") {
        await start(env.correlation_lineage, env.data);
      } else if (handle === "next" || handle === "condition") {
        await onFeedback(handle, env);
      }
      continue;
    }
    if (inbox.isClosed()) break;

    if (inbox.takeQuiescent()) {
      for (const key of [...runs.keys()]) {
        endWithoutResult(key, "the loop body stopped feeding back");
      }
    }
    for (const [key, run] of [...runs]) {
      if (!run.next && closedAndEmpty("next")) {
        endWithoutResult(key, '"next" closed');
      } else if (conditionWired && !run.condition && closedAndEmpty("condition")) {
        endWithoutResult(key, '"condition" closed');
      }
    }
    if (
      !iterationsClosed &&
      runs.size === 0 &&
      (!initialWired || closedAndEmpty("initial"))
    ) {
      iterationsClosed = true;
      host.closeSlot("value");
      host.closeSlot("index");
    }

    if (inbox.isFullyDrained()) break;
    await inbox.waitForActivity();
  }
}
