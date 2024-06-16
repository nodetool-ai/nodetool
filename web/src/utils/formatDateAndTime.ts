import { DateTime } from "luxon";
import { devWarn } from "./DevLog";

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
    devWarn(dateTime.invalidReason);
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

export function getTimestampForFilename(includeTime: boolean = true): string {
  if (includeTime) {
    return DateTime.now().toFormat("yyyy-MM-dd_HH-mm-ss");
  } else {
    return DateTime.now().toFormat("yyyy-MM-dd");
  }
}
