import { DateTime } from "luxon";
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
  let dateTime: DateTime;
  if (typeof dateStr === "number") {
    dateTime = DateTime.fromMillis(dateStr);
  } else {
    const compliantDateStr = dateStr.replace(" ", "T");
    dateTime = DateTime.fromISO(compliantDateStr);
  }

  if (!dateTime.isValid) {
    log.warn(dateTime.invalidReason);
    return "Invalid Date";
  }

  const now = DateTime.now();
  const timeFormat = settings?.timeFormat || "12h";

  if (formatStyle === "verbose") {
    if (timeFormat === "24h") {
      const dateFormat =
        dateTime.year === now.year ? "d. MMMM " : "d MMMM yyyy";
      return dateTime.toFormat(`${dateFormat} | HH:mm`);
    } else {
      const dateFormat = dateTime.year === now.year ? "MMMM d" : "yyyy MMMM d";
      return dateTime.toFormat(`${dateFormat} | hh:mm a`);
    }
  } else {
    if (timeFormat === "24h") {
      const dateFormat = "dd.MM.yyyy";
      return dateTime.toFormat(`${dateFormat} | HH:mm:ss`);
    } else {
      return dateTime.toFormat("yyyy-MM-dd | hh:mm:ss a");
    }
  }
}

export function relativeTime(date: Date | string): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  const timeUnits: [string, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
  ];

  for (const [unit, secondsInUnit] of timeUnits) {
    const difference = Math.floor(diffInSeconds / secondsInUnit);

    if (difference >= 1) {
      return difference === 1 ? `1 ${unit} ago` : `${difference} ${unit}s ago`;
    }
  }

  return "just now";
}

export function getTimestampForFilename(includeTime: boolean = true): string {
  if (includeTime) {
    return DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss");
  } else {
    return DateTime.now().toFormat("yyyy-MM-dd");
  }
}
