/**
 * Minimal date helpers replacing the date-fns functions this app used.
 * Relative phrasing lives in `formatDateAndTime.relativeTime`; localized
 * date/time rendering in `formatUtils.formatDateTime`.
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
export function formatPPpp(date: Date): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const ampm = hours24 < 12 ? "AM" : "PM";
  return (
    `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ` +
    `${hours12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`
  );
}
