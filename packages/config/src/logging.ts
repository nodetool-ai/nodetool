/**
 * Logging — matches Python's nodetool logging format.
 *
 * Usage:
 *   import { createLogger } from "@nodetool/config";
 *   const log = createLogger("nodetool.kernel.runner");
 *   log.info("Workflow started", { jobId });
 *   log.debug("Node executing", { nodeId, type });
 */

import { openSync, writeSync } from "node:fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface LoggingOptions {
  level?: LogLevel;
}

const VALID_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];
const LEVEL_NUM: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLevel: LogLevel = "info";

/** File descriptor for log output. Defaults to stderr; set via NODETOOL_LOG_FILE. */
let logFd: number | null = null;

/**
 * Configure the global log level.
 * Priority: explicit option > NODETOOL_LOG_LEVEL env > LOG_LEVEL env > "info"
 *
 * If NODETOOL_LOG_FILE is set, logs are written to that file instead of stderr.
 * This is useful when the terminal is controlled by a TUI (e.g. Ink).
 */
export function configureLogging(opts: LoggingOptions = {}): void {
  if (opts.level) {
    currentLevel = opts.level;
  } else {
    const envLevel = (
      process.env["NODETOOL_LOG_LEVEL"] ??
      process.env["LOG_LEVEL"] ??
      "info"
    ).toLowerCase() as LogLevel;
    currentLevel = VALID_LEVELS.includes(envLevel) ? envLevel : "info";
  }

  // Open log file if configured (lazy import to keep module lightweight)
  const logFile = process.env["NODETOOL_LOG_FILE"];
  if (logFile && logFd === null) {
    try {
      logFd = openSync(logFile, "a");
    } catch {
      // Fall back to stderr silently
    }
  }
}

/** Get the current global log level. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

// Colour support
const USE_COLOR = process.stderr.isTTY && !process.env["NO_COLOR"];

const C = {
  reset: USE_COLOR ? "\x1b[0m" : "",
  dim: USE_COLOR ? "\x1b[2m" : "",
  gray: USE_COLOR ? "\x1b[90m" : "",
  green: USE_COLOR ? "\x1b[32m" : "",
  yellow: USE_COLOR ? "\x1b[33m" : "",
  red: USE_COLOR ? "\x1b[31m" : "",
  cyan: USE_COLOR ? "\x1b[36m" : ""
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: C.gray,
  info: C.green,
  warn: C.yellow,
  error: C.red
};

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return "";
  return (
    " " +
    args
      .map((a) => {
        if (a instanceof Error) return a.stack ?? a.message;
        if (typeof a === "object" && a !== null) return JSON.stringify(a);
        return String(a);
      })
      .join(" ")
  );
}

function write(
  level: LogLevel,
  name: string,
  msg: string,
  args: unknown[]
): void {
  if (LEVEL_NUM[level] < LEVEL_NUM[currentLevel]) return;
  const lc = LEVEL_COLOR[level];
  const ts = `${C.dim}${timestamp()}${C.reset}`;
  const lv = `${lc}${level.toUpperCase().padEnd(5)}${C.reset}`;
  const nm = `${C.cyan}${name}${C.reset}`;
  const line = `${ts} | ${lv} | ${nm} | ${msg}${formatArgs(args)}\n`;
  if (logFd !== null) {
    writeSync(logFd, line);
  } else {
    process.stderr.write(line);
  }
}

/**
 * Create a named logger. Mirrors Python's logging.getLogger(__name__).
 *
 * @param name  Module/component name, e.g. "nodetool.kernel.runner"
 */
export function createLogger(name: string): Logger {
  return {
    debug: (msg, ...args) => write("debug", name, msg, args),
    info: (msg, ...args) => write("info", name, msg, args),
    warn: (msg, ...args) => write("warn", name, msg, args),
    error: (msg, ...args) => write("error", name, msg, args)
  };
}
