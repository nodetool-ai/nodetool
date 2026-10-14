import path from "path";
import log from "electron-log";
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  renameSync,
  truncateSync,
  writeSync,
} from "fs";
import { getSystemDataPath } from "./systemPaths";

/** The log level for the logger */
type LogLevel = "info" | "warn" | "error";

/**
 * The path to the log file
 * This matches Python's get_system_data_path("logs") / "nodetool.log"
 * to ensure logs are stored in the same location as the backend expects
 */
export const LOG_FILE: string = getSystemDataPath(path.join("logs", "nodetool.log"));

/** The log file rotates when a write would take it past this size. */
export const MAX_LOG_BYTES = 10 * 1024 * 1024;

/** Rotated copies kept as nodetool.log.1 … nodetool.log.N; older ones are overwritten. */
export const MAX_ROTATED_LOGS = 3;

let logFd: number | null = null;
let logBytes = 0;

/** Opens the log file for appending, or returns the open descriptor. */
function openLogFile(): number | null {
  if (logFd !== null) {
    return logFd;
  }
  try {
    mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    logFd = openSync(LOG_FILE, "a");
    logBytes = fstatSync(logFd).size;
  } catch (err) {
    console.error("Failed to open log file:", err);
    logFd = null;
  }
  return logFd;
}

/**
 * Shifts nodetool.log → .1 → .2 … and drops the oldest copy. If a rename
 * fails (a Windows file lock, for example), the live file is truncated so
 * the log never grows without bound.
 */
function rotateLogFile(): void {
  closeLogStream();
  try {
    for (let i = MAX_ROTATED_LOGS - 1; i >= 1; i--) {
      const source = `${LOG_FILE}.${i}`;
      if (existsSync(source)) {
        renameSync(source, `${LOG_FILE}.${i + 1}`);
      }
    }
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (err) {
    console.error("Failed to rotate log file:", err);
    try {
      truncateSync(LOG_FILE, 0);
    } catch (truncateErr) {
      console.error("Failed to truncate log file:", truncateErr);
    }
  }
}

function writeToLogFile(line: string): void {
  const lineBytes = Buffer.byteLength(line);
  let fd = openLogFile();
  if (fd !== null && logBytes > 0 && logBytes + lineBytes > MAX_LOG_BYTES) {
    rotateLogFile();
    fd = openLogFile();
  }
  if (fd === null) {
    return;
  }
  writeSync(fd, line);
  logBytes += lineBytes;
}

/** Logs a message to the console and the log file */
export function logMessage(
  message: string,
  level: LogLevel = "info"
): void {
  const trimmedMessage = message.trim();

  try {
    log[level](trimmedMessage);
    writeToLogFile(trimmedMessage + "\n");
  } catch (error) {
    console.error(`Error in log function: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Close the log file (call on app quit)
 */
export function closeLogStream(): void {
  if (logFd !== null) {
    try {
      closeSync(logFd);
    } catch (err) {
      console.error("Failed to close log file:", err);
    }
    logFd = null;
  }
}
