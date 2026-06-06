import type { Logger } from "@nodetool-ai/config";

/** Forward Python worker stderr lines at an appropriate log level. */
export function logPythonWorkerStderr(line: string, logger: Logger): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "NODETOOL_STDIO_READY") {
    return;
  }

  if (/\| ERROR \|/i.test(trimmed) || /^\[error\]/i.test(trimmed)) {
    logger.error(`[python-worker] ${trimmed}`);
    return;
  }

  if (/\| WARNING \|/i.test(trimmed) || /^\[warning\]/i.test(trimmed)) {
    logger.warn(`[python-worker] ${trimmed}`);
    return;
  }

  if (/\| DEBUG \|/i.test(trimmed) || /^\[debug\]/i.test(trimmed)) {
    logger.debug(`[python-worker] ${trimmed}`);
    return;
  }

  // Everything else from the worker (explicit INFO lines, raw prints,
  // tracebacks, library output) goes to the main log at info level so no
  // Python-side output is silently dropped at the default log level.
  logger.info(`[python-worker] ${trimmed}`);
}
