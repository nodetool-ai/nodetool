/**
 * Minimal date helpers replacing the date-fns functions this app used.
 * Only the format patterns actually used at call sites are supported:
 * "PPpp" and "MMM d, yyyy · HH:mm".
 */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

export function parseISO(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    const date = new Date(0);
    date.setFullYear(year, month, day);
    date.setHours(0, 0, 0, 0);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return new Date(NaN);
    }
    return date;
  }
  return new Date(value);
}

/** True when the Date holds a real point in time. */
export function isValid(date: Date): boolean {
  return !isNaN(date.getTime());
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** "Apr 5, 2023, 9:07:03 AM" — matches date-fns "PPpp" (en-US). */
function formatPPpp(date: Date): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const ampm = hours24 < 12 ? "AM" : "PM";
  return (
    `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ` +
    `${hours12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`
  );
}

/** "Apr 5, 2023 · 09:07" */
function formatShortDateTime(date: Date): string {
  return (
    `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}` +
    ` · ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Format a date with one of the supported patterns. */
export function format(date: Date, pattern: string): string {
  switch (pattern) {
    case "PPpp":
      return formatPPpp(date);
    case "MMM d, yyyy · HH:mm":
      return formatShortDateTime(date);
    default:
      throw new Error(`Unsupported date format pattern: ${pattern}`);
  }
}

/**
 * Human "distance to now" phrasing matching date-fns closely:
 * "less than a minute", "5 minutes", "about 3 hours", "2 days",
 * "about 1 month", "3 months", "about 1 year", "over 1 year",
 * "almost 2 years" — with " ago" / "in " when addSuffix is set.
 */
export function formatDistanceToNow(
  date: Date,
  options?: { addSuffix?: boolean }
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const isPast = diffMs >= 0;
  const start = isPast ? date : now;
  const end = isPast ? now : date;
  const seconds = Math.trunc(Math.abs(diffMs) / 1000);
  const offsetInSeconds =
    (end.getTimezoneOffset() - start.getTimezoneOffset()) * 60;
  const minutes = Math.round((seconds - offsetInSeconds) / 60);
  const minutesInDay = 1440;
  const minutesInMonth = 43200;

  let distance: string;
  if (minutes === 0) {
    distance = "less than a minute";
  } else if (minutes < 45) {
    distance = minutes === 1 ? "1 minute" : `${minutes} minutes`;
  } else if (minutes < 90) {
    distance = "about 1 hour";
  } else if (minutes < minutesInDay) {
    distance = `about ${Math.round(minutes / 60)} hours`;
  } else if (minutes < 2520) {
    distance = "1 day";
  } else if (minutes < minutesInMonth) {
    distance = `${Math.round(minutes / minutesInDay)} days`;
  } else if (minutes < minutesInMonth * 2) {
    const months = Math.round(minutes / minutesInMonth);
    distance = `about ${months} ${months === 1 ? "month" : "months"}`;
  } else {
    const months = differenceInFullMonths(end, start);
    if (months < 12) {
      const nearestMonth = Math.round(minutes / minutesInMonth);
      distance = `${nearestMonth} months`;
    } else {
      const years = Math.trunc(months / 12);
      const remainder = months % 12;
      if (remainder < 3) {
        distance = years === 1 ? "about 1 year" : `about ${years} years`;
      } else if (remainder < 9) {
        distance = years === 1 ? "over 1 year" : `over ${years} years`;
      } else {
        distance = `almost ${years + 1} years`;
      }
    }
  }

  if (options?.addSuffix) {
    return isPast ? `${distance} ago` : `in ${distance}`;
  }
  return distance;
}

function differenceInFullMonths(later: Date, earlier: Date): number {
  const difference =
    (later.getFullYear() - earlier.getFullYear()) * 12 +
    later.getMonth() -
    earlier.getMonth();
  if (difference < 1) {
    return 0;
  }

  const adjustedLater = new Date(later);
  if (adjustedLater.getMonth() === 1 && adjustedLater.getDate() > 27) {
    adjustedLater.setDate(30);
  }
  adjustedLater.setMonth(adjustedLater.getMonth() - difference);

  const lastDayOfMonth =
    later.getDate() ===
    new Date(later.getFullYear(), later.getMonth() + 1, 0).getDate();
  const lastMonthIsFull = lastDayOfMonth && difference === 1;
  return difference - Number(adjustedLater < earlier && !lastMonthIsFull);
}
