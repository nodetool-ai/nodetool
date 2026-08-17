/**
 * A bounded in-memory record of everything the app logged to the console,
 * plus uncaught errors and rejected promises.
 *
 * The bug-report dialog attaches this. Without it a reporter has to reproduce
 * the failure with devtools already open, which nobody does.
 */
import { isString } from "./typePredicates";

export type ConsoleLevel = "log" | "info" | "warn" | "error";

export interface ConsoleEntry {
  timestamp: number;
  level: ConsoleLevel;
  text: string;
}

/** Entries kept in the buffer. Older ones are dropped. */
const MAX_ENTRIES = 300;

/** A single console argument is truncated to this length. */
const MAX_ARG_CHARS = 2000;

const buffer: ConsoleEntry[] = [];

let installed = false;

function stringifyArg(arg: unknown): string {
  if (isString(arg)) {
    return arg;
  }
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`;
  }
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    // Circular structures and getters that throw are common in React trees.
    return String(arg);
  }
}

function truncate(text: string): string {
  return text.length <= MAX_ARG_CHARS
    ? text
    : `${text.slice(0, MAX_ARG_CHARS)}… (${text.length} chars)`;
}

export function recordConsoleEntry(level: ConsoleLevel, args: unknown[]): void {
  buffer.push({
    timestamp: Date.now(),
    level,
    text: truncate(args.map(stringifyArg).join(" "))
  });
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

/** Snapshot of the buffer, oldest first. */
export function getConsoleEntries(): ConsoleEntry[] {
  return buffer.slice();
}

export function formatConsoleEntries(entries: ConsoleEntry[]): string {
  if (entries.length === 0) {
    return "(no console output captured)";
  }
  return entries
    .map(
      (entry) =>
        `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.text}`
    )
    .join("\n");
}

export function clearConsoleEntries(): void {
  buffer.length = 0;
}

/**
 * Patch the console and the global error handlers. Call once at boot.
 * The original console methods still run, so devtools are unaffected.
 */
export function installConsoleCapture(): void {
  if (installed) {
    return;
  }
  installed = true;

  const levels: ConsoleLevel[] = ["log", "info", "warn", "error"];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      recordConsoleEntry(level, args);
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    recordConsoleEntry("error", [
      `Uncaught ${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
      event.error
    ]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    recordConsoleEntry("error", ["Unhandled promise rejection", event.reason]);
  });
}
