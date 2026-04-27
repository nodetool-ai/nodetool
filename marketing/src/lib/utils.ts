import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const DEVLOG_NOTIFICATION_VERBOSITY: ("error" | "info" | "warn")[] = [
  "info",
  "error",
  "warn",
];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function devLog(message: any, ...optionalParams: any[]) {
  if (
    process.env.NODE_ENV === "development" &&
    DEVLOG_NOTIFICATION_VERBOSITY.includes("info")
  ) {
    console.log(`[DEV]`, message, ...optionalParams);
  }
}

export function devWarn(message: any, ...optionalParams: any[]) {
  if (
    process.env.NODE_ENV === "development" &&
    DEVLOG_NOTIFICATION_VERBOSITY.includes("warn")
  ) {
    console.warn(`[DEV]`, message, ...optionalParams);
  }
}

export function devError(message: any, ...optionalParams: any[]) {
  if (
    process.env.NODE_ENV === "development" &&
    DEVLOG_NOTIFICATION_VERBOSITY.includes("error")
  ) {
    console.error(`[DEV]`, message, ...optionalParams);
  }
}
