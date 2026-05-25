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

  if (
    /\| INFO \|/i.test(trimmed) ||
    /Flux preload|Starting Flux|execute_node|Loading Nunchaku|Nunchaku transformer/i.test(
      trimmed
    )
  ) {
    logger.info(`[python-worker] ${trimmed}`);
    return;
  }

  logger.debug(`[python-worker] ${trimmed}`);
}
