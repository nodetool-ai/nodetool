type FrontendLogLevel = "info" | "warn" | "error";

let installed = false;

const toStringSafe = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

// Browser-styled devtools loggers (tRPC's loggerLink, react-query, etc.) format
// with `%c` CSS directives and dump objects with `%O`. As plain text that's
// unreadable noise (the CSS strings + giant JSON payloads), so we drop any call
// whose format string uses `%c`.
const STYLED_LOG_MARKER = "%c";
const MAX_FORWARDED_LENGTH = 2000;

const forward = (level: FrontendLogLevel, args: unknown[]) => {
  const log = window.api?.logging?.log;
  if (!log) {
    return;
  }
  const first = args[0];
  if (typeof first === "string" && first.includes(STYLED_LOG_MARKER)) {
    return;
  }
  let message = args.map((arg) => toStringSafe(arg)).join(" ");
  if (!message) {
    return;
  }
  if (message.length > MAX_FORWARDED_LENGTH) {
    message = `${message.slice(0, MAX_FORWARDED_LENGTH)}…`;
  }
  void log(level, message, "web/console");
};

/**
 * Forward renderer console output to the main process (Electron terminal / log
 * file) WITHOUT echoing it to the browser devtools console. Logs are read from
 * the main-process logs, keeping the browser console clean — useful when
 * debugging where the renderer output would otherwise drown out the terminal.
 *
 * No-op outside Electron (no `window.api.logging.log`): the native console is
 * left intact so plain-web logs aren't silently dropped.
 */
export const installIpcLogBridge = (): void => {
  if (installed) {
    return;
  }
  if (!window.api?.logging?.log) {
    return;
  }
  installed = true;

  // Replace, don't wrap: we intentionally do not call the original console, so
  // nothing reaches the browser console. console.debug is left untouched.
  console.log = (...args: unknown[]) => forward("info", args);
  console.info = (...args: unknown[]) => forward("info", args);
  console.warn = (...args: unknown[]) => forward("warn", args);
  console.error = (...args: unknown[]) => forward("error", args);
};
