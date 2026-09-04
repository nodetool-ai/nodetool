/**
 * The event-driven scheduler behind task and step dispatch.
 *
 * Timing here is driven by explicit gates, not by wall-clock sleeps: a test
 * that asserts "node 2 started before the slow sibling finished" must decide
 * when the sibling finishes, or it is asserting that a timer fired in the order
 * the runner happened to pick.
 */
import { describe, it, expect } from "vitest";
import { createSemaphore } from "@nodetool-ai/runtime";
import {
  scheduleDag,
  ABORTED,
  UNSATISFIABLE_DEPENDENCY,
  type DagNode,
  type DagRunResult
} from "../src/utils/dag-scheduler.js";

interface Gate {
  wait: Promise<void>;
  open: () => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gate(): Gate {
  let open = (): void => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

type TestNode = DagNode;

function node(id: string, dependsOn: string[] = []): TestNode {
  return { id, dependsOn };
}

/** Which nodes a run reached, and which of them were returned. */
interface Recorder {
  started: string[];
  returned: string[];
}

function recorder(): Recorder {
  return { started: [], returned: [] };
}

interface RunSpec {
  /** Held open until resolved; the node cannot finish before it does. */
  block?: Promise<void>;
  /** Yields forever, so only a `.return()` from the scheduler ends it. */
  forever?: boolean;
  result?: DagRunResult;
  throws?: Error;
}

function makeRun(rec: Recorder, specs: Record<string, RunSpec> = {}) {
  return (n: TestNode): AsyncGenerator<string, DagRunResult | void> =>
    (async function* (): AsyncGenerator<string, DagRunResult | void> {
      const spec = specs[n.id] ?? {};
      rec.started.push(n.id);
      try {
        yield `start:${n.id}`;
        while (spec.forever) {
          await new Promise((r) => setTimeout(r, 1));
          yield `tick:${n.id}`;
        }
        if (spec.block) await spec.block;
        if (spec.throws) throw spec.throws;
        yield `done:${n.id}`;
        return spec.result;
      } finally {
        rec.returned.push(n.id);
      }
    })();
}

function settleEvents(n: TestNode, outcome: string, error?: string): string[] {
  return [`settle:${n.id}:${outcome}${error ? `:${error}` : ""}`];
}

function blockedEvents(n: TestNode, by: TestNode): string[] {
  return [`blocked:${n.id}:by:${by.id}`];
}

describe("scheduleDag", () => {
  it("starts a chain's next node without waiting for a slow sibling", async () => {
    // slow has no dependents; the chain a1 → a2 → a3 must not wait on it.
    const slow = gate();
    // The escape hatch is what makes a barrier fail on the assertion instead
    // of deadlocking: under a barrier the chain never runs, so nothing opens
    // the gate, and a scheduler that starts a2 promptly beats this by orders
    // of magnitude.
    const released = Promise.race([slow.wait, delay(1000)]);
    const rec = recorder();
    const nodes = [
      node("slow"),
      node("a1"),
      node("a2", ["a1"]),
      node("a3", ["a2"])
    ];

    const scheduled = scheduleDag<TestNode, string>({
      nodes,
      run: makeRun(rec, { slow: { block: released } }),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(4)
    });

    const events: string[] = [];
    for await (const event of scheduled) {
      events.push(event);
      // The whole chain has run while `slow` is still parked on its gate.
      if (event === "settle:a3:ok") slow.open();
    }

    expect(rec.started).toContain("a3");
    expect(events.indexOf("settle:a3:ok")).toBeLessThan(
      events.indexOf("settle:slow:ok")
    );
    expect(events.filter((e) => e.startsWith("settle:")).sort()).toEqual([
      "settle:a1:ok",
      "settle:a2:ok",
      "settle:a3:ok",
      "settle:slow:ok"
    ]);
  });

  it("never runs more nodes at once than the semaphore permits", async () => {
    const nodes = Array.from({ length: 10 }, (_, i) => node(`n${i}`));
    let active = 0;
    let peak = 0;

    const scheduled = scheduleDag<TestNode, string>({
      nodes,
      run: (n) =>
        (async function* (): AsyncGenerator<string, DagRunResult | void> {
          active++;
          peak = Math.max(peak, active);
          try {
            yield `start:${n.id}`;
            await new Promise((r) => setTimeout(r, 2));
            yield `done:${n.id}`;
          } finally {
            active--;
          }
        })(),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(2)
    });

    const events: string[] = [];
    for await (const event of scheduled) events.push(event);

    expect(events.filter((e) => e.startsWith("settle:"))).toHaveLength(10);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("fails exactly the transitive dependents of a failure, naming the blocker", async () => {
    const rec = recorder();
    // a fails. b and e depend on a, c depends on b. d is independent.
    const nodes = [
      node("a"),
      node("b", ["a"]),
      node("c", ["b"]),
      node("d"),
      node("e", ["a"])
    ];

    const scheduled = scheduleDag<TestNode, string>({
      nodes,
      run: makeRun(rec, {
        a: { result: { outcome: "failed", error: "boom" } }
      }),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(4)
    });

    const events: string[] = [];
    for await (const event of scheduled) events.push(event);

    expect(events).toContain("settle:a:failed:boom");
    expect(events).toContain("blocked:b:by:a");
    expect(events).toContain("blocked:e:by:a");
    expect(events).toContain("blocked:c:by:b");
    expect(events).toContain("settle:d:ok");
    // Blocked nodes never run, and nothing else is blocked.
    expect(rec.started.sort()).toEqual(["a", "d"]);
    expect(events.filter((e) => e.startsWith("blocked:"))).toHaveLength(3);
    // Each blocked node is named once, before the run ends.
    expect(events.indexOf("blocked:b:by:a")).toBeLessThan(
      events.indexOf("blocked:c:by:b")
    );
  });

  it("settles every node and returns the child generators on abort", async () => {
    const rec = recorder();
    const controller = new AbortController();
    // a and b keep working until something stops them; c waits on a and never
    // gets to run at all.
    const nodes = [node("a"), node("b"), node("c", ["a"])];

    const scheduled = scheduleDag<TestNode, string>({
      nodes,
      run: makeRun(rec, { a: { forever: true }, b: { forever: true } }),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(4),
      signal: controller.signal
    });

    const events: string[] = [];
    for await (const event of scheduled) {
      events.push(event);
      if (events.length === 2) controller.abort();
    }

    expect(rec.started.sort()).toEqual(["a", "b"]);
    // `.return()` reached both running generators, so their `finally` ran and
    // no producer is left driving them in the background.
    expect(rec.returned.sort()).toEqual(["a", "b"]);
    expect(events.filter((e) => e.startsWith("settle:")).sort()).toEqual([
      `settle:a:failed:${ABORTED}`,
      `settle:b:failed:${ABORTED}`,
      `settle:c:failed:${ABORTED}`
    ]);
  });

  it("fails nodes nothing could ever run", async () => {
    const rec = recorder();
    // b and c depend on each other; a depends on a node that does not exist.
    const nodes = [
      node("a", ["missing"]),
      node("b", ["c"]),
      node("c", ["b"]),
      node("d")
    ];

    const events: string[] = [];
    for await (const event of scheduleDag<TestNode, string>({
      nodes,
      run: makeRun(rec),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(4)
    })) {
      events.push(event);
    }

    expect(rec.started).toEqual(["d"]);
    expect(events).toContain("settle:d:ok");
    for (const id of ["a", "b", "c"]) {
      expect(events).toContain(
        `settle:${id}:failed:${UNSATISFIABLE_DEPENDENCY}`
      );
    }
  });

  it("propagates a thrown exception after the other generators drain", async () => {
    const rec = recorder();
    const nodes = [node("boom"), node("fine")];
    const released = gate();

    const scheduled = scheduleDag<TestNode, string>({
      nodes,
      run: makeRun(rec, {
        boom: { throws: new Error("node exploded") },
        fine: { block: released.wait }
      }),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(4)
    });

    const events: string[] = [];
    await expect(
      (async () => {
        for await (const event of scheduled) {
          events.push(event);
          if (event === "start:fine") released.open();
        }
      })()
    ).rejects.toThrow("node exploded");

    expect(events).toContain("done:fine");
    expect(rec.returned.sort()).toEqual(["boom", "fine"]);
  });

  it("starts a dependent only after every sibling's terminal events", async () => {
    // a and b settle in the same tick; c depends on both. The scheduler used
    // to push c to `ready` before b's terminal events had been yielded, and
    // a's `finally` then started it — so c's first event could land between
    // b's settle events, and a consumer saw a dependent start before its
    // dependency had finished settling.
    const shared = gate();
    const rec = recorder();
    const nodes = [node("a"), node("b"), node("c", ["a", "b"])];

    const scheduled = scheduleDag<TestNode, string>({
      nodes,
      run: makeRun(rec, { a: { block: shared.wait }, b: { block: shared.wait } }),
      // b settles with many terminal events and a with one, so a's `finally`
      // runs while b is still yielding its settle events.
      settle: (n, outcome) =>
        n.id === "b"
          ? Array.from({ length: 8 }, (_, i) => `settle:b:${outcome}:${i + 1}`)
          : [`settle:${n.id}:${outcome}:1`],
      onBlocked: blockedEvents,
      concurrency: createSemaphore(4)
    });

    const events: string[] = [];
    for await (const event of scheduled) {
      events.push(event);
      if (event === "start:b") shared.open();
    }

    const startC = events.indexOf("start:c");
    expect(startC).toBeGreaterThan(-1);
    expect(events.indexOf("settle:a:ok:1")).toBeLessThan(startC);
    expect(events.indexOf("settle:b:ok:8")).toBeLessThan(startC);
  });

  it("runs a 20 000-node chain in bounded time", async () => {
    const size = 20_000;
    const nodes: TestNode[] = [node("n0")];
    for (let i = 1; i < size; i++) nodes.push(node(`n${i}`, [`n${i - 1}`]));

    const started = new Date().getTime();
    let settledCount = 0;
    for await (const event of scheduleDag<TestNode, string>({
      nodes,
      run: (n) =>
        (async function* (): AsyncGenerator<string, DagRunResult | void> {
          yield `start:${n.id}`;
        })(),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(8)
    })) {
      if (event.startsWith("settle:")) settledCount++;
    }
    const elapsed = new Date().getTime() - started;

    expect(settledCount).toBe(size);
    // An O(n·m) scheduler over a 20 000-long chain is 200M edge visits; this
    // bound is generous for O(n+m) and impossible for the quadratic shape.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("blocks 20 000 dependents of one failure in bounded time", async () => {
    // The other shape a quadratic implementation dies on: one node with a
    // very wide fan-out, whose failure blocks all of it at once.
    const size = 20_000;
    const nodes: TestNode[] = [node("root")];
    for (let i = 0; i < size; i++) nodes.push(node(`n${i}`, ["root"]));

    const started = new Date().getTime();
    let blocked = 0;
    for await (const event of scheduleDag<TestNode, string>({
      nodes,
      run: (n) =>
        (async function* (): AsyncGenerator<string, DagRunResult | void> {
          yield `start:${n.id}`;
          return { outcome: "failed", error: "root died" };
        })(),
      settle: settleEvents,
      onBlocked: blockedEvents,
      concurrency: createSemaphore(8)
    })) {
      if (event.startsWith("blocked:")) blocked++;
    }
    const elapsed = new Date().getTime() - started;

    expect(blocked).toBe(size);
    expect(elapsed).toBeLessThan(10_000);
  });
});
