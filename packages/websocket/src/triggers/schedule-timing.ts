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
 * A registration compiled from a Schedule Trigger node carries `cron_expr`
 * and `cron_tz` instead of `interval_seconds`. Its fire time is the next
 * calendar match after an anchor: the last of `created_at`, `cursor` (stamped
 * when the trigger is armed or its schedule edited, so arming at 15:00 does
 * not fire for a slot that passed on Tuesday) and `last_fired_at`. After
 * downtime the first missed slot is due, and fires once. Its `last_fired_at`
 * then moves the anchor past every other missed slot, so there is no burst.
 *
 * `include_drift_compensation` is deliberately not read here: it is an
 * in-process concern of `IntervalTriggerNode`'s own loop. The host schedules
 * from the last fire, so a slow sweep shifts the next tick rather than
 * catching up on missed ones.
 */

import type { TriggerRegistration } from "@nodetool-ai/models";
import { DEFAULT_CRON_TZ, nextCronFireMs } from "@nodetool-ai/nodes-utils";

/** The registration kind whose `last_fired_at` doubles as the sweep cursor. */
export const SCHEDULE_KIND = "schedule";

export const DEFAULT_INTERVAL_SECONDS = 60;

/** The cron expression and timezone of a Schedule Trigger registration. */
interface CronSettings {
  expr: string;
  timezone: string;
}

/** A fixed-interval registration, from an Interval Trigger node. */
interface IntervalScheduleTiming {
  mode: "interval";
  /** `interval_seconds` from config, or the 60s default. */
  intervalSeconds: number;
  /** The same interval in milliseconds, floored at 1ms. */
  intervalMs: number;
  /** Epoch ms of the next instant this registration is due to fire. */
  nextFireAtMs: number;
}

/** A calendar registration, from a Schedule Trigger node. */
interface CronScheduleTiming {
  mode: "cron";
  cron: CronSettings;
  /** Epoch ms of the next instant this registration is due to fire. */
  nextFireAtMs: number;
}

export type ScheduleTiming = IntervalScheduleTiming | CronScheduleTiming;

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
 * The cron settings of a schedule registration, or `null` for an interval
 * one. The `cron_expr` key marks a registration as cron. Registration sync
 * writes both keys, filling defaults for a property the graph left unset.
 */
export function scheduleCronSettings(
  registration: TriggerRegistration
): CronSettings | null {
  if (registration.kind !== SCHEDULE_KIND) return null;
  const config = registration.config_json;
  if (!config || typeof config.cron_expr !== "string") return null;
  return {
    expr: config.cron_expr,
    timezone:
      typeof config.cron_tz === "string" ? config.cron_tz : DEFAULT_CRON_TZ
  };
}

/**
 * Start a cron registration's clock at `nowMs`. Called when it is armed and
 * when its schedule is edited, so slots that passed while it was off or under
 * the old expression are not fired. Does nothing for an interval registration,
 * which measures from `created_at` and `last_fired_at`.
 */
export function anchorCronSchedule(
  registration: TriggerRegistration,
  nowMs: number
): void {
  if (scheduleCronSettings(registration)) {
    registration.cursor = new Date(nowMs).toISOString();
  }
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function computeCronTiming(
  registration: TriggerRegistration,
  cron: CronSettings
): CronScheduleTiming | null {
  const anchors = [
    parseMs(registration.created_at),
    parseMs(registration.cursor),
    parseMs(registration.last_fired_at)
  ].filter((ms): ms is number => ms !== null);
  if (anchors.length === 0) return null;
  const nextFireAtMs = nextCronFireMs(
    cron.expr,
    cron.timezone,
    Math.max(...anchors)
  );
  return nextFireAtMs === null ? null : { mode: "cron", cron, nextFireAtMs };
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
  const cron = scheduleCronSettings(registration);
  if (cron) return computeCronTiming(registration, cron);

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
        mode: "interval",
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
    mode: "interval",
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

/**
 * `interval_seconds` for an interval registration, `null` for other kinds and
 * for a cron registration, which has no fixed interval.
 */
export function scheduleIntervalSeconds(
  registration: TriggerRegistration
): number | null {
  if (registration.kind !== SCHEDULE_KIND) return null;
  if (scheduleCronSettings(registration)) return null;
  return readNumber(
    registration.config_json,
    "interval_seconds",
    DEFAULT_INTERVAL_SECONDS
  );
}
