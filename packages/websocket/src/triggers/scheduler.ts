/**
 * Scheduler adapter — the host-owned ingestion adapter for `schedule`
 * registrations (compiled from `IntervalTriggerNode`s, see
 * `registration-sync.ts`).
 *
 * One coarse sweep timer (not one `setTimeout` per registration) re-reads
 * enabled `schedule` registrations every tick and delivers a synthesized
 * "tick" event for every one that is due, via `TriggerWakeupService`. This
 * mirrors `@nodetool-ai/compute`'s `startReaper` shape: a single interval
 * timer, an injectable clock, and a stop handle.
 *
 * Due-ness and the derived `input_id` are computed purely from persisted
 * state (`created_at`, `last_fired_at`, `config_json`) and the current sweep
 * time, so re-running the computation before `last_fired_at` is advanced —
 * e.g. a process crash between delivering the input and persisting the new
 * `last_fired_at` — reproduces the exact same `input_id` on the next sweep.
 * `deliverTriggerInput`'s idempotency-by-`inputId` then makes that replay a
 * no-op instead of a double-fire.
 */

import { createLogger } from "@nodetool-ai/config";
import { TriggerRegistration } from "@nodetool-ai/models";
import type { TriggerWakeupService } from "@nodetool-ai/kernel";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.websocket.triggers.scheduler");

const DEFAULT_SWEEP_INTERVAL_MS = 5_000;

/** Fired once per registration each time a sweep delivers a new tick. */
export interface SchedulerNotifyEvent {
  registrationId: string;
  inputId: string;
}

export interface StartSchedulerOptions {
  wakeupService: TriggerWakeupService;
  /** Same-process dispatch hint — called after a new tick is delivered. */
  notify?: (event: SchedulerNotifyEvent) => void;
  /** Sweep period. Defaults to 5s — coarse on purpose (see module docs). */
  intervalMs?: number;
  /** Injectable clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** Cancels a running `startScheduler` timer. */
export type SchedulerHandle = () => void;

function readNumber(
  config: Record<string, unknown> | null,
  key: string,
  fallback: number
): number {
  const raw = config?.[key];
  if (raw === undefined || raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function readBool(
  config: Record<string, unknown> | null,
  key: string,
  fallback: boolean
): boolean {
  const raw = config?.[key];
  return raw === undefined || raw === null ? fallback : Boolean(raw);
}

function synthesizeTickPayload(
  dueTickIndex: number,
  intervalSeconds: number,
  nowMs: number
): Record<string, unknown> {
  return {
    tick: dueTickIndex,
    interval_seconds: intervalSeconds,
    timestamp: new Date(nowMs).toISOString(),
    source: "schedule",
    event_type: "tick"
  };
}

interface DueTick {
  dueAt: number;
  dueTickIndex: number;
  intervalSeconds: number;
}

/**
 * The next due instant for a `schedule` registration, honoring
 * `interval_seconds` (default 60), `initial_delay_seconds` (default 0), and
 * `emit_on_start` (default true) from `config_json` — the same property
 * names `IntervalTriggerNode` snapshots into the registration on sync.
 *
 * Returns `null` when the next due instant is still in the future.
 */
function computeDueTick(
  registration: TriggerRegistration,
  nowMs: number
): DueTick | null {
  const config = registration.config_json;
  const intervalSeconds = readNumber(config, "interval_seconds", 60);
  const intervalMs = Math.max(1, intervalSeconds * 1000);
  const initialDelaySeconds = readNumber(config, "initial_delay_seconds", 0);
  const emitOnStart = readBool(config, "emit_on_start", true);

  const createdAtMs = Date.parse(registration.created_at);
  const firstDueAt =
    createdAtMs + initialDelaySeconds * 1000 + (emitOnStart ? 0 : intervalMs);

  const dueAt = registration.last_fired_at
    ? Date.parse(registration.last_fired_at) + intervalMs
    : firstDueAt;

  if (nowMs < dueAt) return null;

  return { dueAt, dueTickIndex: Math.floor(dueAt / intervalMs), intervalSeconds };
}

async function fireRegistration(
  registration: TriggerRegistration,
  due: DueTick,
  wakeupService: TriggerWakeupService,
  nowMs: number,
  notify?: (event: SchedulerNotifyEvent) => void
): Promise<void> {
  const inputId = `${registration.id}:${due.dueTickIndex}`;
  const payload = synthesizeTickPayload(
    due.dueTickIndex,
    due.intervalSeconds,
    nowMs
  );

  try {
    await wakeupService.deliverTriggerInput({
      runId: registration.workflow_id,
      nodeId: registration.node_id,
      inputId,
      payload
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    registration.last_error = error.message;
    await registration.save();
    log.warn(
      `Schedule registration ${registration.id} failed to deliver trigger input`,
      error
    );
    return;
  }

  registration.last_fired_at = new Date(nowMs).toISOString();
  registration.last_error = null;
  await registration.save();

  notify?.({ registrationId: registration.id, inputId });
}

/**
 * Run one sweep: re-read every enabled `schedule` registration and deliver a
 * tick for each one that is due. Exported separately from `startScheduler` so
 * tests can drive it directly with a controlled `now`, without fighting a
 * real or faked interval timer.
 */
export async function runSchedulerSweepOnce(opts: {
  wakeupService: TriggerWakeupService;
  notify?: (event: SchedulerNotifyEvent) => void;
  now?: () => number;
}): Promise<void> {
  const nowMs = (opts.now ?? Date.now)();
  const registrations = await TriggerRegistration.findEnabledByKind("schedule");

  for (const registration of registrations) {
    let due: DueTick | null;
    try {
      due = computeDueTick(registration, nowMs);
    } catch (err) {
      log.warn(
        `Failed to compute due tick for schedule registration ${registration.id}`,
        err instanceof Error ? err : new Error(String(err))
      );
      continue;
    }
    if (!due) continue;

    await fireRegistration(
      registration,
      due,
      opts.wakeupService,
      nowMs,
      opts.notify
    );
  }
}

/**
 * Start the scheduler's sweep timer. Follows `startReaper`'s shape
 * (`@nodetool-ai/compute`): one unref'd `setInterval`, a swallowed per-sweep
 * error so a transient DB hiccup doesn't kill the loop, and a stop handle.
 */
export function startScheduler(opts: StartSchedulerOptions): SchedulerHandle {
  const intervalMs = opts.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const timer = setInterval(() => {
    void runSchedulerSweepOnce({
      wakeupService: opts.wakeupService,
      notify: opts.notify,
      now: opts.now
    }).catch((err) => {
      log.warn(
        "Scheduler sweep failed",
        err instanceof Error ? err : new Error(String(err))
      );
    });
  }, intervalMs);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  return () => clearInterval(timer);
}
