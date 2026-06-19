import {
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInMonths,
  differenceInYears
} from "date-fns";

export function secondsToHMS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);

  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
}

function agoLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular} ago` : `${count} ${plural} ago`;
}

export function relativeTime(date: Date | string): string {
  const now = new Date();
  const past = typeof date === "string" ? new Date(date) : date;

  const seconds = differenceInSeconds(now, past);
  if (seconds < 1) {
    return "just now";
  }

  // Months and years are calendar-aware (date-fns) rather than fixed 30/365-day
  // windows, so e.g. a date in a 31-day month is not rounded up early.
  const years = differenceInYears(now, past);
  if (years >= 1) {
    return agoLabel(years, "year", "years");
  }

  const months = differenceInMonths(now, past);
  if (months >= 1) {
    return agoLabel(months, "month", "months");
  }

  const days = differenceInDays(now, past);
  const weeks = Math.floor(days / 7);
  if (weeks >= 1) {
    return agoLabel(weeks, "week", "weeks");
  }
  if (days >= 1) {
    return agoLabel(days, "day", "days");
  }

  const hours = differenceInHours(now, past);
  if (hours >= 1) {
    return agoLabel(hours, "hour", "hours");
  }

  const minutes = differenceInMinutes(now, past);
  if (minutes >= 1) {
    return agoLabel(minutes, "min", "min");
  }

  return agoLabel(seconds, "sec", "sec");
}

