/**
 * Trigger node support for suspendable workflows.
 *
 * Port of src/nodetool/workflows/trigger_node.py.
 *
 * Trigger nodes wait for external events with a timeout. If no events
 * arrive within the inactivity period, the workflow suspends.
 */

import { createLogger } from "@nodetool-ai/config";
import { SuspendableState } from "./suspendable.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.kernel.trigger");

const DEFAULT_INACTIVITY_TIMEOUT = 300; // 5 minutes

/**
 * Error raised when a trigger node times out waiting for events.
 */
export class TriggerInactivityTimeout extends Error {
  readonly timeoutSeconds: number;

  constructor(timeoutSeconds: number) {
    super(
      `No trigger activity for ${timeoutSeconds} seconds, suspending workflow`
    );
    this.name = "TriggerInactivityTimeout";
    this.timeoutSeconds = timeoutSeconds;
  }
}

/**
 * Trigger node state manager.
 *
 * Extends SuspendableState with event queue and inactivity timeout.
 * Trigger nodes wait for external events and auto-suspend on inactivity.
 */
export class TriggerState extends SuspendableState {
  private _inactivityTimeoutSeconds: number;
  private _lastActivityTime: number | null = null;
  private _eventQueue: Array<Record<string, unknown>> = [];
  private _eventWaiters: Array<(event: Record<string, unknown>) => void> = [];

  constructor(nodeId: string, inactivityTimeout?: number) {
    super(nodeId);
    this._inactivityTimeoutSeconds =
      inactivityTimeout ?? DEFAULT_INACTIVITY_TIMEOUT;
  }

  get inactivityTimeout(): number {
    return this._inactivityTimeoutSeconds;
  }

  set inactivityTimeout(seconds: number) {
    if (seconds < 1) {
      throw new Error("Inactivity timeout must be at least 1 second");
    }
    this._inactivityTimeoutSeconds = seconds;
  }

  get lastActivityTime(): number | null {
    return this._lastActivityTime;
  }

  /**
   * Get milliseconds since last activity, or null if no activity yet.
   */
  get inactivityDuration(): number | null {
    if (this._lastActivityTime === null) return null;
    return Date.now() - this._lastActivityTime;
  }

  private _updateActivityTime(): void {
    this._lastActivityTime = Date.now();
  }

  /**
   * Wait for a trigger event with timeout.
   * Resolves with event data when an event arrives.
   * Rejects with TriggerInactivityTimeout if timeout elapses.
   */
  async waitForTriggerEvent(
    timeoutSeconds?: number
  ): Promise<Record<string, unknown>> {
    const timeout = timeoutSeconds ?? this._inactivityTimeoutSeconds;
    this._updateActivityTime();

    // Check if there's already a queued event
    if (this._eventQueue.length > 0) {
      const event = this._eventQueue.shift()!;
      this._updateActivityTime();
      return event;
    }

    // Wait for an event with timeout
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      // Node clamps any setTimeout delay > 2^31-1 ms (~24.85 days) to 1 ms and
      // fires almost immediately, which for a long-interval trigger would reject
      // instantly and suspend before any real event could arrive. Track an
      // absolute deadline and re-arm in <=TIMEOUT_MAX chunks instead.
      const TIMEOUT_MAX = 2_147_483_647;
      const deadline = Date.now() + timeout * 1000;
      let timer: ReturnType<typeof setTimeout>;
      const waiter = (event: Record<string, unknown>) => {
        clearTimeout(timer);
        this._updateActivityTime();
        resolve(event);
      };
      const arm = () => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          // Remove this waiter so a later event is queued, not lost on a dead promise.
          this._eventWaiters = this._eventWaiters.filter((w) => w !== waiter);
          reject(new TriggerInactivityTimeout(timeout));
          return;
        }
        timer = setTimeout(arm, Math.min(remaining, TIMEOUT_MAX));
      };
      arm();

      this._eventWaiters.push(waiter);
    });
  }

  /**
   * Send a trigger event to this node (called externally).
   * Wakes up a waiting `waitForTriggerEvent` call, or queues the event.
   */
  sendTriggerEvent(eventData: Record<string, unknown>): void {
    this._updateActivityTime();

    if (this._eventWaiters.length > 0) {
      const resolve = this._eventWaiters.shift()!;
      resolve(eventData);
    } else {
      this._eventQueue.push(eventData);
    }

    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log args only
    log.info("Trigger node received external event", {
      keys: Object.keys(eventData)
    });
  }

  /**
   * Check if node should suspend due to inactivity.
   */
  shouldSuspendForInactivity(): boolean {
    const duration = this.inactivityDuration;
    if (duration === null) return false;
    return duration >= this._inactivityTimeoutSeconds * 1000;
  }

  /**
   * Convenience method to suspend for inactivity with trigger-specific metadata.
   */
  suspendForInactivity(additionalState?: Record<string, unknown>): never {
    const state: Record<string, unknown> = {
      suspended_at: new Date().toISOString(),
      last_activity: this._lastActivityTime
        ? new Date(this._lastActivityTime).toISOString()
        : null,
      inactivity_timeout_seconds: this._inactivityTimeoutSeconds
    };

    // Stryker disable next-line ConditionalExpression: forcing the guard true is equivalent — Object.assign(state, undefined) is a no-op, so skipping vs. assigning undefined are indistinguishable
    if (additionalState) {
      Object.assign(state, additionalState);
    }

    this.suspendWorkflow(
      `Trigger inactivity timeout (${this._inactivityTimeoutSeconds}s)`,
      state,
      {
        trigger_node: true,
        inactivity_suspension: true
      }
    );
  }
}
