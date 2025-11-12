import { getOllamaPath, getOllamaModelsPath } from "./config";
import { logMessage } from "./logger";

type ServerModule = typeof import("./server");

let serverModulePromise: Promise<ServerModule> | null = null;

const loadServerModule = async (): Promise<ServerModule> => {
  if (!serverModulePromise) {
    serverModulePromise = import("./server");
  }

  return serverModulePromise;
};

/**
 * Default port used by the bundled Ollama server.
 */
export const DEFAULT_OLLAMA_PORT = 11435;

/**
 * Returns the absolute path to the Ollama binary bundled with the
 * micromamba environment.
 */
export function resolveOllamaBinary(): string {
  return getOllamaPath();
}

/**
 * Returns the directory where Ollama models are stored for the current user.
 */
export function resolveOllamaModelsDirectory(): string {
  return getOllamaModelsPath();
}

/**
 * Emits a log message namespaced for Ollama specific operations.
 */
export function logOllamaMessage(message: string, level: "info" | "warn" | "error" = "info"): void {
  logMessage(`[ollama] ${message}`, level);
}

/**
 * Checks whether the Ollama service is responding on the provided port.
 */
export async function checkOllamaAvailability(port: number = DEFAULT_OLLAMA_PORT): Promise<boolean> {
  const { isOllamaResponsive } = await loadServerModule();
  return isOllamaResponsive(port);
}

/**
 * Returns true when the Ollama watchdog is currently tracking a running process.
 */
export async function isBundledOllamaRunning(): Promise<boolean> {
  const { isOllamaRunning } = await loadServerModule();
  return isOllamaRunning();
}

export default {
  DEFAULT_OLLAMA_PORT,
  resolveOllamaBinary,
  resolveOllamaModelsDirectory,
  logOllamaMessage,
  checkOllamaAvailability,
  isBundledOllamaRunning,
};
