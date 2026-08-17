/**
 * Settle rules — what a dispatched run does to its registration.
 *
 * Split out of the dispatcher because these are decisions, not plumbing: a
 * trigger that fails every time has to stop on its own (PRD O1), and a
 * registration may carry an expiry or a run ceiling (F8). Both are pure
 * functions over a registration row, so the tests read as a table rather than
 * as a dispatch harness.
 *
 * `enabled` stays the one armed/disarmed bit. `disabled_reason` says who
 * disarmed it: a non-null reason means the dispatcher gave up, `null` means a
 * person switched it off. Re-arming clears the reason and the failure count —
 * see `rearmTrigger`.
 */

import type { TriggerRegistration } from "@nodetool-ai/models";
import {
  TRIGGER_MAX_CONSECUTIVE_FAILURES,
  type TriggerDisabledReason
} from "@nodetool-ai/protocol";

/** Whether a registration may still start a run, and why not if it may not. */
export type TriggerGate =
  | { allowed: true }
  | { allowed: false; reason: TriggerDisabledReason };

/** A `max_runs` of null or 0 means unlimited. */
function spentItsRuns(registration: TriggerRegistration): boolean {
  const maxRuns = registration.max_runs;
  return maxRuns !== null && maxRuns > 0 && registration.run_count >= maxRuns;
}

/**
 * Bounds checked *before* the run starts. An exhausted registration must not
 * spend one more run proving it is exhausted.
 */
export function checkTriggerBounds(
  registration: TriggerRegistration,
  nowMs: number
): TriggerGate {
  const expiresAt = registration.expires_at;
  if (expiresAt) {
    const expiryMs = Date.parse(expiresAt);
    // An unparseable expiry is ignored rather than treated as expired:
    // disabling on bad config would be a silent, unexplainable stop.
    if (Number.isFinite(expiryMs) && nowMs >= expiryMs) {
      return { allowed: false, reason: "expired" };
    }
  }

  if (spentItsRuns(registration)) {
    return { allowed: false, reason: "max_runs" };
  }

  return { allowed: true };
}

/** Disarm a registration, recording why. Does not save. */
export function disableTrigger(
  registration: TriggerRegistration,
  reason: TriggerDisabledReason
): void {
  registration.enabled = 0;
  registration.disabled_reason = reason;
}

/**
 * Clear the dispatcher's verdict so a re-armed registration starts even.
 * Without this a registration disabled after five failures would disable
 * itself again on its next failure, one run in.
 */
export function rearmTrigger(registration: TriggerRegistration): void {
  registration.enabled = 1;
  registration.disabled_reason = null;
  registration.consecutive_failures = 0;
}

interface TriggerOutcome {
  /** The run's error, or `null` when it completed. */
  error: string | null;
  /** Whether this kind's fire time is the dispatcher's to stamp. */
  stampFiredAt: boolean;
  /** Fire time to stamp, ISO-8601. */
  firedAt: string;
}

/**
 * Apply a delivered run's outcome. Returns the reason the registration
 * disarmed itself, or `null` if it stayed armed.
 */
export function settleTriggerOutcome(
  registration: TriggerRegistration,
  outcome: TriggerOutcome
): TriggerDisabledReason | null {
  if (outcome.stampFiredAt) {
    registration.last_fired_at = outcome.firedAt;
  }
  registration.last_error = outcome.error;

  if (outcome.error === null) {
    registration.consecutive_failures = 0;
    registration.run_count += 1;
    // Also checked before dispatch, but disarming here means the UI says so
    // straight away instead of waiting for an event that may never arrive.
    if (spentItsRuns(registration)) {
      disableTrigger(registration, "max_runs");
      return "max_runs";
    }
    return null;
  }

  registration.consecutive_failures += 1;
  if (registration.consecutive_failures >= TRIGGER_MAX_CONSECUTIVE_FAILURES) {
    disableTrigger(registration, "failures");
    return "failures";
  }
  return null;
}

/**
 * Params every triggered run receives (PRD F5), alongside the trigger event
 * itself. They live here because `is_first_run` is defined by `run_count`,
 * which only `settleTriggerOutcome` advances: a run that fails is not a first
 * run spent, so a backfill-seeding graph sees `is_first_run` again on the
 * retry.
 *
 * A workflow picks them up through Input nodes of the same name; one that
 * declares none is unaffected.
 */
export function triggerRunParams(
  registration: TriggerRegistration,
  nowMs: number
) {
  return {
    last_fired_at: registration.last_fired_at,
    now: new Date(nowMs).toISOString(),
    is_first_run: registration.run_count === 0
  };
}
