import {
  DEFAULT_CONSENT,
  type ConsentCategory,
  type ConsentDecision,
  type ConsentState
} from "../consent/types.js";
import {
  currentAnonymousIdentity,
  randomId,
  type AnonymousIdentity
} from "../identity/anonymous-id.js";
import { bucketCount } from "../privacy/bucketing.js";
import {
  canonicalEnvelope,
  normalizeAppVersion,
  validateEnvelope
} from "../privacy/validation.js";
import type { AnalyticsClientType, AnalyticsPlatform } from "../schema/clients.js";
import {
  ANALYTICS_SCHEMA_VERSION,
  MAX_BATCH_EVENTS,
  hourTimestamp,
  type AnalyticsEnvelope
} from "../schema/envelope.js";
import type { AnalyticsEvent } from "../schema/events.js";
import type { AnalyticsStore } from "./store.js";
import type { AnalyticsTransport } from "./transport.js";

export interface AnalyticsClientOptions {
  clientType: AnalyticsClientType;
  appVersion: string;
  platform: AnalyticsPlatform;
  store: AnalyticsStore;
  transport: AnalyticsTransport;
  now?: () => Date;
  /** Unsent events kept at most. The oldest are dropped first. */
  maxQueue?: number;
  /** Serialized events kept for the transparency view. */
  inspectLimit?: number;
  /**
   * Delay between the first queued event and an automatic flush. `null`
   * disables automatic flushing: the owner calls `flush()` itself.
   */
  flushDelayMs?: number | null;
  /** Called with the reason when an event is dropped. For tests. */
  onDrop?: (reason: string) => void;
}

export type AnalyticsListener = () => void;

export interface AnalyticsClient {
  /** Resolves once stored consent, identity and queue are loaded. */
  readonly ready: Promise<void>;
  readonly clientType: AnalyticsClientType;
  /** Record an event. Dropped unless product-analytics consent is granted. */
  track(event: AnalyticsEvent): void;
  /** Send queued events now. Never rejects. */
  flush(options?: { force?: boolean }): Promise<void>;
  /** Emit the session's aggregated counters, if any, and flush. */
  endSession(): Promise<void>;
  getConsent(): ConsentState;
  isEnabled(): boolean;
  setConsent(category: ConsentCategory, decision: ConsentDecision): Promise<void>;
  /** Record that the one-time prompt was shown. */
  markPrompted(): Promise<void>;
  /** Drop the anonymous ID; the next event gets a fresh one. */
  resetIdentity(): Promise<void>;
  /** Events serialized this session, newest last, exactly as sent. */
  recentEvents(): readonly AnalyticsEnvelope[];
  /** Events waiting to be sent. */
  pendingEvents(): readonly AnalyticsEnvelope[];
  /**
   * Build the envelope an event would produce without queuing or sending it.
   * Works whatever the consent state, for inspection only.
   */
  preview(event: AnalyticsEvent): AnalyticsEnvelope | null;
  subscribe(listener: AnalyticsListener): () => void;
  shutdown(): void;
}

const MAX_PRE_READY_EVENTS = 20;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;
const MAX_BATCHES_PER_FLUSH = 5;

/**
 * The one analytics client every surface builds, through its own adapter.
 *
 * Guarantees, in order of importance:
 * - Nothing is queued, stored or sent unless `productAnalytics` is `granted`.
 *   Revoking consent clears the queue, the anonymous ID and the counters.
 * - Every envelope passes `validateEnvelope` before it is queued, and again
 *   when a stored queue is loaded.
 * - No method throws and no method blocks the caller: failures are swallowed,
 *   retries back off, and a full queue drops its oldest events.
 */
export function createAnalyticsClient(
  options: AnalyticsClientOptions
): AnalyticsClient {
  const now = options.now ?? (() => new Date());
  const maxQueue = options.maxQueue ?? 500;
  const inspectLimit = options.inspectLimit ?? 50;
  const flushDelayMs =
    options.flushDelayMs === undefined ? 10_000 : options.flushDelayMs;
  const appVersion = normalizeAppVersion(options.appVersion);
  const usesIdentity = options.clientType !== "cloud_backend";
  const sessionId = usesIdentity ? randomId() : null;
  const drop = (reason: string): void => {
    try {
      options.onDrop?.(reason);
    } catch {
      // A test hook must not break tracking.
    }
  };

  let consent: ConsentState = { ...DEFAULT_CONSENT };
  let identity: AnonymousIdentity | null = null;
  let queue: AnalyticsEnvelope[] = [];
  let recent: AnalyticsEnvelope[] = [];
  let isReady = false;
  let isShutDown = false;
  let preReady: AnalyticsEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;
  let failures = 0;
  let nextAttemptAt = 0;
  const counters = { workflowRuns: 0, workflowsCreated: 0 };
  const listeners = new Set<AnalyticsListener>();

  const notify = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A broken listener must not stop the others.
      }
    }
  };

  const persistQueue = (): void => {
    options.store.saveQueue(queue).catch(() => {
      // Storage full or unavailable: the queue still lives in memory.
    });
  };

  const enabled = (): boolean =>
    !isShutDown && consent.productAnalytics === "granted";

  const ensureIdentity = (): string | null => {
    if (!usesIdentity) return null;
    const { identity: current, rotated } = currentAnonymousIdentity(identity, now());
    if (rotated || identity === null) {
      identity = current;
      options.store.saveIdentity(current).catch(() => {
        // An unsaved ID only means the next session starts a new one.
      });
    }
    return current.anonymousId;
  };

  const buildEnvelope = (
    event: AnalyticsEvent,
    anonymousId: string | null
  ): AnalyticsEnvelope | null => {
    const candidate = {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      event: event.event,
      clientType: options.clientType,
      anonymousId,
      sessionId,
      timestamp: hourTimestamp(now()),
      appVersion,
      platform: options.platform,
      properties: { ...event.properties }
    };
    const result = validateEnvelope(candidate);
    if (!result.ok) {
      drop(result.reason);
      return null;
    }
    return canonicalEnvelope(result.value);
  };

  const scheduleFlush = (): void => {
    if (flushDelayMs === null || flushTimer !== null || isShutDown) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, flushDelayMs);
    // Never keep a CLI or server process alive just to send analytics.
    const timer = flushTimer as { unref?: () => void };
    timer.unref?.();
  };

  const enqueue = (event: AnalyticsEvent): void => {
    if (!enabled()) {
      drop("consent_not_granted");
      return;
    }
    const envelope = buildEnvelope(event, ensureIdentity());
    if (!envelope) return;
    if (event.event === "workflow_run") counters.workflowRuns += 1;
    if (event.event === "workflow_created") counters.workflowsCreated += 1;
    queue.push(envelope);
    if (queue.length > maxQueue) {
      queue = queue.slice(queue.length - maxQueue);
      drop("queue_full");
    }
    recent.push(envelope);
    if (recent.length > inspectLimit) recent = recent.slice(-inspectLimit);
    persistQueue();
    scheduleFlush();
    notify();
  };

  const sendOnce = async (): Promise<boolean> => {
    const batch = queue.slice(0, MAX_BATCH_EVENTS);
    if (batch.length === 0) return false;
    let accepted = false;
    try {
      accepted = await options.transport.send({
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        events: batch
      });
    } catch {
      accepted = false;
    }
    if (!accepted) {
      failures += 1;
      nextAttemptAt =
        now().getTime() +
        Math.min(BASE_BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS);
      return false;
    }
    failures = 0;
    nextAttemptAt = 0;
    const sent = new Set(batch);
    queue = queue.filter((envelope) => !sent.has(envelope));
    persistQueue();
    notify();
    return true;
  };

  const flush = async (flushOptions: { force?: boolean } = {}): Promise<void> => {
    try {
      await ready;
      if (!enabled() || queue.length === 0) return;
      if (!flushOptions.force && now().getTime() < nextAttemptAt) return;
      if (flushing) return await flushing;
      flushing = (async () => {
        for (let i = 0; i < MAX_BATCHES_PER_FLUSH && queue.length > 0; i++) {
          if (!enabled()) return;
          if (!(await sendOnce())) return;
        }
      })();
      await flushing;
    } catch {
      // Analytics never surfaces an error to the product.
    } finally {
      flushing = null;
    }
  };

  const clearCollectedData = async (): Promise<void> => {
    queue = [];
    recent = [];
    preReady = [];
    identity = null;
    counters.workflowRuns = 0;
    counters.workflowsCreated = 0;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await Promise.allSettled([
      options.store.saveQueue([]),
      options.store.saveIdentity(null)
    ]);
  };

  const ready: Promise<void> = (async () => {
    try {
      consent = await options.store.loadConsent();
      if (consent.productAnalytics === "granted") {
        identity = usesIdentity ? await options.store.loadIdentity() : null;
        const stored = await options.store.loadQueue();
        queue = [];
        for (const item of stored.slice(-maxQueue)) {
          const result = validateEnvelope(item);
          if (result.ok) queue.push(canonicalEnvelope(result.value));
          else drop(`stored_${result.reason}`);
        }
      } else {
        // Leftovers from an earlier grant must not survive a revocation.
        await clearCollectedData();
      }
    } catch {
      consent = { ...DEFAULT_CONSENT };
      queue = [];
    } finally {
      isReady = true;
      const pending = preReady;
      preReady = [];
      for (const event of pending) enqueue(event);
      if (queue.length > 0) scheduleFlush();
      notify();
    }
  })();

  const client: AnalyticsClient = {
    ready,
    clientType: options.clientType,
    track(event) {
      try {
        if (isShutDown) return;
        if (!isReady) {
          // Held in memory only until stored consent is known.
          if (preReady.length < MAX_PRE_READY_EVENTS) preReady.push(event);
          return;
        }
        enqueue(event);
      } catch {
        // Tracking never throws into product code.
      }
    },
    flush,
    async endSession() {
      try {
        await ready;
        if (enabled() && (counters.workflowRuns > 0 || counters.workflowsCreated > 0)) {
          const summary: AnalyticsEvent = {
            event: "session_summary",
            properties: {
              workflowRuns: bucketCount(counters.workflowRuns),
              workflowsCreated: bucketCount(counters.workflowsCreated)
            }
          };
          counters.workflowRuns = 0;
          counters.workflowsCreated = 0;
          enqueue(summary);
        }
        await flush({ force: true });
      } catch {
        // Never surfaces.
      }
    },
    getConsent: () => consent,
    isEnabled: enabled,
    async setConsent(category, decision) {
      try {
        await ready;
        consent = {
          ...consent,
          [category]: decision,
          updatedAt: now().toISOString()
        };
        await options.store.saveConsent(consent);
        if (category === "productAnalytics" && decision !== "granted") {
          await clearCollectedData();
        }
      } catch {
        // The in-memory decision still applies for this session.
      } finally {
        notify();
      }
    },
    async markPrompted() {
      try {
        await ready;
        consent = { ...consent, promptedAt: now().toISOString() };
        await options.store.saveConsent(consent);
      } catch {
        // Worst case the prompt shows once more next launch.
      } finally {
        notify();
      }
    },
    async resetIdentity() {
      try {
        identity = null;
        await options.store.saveIdentity(null);
      } catch {
        // Ignored: a fresh ID is generated on the next event anyway.
      } finally {
        notify();
      }
    },
    recentEvents: () => recent,
    pendingEvents: () => queue,
    preview(event) {
      try {
        return buildEnvelope(
          event,
          usesIdentity ? (identity?.anonymousId ?? "00000000-0000-4000-8000-000000000000") : null
        );
      } catch {
        return null;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    shutdown() {
      isShutDown = true;
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      listeners.clear();
    }
  };
  return client;
}
