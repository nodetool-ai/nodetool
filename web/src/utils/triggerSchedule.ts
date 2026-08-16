/**
 * Formatting for a schedule trigger's cadence and next fire time.
 *
 * Both `interval_seconds` and `next_fire_at` are optional on the wire — a
 * webhook or manual registration never carries them, and an older server
 * omits them entirely. Every helper here returns `null` for anything it
 * cannot render, so the caller shows nothing instead of "Invalid Date".
 */

/** "45s", "5m", "1h 30m", "2d" — null for a non-positive or invalid input. */
export const formatDuration = (seconds: number | null | undefined): string | null => {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  if (total < 86400) {
    const hours = Math.floor(total / 3600);
    const rest = Math.floor((total % 3600) / 60);
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(total / 86400);
  const rest = Math.floor((total % 86400) / 3600);
  return rest ? `${days}d ${rest}h` : `${days}d`;
};

/**
 * "next in 4m" for a future timestamp, "due now" for one that has passed.
 * Null when the timestamp is missing or unparseable.
 */
export const formatNextFire = (
  iso: string | null | undefined,
  now: number = Date.now()
): string | null => {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const seconds = (at - now) / 1000;
  if (seconds <= 0) return "due now";
  return `next in ${formatDuration(Math.max(1, seconds))}`;
};

/**
 * The one-line schedule summary shown on a schedule trigger row, e.g.
 * "Runs every 5m — next in 4m". Null when neither field is usable.
 */
export const formatSchedule = (
  intervalSeconds: number | null | undefined,
  nextFireAt: string | null | undefined,
  now: number = Date.now()
): string | null => {
  const cadence = formatDuration(intervalSeconds);
  const next = formatNextFire(nextFireAt, now);
  if (cadence && next) return `Runs every ${cadence} — ${next}`;
  if (cadence) return `Runs every ${cadence}`;
  if (next) return next.charAt(0).toUpperCase() + next.slice(1);
  return null;
};
