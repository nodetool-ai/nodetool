/**
 * Trigger node support for suspendable workflows.
 *
 * Port of src/nodetool/workflows/trigger_node.py.
 *
 * Trigger nodes wait for external events with a timeout. If no events
 * arrive within the inactivity period, the workflow suspends.
 */

import { createLogger } from "@nodetool/config";
import { SuspendableState } from "./suspendable.js";

const log = createLogger("nodetool.kernel.trigger");

const DEFAULT_INACTIVITY_TIMEOUT = 300; // 5 minutes

/**
 * Error raised when a trigger node times out waiting for events.
 */
export class TriggerInactivityTimeout extends Error {
  readonly timeoutSeconds: number;

  constructor(timeoutSeconds: number) {
    super(`No trigger activity for ${timeoutSeconds} seconds, suspending workflow`);
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
  private _eventWaiters: Array<{
    resolve: (event: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(nodeId: string, inactivityTimeout?: number) {
    super(nodeId);
    this._inactivityTimeoutSeconds = inactivityTimeout ?? DEFAULT_INACTIVITY_TIMEOUT;
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
  async waitForTriggerEvent(timeoutSeconds?: number): Promise<Record<string, unknown>> {
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
      const timer = setTimeout(() => {
        // Remove this waiter
        const idx = this._eventWaiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this._eventWaiters.splice(idx, 1);
        reject(new TriggerInactivityTimeout(timeout));
      }, timeout * 1000);

      this._eventWaiters.push({
        resolve: (event) => {
          clearTimeout(timer);
          this._updateActivityTime();
          resolve(event);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  /**
   * Send a trigger event to this node (called externally).
   * Wakes up a waiting `waitForTriggerEvent` call, or queues the event.
   */
  sendTriggerEvent(eventData: Record<string, unknown>): void {
    this._updateActivityTime();

    if (this._eventWaiters.length > 0) {
      const waiter = this._eventWaiters.shift()!;
      waiter.resolve(eventData);
    } else {
      this._eventQueue.push(eventData);
    }

    log.info("Trigger node received external event", {
      keys: Object.keys(eventData),
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
      inactivity_timeout_seconds: this._inactivityTimeoutSeconds,
    };

    if (additionalState) {
      Object.assign(state, additionalState);
    }

    this.suspendWorkflow(
      `Trigger inactivity timeout (${this._inactivityTimeoutSeconds}s)`,
      state,
      {
        trigger_node: true,
        inactivity_suspension: true,
      },
    );
  }
}
