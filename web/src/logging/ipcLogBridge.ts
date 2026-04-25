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

const normalizeLevel = (level: string): FrontendLogLevel => {
  if (level === "error") {
    return "error";
  }
  if (level === "warn") {
    return "warn";
  }
  return "info";
};

const sendToMain = (level: FrontendLogLevel, source: string, args: unknown[]) => {
  // Only forward errors and warnings to the main process — info/debug/log are
  // noisy and the IPC round-trip is a real bottleneck during normal operation.
  if (level !== "error" && level !== "warn") {
    return;
  }
  if (!window.api?.logging?.log) {
    return;
  }
  const message = args.map((arg) => toStringSafe(arg)).join(" ");
  if (!message) {
    return;
  }
  void window.api.logging.log(level, message, source);
};

export const installIpcLogBridge = () => {
  if (installed) {
    return;
  }
  installed = true;

  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    sendToMain("info", "web/console", args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    sendToMain("warn", "web/console", args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    sendToMain("error", "web/console", args);
  };
};
