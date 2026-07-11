/**
 * Interval/schedule adapter (Task 10).
 *
 * A single coarse sweep timer — not one `setTimeout` per registration — walks
 * the enabled `schedule` registrations each pass, computes which are due from
 * their config snapshot and `last_fired_at`, and appends one durable
 * `trigger_input` per due tick. Registrations are re-read every sweep, so a
 * config change (interval, delay) applies without a restart.
 *
 * Epoch choice: a registration's tick grid is anchored on `created_at`, not
 * `updated_at`. `updated_at` bumps on every save — including the `last_fired_at`
 * write this adapter makes on each fire — which would shift tick boundaries
 * under the schedule. `created_at` is stable for the life of the registration.
 *
 * Idempotency: the input id is `${registration.id}:${dueTickIndex}` where
 * `dueTickIndex` is derived purely from `now` and the config. A crash between
 * appending the input and persisting `last_fired_at` therefore recomputes the
 * same tick and the same id — `deliverTriggerInput` is idempotent by id, so it
 * cannot double-fire.
 *
 * Catch-up: an overdue schedule fires once (the current tick), not once per
 * missed interval — `last_fired_at` jumps to `now` and the next fire is one
 * interval out.
 */

import { createLogger } from "@nodetool-ai/config";
import { TriggerRegistration } from "@nodetool-ai/models";
import { getTriggerWakeupService, notifyDispatcher } from "./dispatcher.js";

const log = createLogger("nodetool.websocket.triggers.scheduler");

const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_INITIAL_DELAY_SECONDS = 0;
const DEFAULT_SWEEP_MS = 5000;

interface ScheduleConfig {
  intervalMs: number;
  initialDelayMs: number;
  emitOnStart: boolean;
  intervalSeconds: number;
}

function numberProp(
  config: Record<string, unknown> | null,
  key: string,
  fallback: number
): number {
  const value = config?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function readConfig(reg: TriggerRegistration): ScheduleConfig | null {
  const config = reg.config_json as Record<string, unknown> | null;
  const intervalSeconds = numberProp(
    config,
    "interval_seconds",
    DEFAULT_INTERVAL_SECONDS
  );
  if (intervalSeconds <= 0) return null; // invalid — caller records last_error

  const initialDelaySeconds = numberProp(
    config,
    "initial_delay_seconds",
    DEFAULT_INITIAL_DELAY_SECONDS
  );
  const emitOnStart = config?.emit_on_start !== false; // default true

  return {
    intervalMs: intervalSeconds * 1000,
    initialDelayMs: Math.max(0, initialDelaySeconds) * 1000,
    emitOnStart,
    intervalSeconds
  };
}

/** The tick number for `now`, floored to the tick grid anchored at the epoch. */
function tickIndexFor(now: number, epoch: number, cfg: ScheduleConfig): number {
  return Math.floor((now - epoch - cfg.initialDelayMs) / cfg.intervalMs);
}

/**
 * Whether the registration is due to fire at `now`, and at which tick index.
 * Never fired: due once `now` reaches the first scheduled tick (epoch + delay
 * when `emit_on_start`, else one interval later). Fired before: due one full
 * interval after the last fire.
 */
function computeDue(
  reg: TriggerRegistration,
  cfg: ScheduleConfig,
  now: number
): { due: boolean; tickIndex: number } {
  const epoch = Date.parse(reg.created_at);
  const tickIndex = tickIndexFor(now, epoch, cfg);

  if (!reg.last_fired_at) {
    const firstDueAt = cfg.emitOnStart
      ? epoch + cfg.initialDelayMs
      : epoch + cfg.initialDelayMs + cfg.intervalMs;
    return { due: now >= firstDueAt, tickIndex };
  }

  const lastFired = Date.parse(reg.last_fired_at);
  return { due: now >= lastFired + cfg.intervalMs, tickIndex };
}

async function recordInvalid(reg: TriggerRegistration): Promise<void> {
  const message = `invalid interval_seconds in schedule config for ${reg.workflow_id}/${reg.node_id}`;
  if (reg.last_error === message) return; // write once
  reg.last_error = message;
  try {
    await reg.save();
  } catch {
    // Diagnostic only; a failed write must not abort the sweep.
  }
}

async function fireRegistration(
  reg: TriggerRegistration,
  cfg: ScheduleConfig,
  tickIndex: number,
  now: number
): Promise<void> {
  const created = await getTriggerWakeupService().deliverTriggerInput({
    runId: reg.workflow_id,
    nodeId: reg.node_id,
    inputId: `${reg.id}:${tickIndex}`,
    payload: {
      tick: tickIndex,
      timestamp: new Date(now).toISOString(),
      source: "interval",
      event_type: "tick",
      interval_seconds: cfg.intervalSeconds
    }
  });

  reg.last_fired_at = new Date(now).toISOString();
  if (reg.last_error) reg.last_error = null;
  try {
    await reg.save();
  } catch {
    // last_fired_at is diagnostic; the deterministic input id already guards
    // against a double-fire if this write is lost.
  }

  if (created) {
    void notifyDispatcher().catch(() => undefined);
  }
}

/**
 * Run one scheduler sweep at logical time `now` (ms). Exported for
 * deterministic testing; {@link startTriggerScheduler} calls it on a timer.
 */
export async function runSchedulerSweep(now: number): Promise<void> {
  const registrations = await TriggerRegistration.findEnabledByKind("schedule");
  for (const reg of registrations) {
    const cfg = readConfig(reg);
    if (!cfg) {
      await recordInvalid(reg);
      continue;
    }
    const { due, tickIndex } = computeDue(reg, cfg, now);
    if (!due) continue;
    try {
      await fireRegistration(reg, cfg, tickIndex, now);
    } catch (error) {
      log.error(
        `Schedule fire failed for ${reg.workflow_id}/${reg.node_id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

export interface StartTriggerSchedulerOptions {
  /** Sweep period in ms. Default 5000. */
  sweepMs?: number;
  /** Clock source (ms). Defaults to `Date.now`. Injectable for tests. */
  now?: () => number;
}

/**
 * Start the scheduler: a coarse sweep timer that fires due schedules. Returns a
 * stop function that clears the timer, leaving no open handles.
 */
export function startTriggerScheduler(
  opts: StartTriggerSchedulerOptions = {}
): () => void {
  const sweepMs = opts.sweepMs ?? DEFAULT_SWEEP_MS;
  const now = opts.now ?? Date.now;
  let sweeping = false;
  let stopped = false;

  const timer = setInterval(() => {
    if (sweeping || stopped) return; // never overlap sweeps
    sweeping = true;
    void runSchedulerSweep(now())
      .catch((error) => {
        log.error(
          `Scheduler sweep failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      })
      .finally(() => {
        sweeping = false;
      });
  }, sweepMs);
  // Don't keep the process alive solely for the scheduler sweep.
  if (typeof timer.unref === "function") timer.unref();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
