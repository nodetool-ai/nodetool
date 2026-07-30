/**
 * Event-anchor matching for scripted `JourneyInteraction`s (§4: "event-
 * anchored, not time-anchored"). An interaction's `at` string names a
 * message to wait for before firing — never a wall-clock delay — so both
 * drivers cancel/stream-input at the same logical point in the run
 * regardless of how fast either surface actually executes.
 *
 * Supported anchor shapes (the only ones the four C2 journeys need; extend
 * here, not per-driver, when a later journey needs more):
 *   - `"node_update:<nodeId>:<status>"` — a `node_update` for that node id
 *     reaching that status (e.g. `"node_update:probe:running"`).
 *   - `"job_update:<status>"` — a `job_update` reaching that status.
 *   - `"<type>"` — any message of that `type`, e.g. `"chunk"`.
 */
export type AnchoredMessage = Record<string, unknown>;

export function matchesAnchor(message: AnchoredMessage, anchor: string): boolean {
  const parts = anchor.split(":");
  const type = parts[0];
  if (message["type"] !== type) return false;

  if (type === "node_update") {
    const [, nodeId, status] = parts;
    if (nodeId !== undefined && message["node_id"] !== nodeId) return false;
    if (status !== undefined && message["status"] !== status) return false;
    return true;
  }

  if (type === "job_update") {
    const [, status] = parts;
    if (status !== undefined && message["status"] !== status) return false;
    return true;
  }

  // Bare type match (e.g. "chunk") — no further qualifiers supported yet.
  return true;
}

interface Waiter {
  test: (message: AnchoredMessage) => boolean;
  resolve: () => void;
}

/**
 * Registers anchor waiters and resolves them as matching messages flow
 * through a driver's message pump. Registration must happen synchronously
 * (no `await` in between) relative to the pump starting to consume already-
 * queued messages, or a fast-arriving anchor could be missed — both drivers
 * follow that rule (see the comment at each `run()`'s interaction loop).
 */
export class AnchorWaiter {
  private waiters: Waiter[] = [];

  wait(anchor: string): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push({ test: (m) => matchesAnchor(m, anchor), resolve });
    });
  }

  notify(message: AnchoredMessage): void {
    const remaining: Waiter[] = [];
    for (const waiter of this.waiters) {
      if (waiter.test(message)) waiter.resolve();
      else remaining.push(waiter);
    }
    this.waiters = remaining;
  }
}
