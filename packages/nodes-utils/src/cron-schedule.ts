/**
 * Cron schedules: parse a 5-field expression in an IANA timezone and find the
 * next instant it fires.
 *
 * The Schedule Trigger node validates with `cronScheduleError`, and the server
 * scheduler and the editor's "next fire" readout both ask `nextCronFireMs`,
 * so all three agree on what an expression means.
 *
 * Calendar semantics follow Vixie cron, computed on the zone's wall clock:
 *
 * - A time that does not exist (spring forward) fires at the first instant
 *   after the gap. `30 2 * * *` on a night that skips 02:00-03:00 fires at
 *   03:00.
 * - A time that occurs twice (fall back) fires once, on its first occurrence.
 * - A wildcard hour such as `0,30 * * * *` keeps firing in real time through
 *   a repeated hour, because every match is a distinct instant.
 *
 * The date arithmetic is `croner`, which resolves wall-clock times through
 * `Intl.DateTimeFormat`. The tests in `tests/cron-schedule.test.ts` pin the
 * transitions above instead of relying on its documentation.
 */

import { Cron } from "croner";

/** Every weekday at 08:00, the example that motivates the node. */
export const DEFAULT_CRON_EXPR = "0 8 * * 1-5";

/** The zone used when a Schedule Trigger does not name one. */
export const DEFAULT_CRON_TZ = "UTC";

const FIELD_COUNT = 5;

function normalizeExpr(expr: string): string {
  return expr.trim().split(/\s+/).join(" ");
}

/**
 * Why `expr` is not a usable 5-field cron expression, or `null` when it is.
 * The message is written for the person editing the node.
 */
export function cronExprError(expr: string): string | null {
  if (expr.trim() === "") {
    return "Cron expression is empty. Use five fields, for example 0 8 * * 1-5.";
  }
  const normalized = normalizeExpr(expr);
  const fields = normalized.split(" ").length;
  if (fields !== FIELD_COUNT) {
    return `Cron expression "${normalized}" has ${fields} fields. Use exactly ${FIELD_COUNT}: minute, hour, day of month, month, day of week.`;
  }
  try {
    // Croner finds the first match lazily. Asking once now surfaces a pattern
    // that no date satisfies, such as `0 0 30 2 *`, here instead of never.
    if (new Cron(normalized, { timezone: DEFAULT_CRON_TZ }).nextRun() === null) {
      return `Cron expression "${normalized}" never matches a date.`;
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `Invalid cron expression "${normalized}": ${reason.replace(/^CronPattern:\s*/, "")}`;
  }
  return null;
}

/** Why `timezone` is not an IANA zone this server can use, or `null`. */
export function cronTimezoneError(timezone: string): string | null {
  if (timezone.trim() === "") {
    return `Timezone is empty. Use an IANA name such as Europe/Berlin or ${DEFAULT_CRON_TZ}.`;
  }
  const zone = timezone.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    // Croner converts dates through its own path. Check that it accepts the
    // zone too, so the scheduler never meets a zone that only Intl knows.
    new Cron("* * * * *", { timezone: zone }).nextRun();
  } catch {
    return `Unknown timezone "${zone}". Use an IANA name such as Europe/Berlin or America/New_York.`;
  }
  return null;
}

/** The first reason an expression and timezone cannot schedule, or `null`. */
export function cronScheduleError(
  expr: string,
  timezone: string
): string | null {
  return cronExprError(expr) ?? cronTimezoneError(timezone);
}

/**
 * Epoch ms of the first fire strictly after `afterMs`, or `null` when the
 * expression or timezone is invalid or nothing matches.
 */
export function nextCronFireMs(
  expr: string,
  timezone: string,
  afterMs: number
): number | null {
  if (cronScheduleError(expr, timezone) !== null) return null;
  const cron = new Cron(normalizeExpr(expr), { timezone: timezone.trim() });
  const next = cron.nextRun(new Date(afterMs));
  return next ? next.getTime() : null;
}
