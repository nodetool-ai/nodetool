/**
 * Schedule timing — the one place `schedule` registrations are turned into
 * instants.
 *
 * The scheduler sweep (`scheduler.ts`) and the editor's "next fire" readout
 * (`trpc/routers/triggers.ts`) need the same arithmetic: when is this
 * registration next due, given `created_at`, `last_fired_at` and the
 * `config_json` keys `IntervalTriggerNode` snapshots on sync. Computing it
 * twice would let the displayed time drift away from the time the sweep
 * actually fires at, so both callers go through `computeScheduleTiming`.
 *
 * The result is derived purely from persisted state — no wall clock — which is
 * what makes the scheduler's `input_id` reproducible across a crash between
 * delivering an input and persisting the new `last_fired_at`.
 *
 * `include_drift_compensation` is deliberately not read here: it is an
 * in-process concern of `IntervalTriggerNode`'s own loop. The host schedules
 * from the last fire, so a slow sweep shifts the next tick rather than
 * catching up on missed ones.
 */

import type { TriggerRegistration } from "@nodetool-ai/models";

/** The registration kind whose `last_fired_at` doubles as the sweep cursor. */
export const SCHEDULE_KIND = "schedule";

export const DEFAULT_INTERVAL_SECONDS = 60;

interface ScheduleTiming {
  /** `interval_seconds` from config, or the 60s default. */
  intervalSeconds: number;
  /** The same interval in milliseconds, floored at 1ms. */
  intervalMs: number;
  /** Epoch ms of the next instant this registration is due to fire. */
  nextFireAtMs: number;
}

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

/**
 * The next due instant for a `schedule` registration, honoring
 * `interval_seconds` (default 60), `initial_delay_seconds` (default 0), and
 * `emit_on_start` (default true) from `config_json`.
 *
 * Returns `null` when `created_at` is unparseable — the registration has no
 * anchor to schedule from.
 */
export function computeScheduleTiming(
  registration: TriggerRegistration
): ScheduleTiming | null {
  const config = registration.config_json;
  const intervalSeconds = readNumber(
    config,
    "interval_seconds",
    DEFAULT_INTERVAL_SECONDS
  );
  const intervalMs = Math.max(1, intervalSeconds * 1000);

  if (registration.last_fired_at) {
    const lastFiredMs = Date.parse(registration.last_fired_at);
    if (Number.isFinite(lastFiredMs)) {
      return {
        intervalSeconds,
        intervalMs,
        nextFireAtMs: lastFiredMs + intervalMs
      };
    }
  }

  const createdAtMs = Date.parse(registration.created_at);
  if (!Number.isFinite(createdAtMs)) return null;

  const initialDelaySeconds = readNumber(config, "initial_delay_seconds", 0);
  const emitOnStart = readBool(config, "emit_on_start", true);

  return {
    intervalSeconds,
    intervalMs,
    nextFireAtMs:
      createdAtMs + initialDelaySeconds * 1000 + (emitOnStart ? 0 : intervalMs)
  };
}

/**
 * The next fire instant as ISO 8601, or `null` when the registration is not a
 * schedule, is disabled, or has no schedulable anchor. This is the value the
 * editor renders; it can be in the past for a registration the sweep has not
 * caught up with yet.
 */
export function nextFireAtIso(registration: TriggerRegistration): string | null {
  if (registration.kind !== SCHEDULE_KIND) return null;
  if (registration.enabled !== 1) return null;
  const timing = computeScheduleTiming(registration);
  if (!timing) return null;
  return new Date(timing.nextFireAtMs).toISOString();
}

/** `interval_seconds` for a schedule registration, `null` for other kinds. */
export function scheduleIntervalSeconds(
  registration: TriggerRegistration
): number | null {
  if (registration.kind !== SCHEDULE_KIND) return null;
  return readNumber(
    registration.config_json,
    "interval_seconds",
    DEFAULT_INTERVAL_SECONDS
  );
}
