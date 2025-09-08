import { relativeTime } from "./formatDateAndTime";

export function groupByDate(
  date: Date | string,
  now: Date = new Date()
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Normalize to start-of-day to get full-day difference
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate()
  );

  const diffDays = Math.floor(
    (nowStart.getTime() - dateStart.getTime()) / MS_PER_DAY
  );

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  // For 7+ days, use more general relative labels (weeks, months, years)
  return relativeTime(dateObj);
}
