import { DEVLOG_NOTIFICATION_VERBOSITY } from "../config/constants";

export function devLog(message: any, ...optionalParams: any[]) {
  if (
    import.meta.env.MODE === "development" &&
    DEVLOG_NOTIFICATION_VERBOSITY.includes("info")
  ) {
    console.log(`[DEV]`, message, ...optionalParams);
  }
}

export function devWarn(message: any, ...optionalParams: any[]) {
  if (
    import.meta.env.MODE === "development" &&
    DEVLOG_NOTIFICATION_VERBOSITY.includes("warn")
  ) {
    console.warn(`[DEV]`, message, ...optionalParams);
  }
}

export function devError(message: any, ...optionalParams: any[]) {
  if (
    import.meta.env.MODE === "development" &&
    DEVLOG_NOTIFICATION_VERBOSITY.includes("error")
  ) {
    console.error(`[DEV]`, message, ...optionalParams);
  }
}
