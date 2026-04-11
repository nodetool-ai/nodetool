import { format, isValid, parseISO } from "date-fns";
import log from "loglevel";

interface Settings {
  timeFormat: "12h" | "24h";
}

export function secondsToHMS(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds = Math.floor(seconds % 60);

  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
}

export function prettyDate(
  dateStr: string | number | undefined,
  formatStyle: "normal" | "verbose" = "normal",
  settings?: Settings
): string {
  if (!dateStr) {
    return "-";
  }

  // Handle numeric timestamp input
  let date: Date;
  if (typeof dateStr === "number") {
    date = new Date(dateStr);
  } else {
    const compliantDateStr = dateStr.replace(" ", "T");
    date = parseISO(compliantDateStr);
  }

  if (!isValid(date)) {
    log.warn("Invalid date input");
    return "Invalid Date";
  }

  const now = new Date();
  const timeFormat = settings?.timeFormat || "12h";

  if (formatStyle === "verbose") {
    if (timeFormat === "24h") {
      const datePattern =
        date.getFullYear() === now.getFullYear()
          ? "d. MMMM "
          : "d MMMM yyyy";
      return format(date, `${datePattern} | HH:mm`);
    } else {
      const datePattern =
        date.getFullYear() === now.getFullYear()
          ? "MMMM d"
          : "yyyy MMMM d";
      return format(date, `${datePattern} | hh:mm a`);
    }
  } else {
    if (timeFormat === "24h") {
      return format(date, "dd.MM.yyyy | HH:mm:ss");
    } else {
      return format(date, "yyyy-MM-dd | hh:mm:ss a");
    }
  }
}

export function relativeTime(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  // [singular, plural, seconds]
  const timeUnits: [string, string, number][] = [
    ["year", "years", 31536000],
    ["month", "months", 2592000],
    ["week", "weeks", 604800],
    ["day", "days", 86400],
    ["hour", "hours", 3600],
    ["min", "min", 60],
    ["sec", "sec", 1]
  ];

  for (const [singular, plural, secondsInUnit] of timeUnits) {
    const difference = Math.floor(diffInSeconds / secondsInUnit);

    if (difference >= 1) {
      return difference === 1 ? `1 ${singular} ago` : `${difference} ${plural} ago`;
    }
  }

  return "just now";
}

export function getTimestampForFilename(includeTime: boolean = true): string {
  const now = new Date();
  const iso = now.toISOString();
  if (includeTime) {
    // Format: yyyy-MM-dd_HH-mm-ss in UTC (from ISO string)
    return iso.slice(0, 10) + "_" + iso.slice(11, 19).replace(/:/g, "-");
  } else {
    return iso.slice(0, 10);
  }
}
