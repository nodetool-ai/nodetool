/**
 * Event-driven scheduling for a dependency graph.
 *
 * The task and step executors used to dispatch in barrier rounds: start every
 * ready node, wait for the slowest, recompute the ready set. A chain behind a
 * slow sibling therefore waited on the sibling in every round, and the round
 * cap turned depth into failure. Here a node starts the moment its last
 * dependency settles, and what bounds the work is the run's semaphore and the
 * run budget rather than a count of rounds.
 *
 * The scheduler owns dependency state and event order; it knows nothing about
 * tasks, steps, or messages. A caller supplies the nodes, a generator per node,
 * and the events to emit when a node settles or is blocked.
 *
 * Order is the round loop's: a node's own events, then its settle events, then
 * the blocked events of everything downstream of it, and only then are the
 * nodes it unblocked started. Events of nodes running concurrently interleave,
 * as they always did.
 */

import type { Semaphore } from "@nodetool-ai/runtime";
import { createDynamicMerge } from "./merge-generators.js";

/** Reason given to `settle` for a node nothing could ever run. */
export const UNSATISFIABLE_DEPENDENCY = "unsatisfiable dependency";
/** Reason given to `settle` for a node still unsettled when the signal fired. */
export const ABORTED = "aborted";

export interface DagNode {
  id: string;
  dependsOn: readonly string[];
}

export type DagOutcome = "ok" | "failed";

/**
 * How a node's generator settled. A generator that returns nothing settled
 * `ok` — a run that fails reports it, since a failure that throws is an
 * exception and propagates instead.
 */
export interface DagRunResult {
  outcome: DagOutcome;
  error?: string;
}

export interface DagScheduleOptions<N extends DagNode, E> {
  nodes: readonly N[];
  /** The node's event stream. Its return value carries how the node settled. */
  run: (node: N) => AsyncGenerator<E, DagRunResult | void>;
  /** Terminal events for a node that ran, or that could never run. */
  settle: (node: N, outcome: DagOutcome, error?: string) => E[];
  /** Permit pool bounding how many nodes run at once across the whole run. */
  concurrency: Semaphore;
  /**
   * Bound on the nodes *this* schedule runs at once, on top of the pool. A
   * pool shared by several schedules bounds them together; this bounds one of
   * them. Unset, only the pool bounds it.
   */
  maxConcurrent?: number;
  signal?: AbortSignal;
  /**
   * Events for a node that will never run because `by` failed. Called once per
   * blocked node, naming the failed dependency immediately above it, and the
   * blocked node counts as failed for everything below it (I-5: a failed
   * dependency is never satisfied).
   */
  onBlocked: (node: N, by: N) => E[];
}

/**
 * Run the graph, yielding every event its nodes produce.
 *
 * Ends when every node has settled. A state with unsettled nodes, nothing
 * running and nothing ready cannot happen for a graph `PlanBuilder` accepted —
 * it rejects cycles on the way in — so the scheduler asserts progress rather
 * than hanging: those nodes settle failed with
 * {@link UNSATISFIABLE_DEPENDENCY}.
 *
 * An exception thrown by a node's generator propagates once the other running
 * generators have drained; that node never settles and the post-run settling
 * is skipped, which is what the merge has always done.
 *
 * On abort the stream ends, every running generator is returned, and every
 * node still unsettled — the ones that were running included — settles failed
 * with {@link ABORTED}. A generator parked on an `await` that ignores the
 * signal cannot be returned until that await resolves, so a node's own work
 * must honour the signal; the merge has always required this of its producers.
 *
 * Work is O(nodes + edges): each node is settled once and each edge is walked
 * once, whether it is decremented on success or followed by the block cascade.
 */
export async function* scheduleDag<N extends DagNode, E>(
  opts: DagScheduleOptions<N, E>
): AsyncGenerator<E> {
  const { nodes, run, settle, concurrency, maxConcurrent, signal, onBlocked } =
    opts;

  /** Nodes depending on the keyed id, in the order the caller listed them. */
  const dependents = new Map<string, N[]>();
  /** Dependencies each node is still waiting on. */
  const waitingOn = new Map<string, number>();
  for (const node of nodes) {
    waitingOn.set(node.id, node.dependsOn.length);
    for (const dep of node.dependsOn) {
      const list = dependents.get(dep);
      if (list) {
        list.push(node);
      } else {
        dependents.set(dep, [node]);
      }
    }
  }

  const settled = new Set<string>();
  /** Grows monotonically; `readyCursor` marks what has been started. */
  const ready: N[] = [];
  let readyCursor = 0;
  let inFlight = 0;

  const merge = createDynamicMerge<E>({
    semaphore: concurrency,
    concurrency: maxConcurrent,
    signal
  });

  /**
   * Mark every unsettled node downstream of a failure and collect their
   * blocked events. Breadth-first, so each node names the dependency directly
   * above it, which is the id the round loop reported.
   */
  function blockDependents(failedNode: N): E[] {
    const events: E[] = [];
    // A cursor, not a shift: `Array.shift` is O(length), which would make a
    // wide cascade quadratic in the number of blocked nodes.
    const frontier: N[] = [failedNode];
    for (let i = 0; i < frontier.length; i++) {
      const blocking = frontier[i];
      for (const dependent of dependents.get(blocking.id) ?? []) {
        if (settled.has(dependent.id)) continue;
        settled.add(dependent.id);
        events.push(...onBlocked(dependent, blocking));
        frontier.push(dependent);
      }
    }
    return events;
  }

  function releaseDependents(node: N): void {
    for (const dependent of dependents.get(node.id) ?? []) {
      if (settled.has(dependent.id)) continue;
      const left = (waitingOn.get(dependent.id) ?? 0) - 1;
      waitingOn.set(dependent.id, left);
      if (left === 0) ready.push(dependent);
    }
  }

  function startReady(): void {
    while (readyCursor < ready.length) {
      const node = ready[readyCursor++];
      inFlight++;
      merge.add(wrap(node));
    }
  }

  function wrap(node: N): AsyncGenerator<E> {
    return (async function* (): AsyncGenerator<E> {
      let outcome: DagOutcome | null = null;
      try {
        // Nothing past the `yield*` runs when the consumer stops early: an
        // abort leaves this node unsettled on purpose, and the post-run pass
        // settles it with the reason the run actually ended for.
        const result = yield* run(node);
        outcome = result ? result.outcome : "ok";
        // Bookkeeping first, and in one uninterrupted stretch: a `yield`
        // hands control to another node's wrapper, which must not see this
        // node half-settled.
        settled.add(node.id);
        const terminal = settle(
          node,
          outcome,
          result ? result.error : undefined
        );
        const cascade = outcome === "failed" ? blockDependents(node) : [];
        for (const event of terminal) {
          yield event;
        }
        for (const event of cascade) {
          yield event;
        }
      } finally {
        inFlight--;
        // A node whose generator threw releases nothing: the exception is on
        // its way out of the merge, and this only keeps the stream from
        // waiting on a node that will never settle. Dependents are released
        // here, after the terminal events above, and not before them: a
        // sibling's `finally` calls `startReady` too, and a dependent pushed
        // to `ready` before its dependency's settle events were yielded could
        // start between them.
        if (outcome !== null) {
          if (outcome === "ok") releaseDependents(node);
          startReady();
        }
        // Every node settled, or nothing left that could start one: either
        // way no further generator will be added, so let the stream end.
        if (inFlight === 0) merge.close();
      }
    })();
  }

  for (const node of nodes) {
    if (node.dependsOn.length === 0) ready.push(node);
  }
  startReady();
  if (inFlight === 0) merge.close();

  for await (const event of merge.stream()) {
    yield event;
  }

  // Unsettled leftovers: a node the abort cut short, or one whose dependencies
  // can never be satisfied. Neither may be left looking like it is still
  // running.
  const reason = signal?.aborted ? ABORTED : UNSATISFIABLE_DEPENDENCY;
  for (const node of nodes) {
    if (settled.has(node.id)) continue;
    settled.add(node.id);
    for (const event of settle(node, "failed", reason)) {
      yield event;
    }
  }
}
