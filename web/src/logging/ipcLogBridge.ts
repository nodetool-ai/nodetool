import log from "loglevel";

type FrontendLogLevel = "info" | "warn" | "error";

let installed = false;
let inLoglevelDispatch = false;

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

  const originalFactory = log.methodFactory;
  log.methodFactory = (methodName, logLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);
    return (...args: unknown[]) => {
      inLoglevelDispatch = true;
      try {
        rawMethod(...args);
      } finally {
        inLoglevelDispatch = false;
      }
      sendToMain(normalizeLevel(methodName), "web/loglevel", args);
    };
  };
  log.rebuild();

  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    if (inLoglevelDispatch) {
      return;
    }
    sendToMain("info", "web/console", args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    if (inLoglevelDispatch) {
      return;
    }
    sendToMain("warn", "web/console", args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    if (inLoglevelDispatch) {
      return;
    }
    sendToMain("error", "web/console", args);
  };
};
