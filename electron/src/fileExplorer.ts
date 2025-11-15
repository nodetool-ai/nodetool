import fs from "fs";
import os from "os";
import path from "path";
import { shell } from "electron";

import { logMessage } from "./logger";
import type { FileExplorerResult, ModelDirectory } from "./types";

const DEFAULT_HF_SUBDIR = path.join(".cache", "huggingface", "hub");

function expandUserPath(p?: string | null): string | undefined {
  if (!p) {
    return undefined;
  }
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function normalizePath(p: string): string {
  const expanded = expandUserPath(p) ?? p;
  return path.resolve(expanded);
}

function dirExists(target?: string | null): target is string {
  if (!target) {
    return false;
  }
  try {
    const stats = fs.statSync(target);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

function ensureDir(target?: string | null): string | undefined {
  if (!target) {
    return undefined;
  }
  const candidate = normalizePath(target);
  return dirExists(candidate) ? candidate : undefined;
}

export function getOllamaModelsDir(): string | undefined {
  const envOverride = expandUserPath(process.env.OLLAMA_MODELS);
  if (envOverride) {
    const resolved = normalizePath(envOverride);
    logMessage(
      `Using Ollama models directory from OLLAMA_MODELS env var: ${resolved}`,
      "info"
    );
    return resolved;
  }

  try {
    let candidate: string | undefined;
    if (process.platform === "win32") {
      const base = process.env.USERPROFILE || os.homedir();
      candidate = ensureDir(path.join(base, ".ollama", "models"));
    } else if (process.platform === "darwin") {
      candidate = ensureDir(path.join(os.homedir(), ".ollama", "models"));
    } else {
      const userPath = ensureDir(path.join(os.homedir(), ".ollama", "models"));
      candidate = userPath ?? ensureDir("/usr/share/ollama/.ollama/models");
    }

    if (candidate) {
      return candidate;
    }
  } catch (error) {
    logMessage(
      `Error determining Ollama models directory: ${String(error)}`,
      "error"
    );
  }
  return undefined;
}

export function getHuggingFaceCacheDir(): string | undefined {
  const candidates: (string | undefined)[] = [];
  const envOverride =
    process.env.HF_HUB_CACHE ??
    process.env.HUGGINGFACE_HUB_CACHE ??
    undefined;
  if (envOverride) {
    candidates.push(envOverride);
  }

  if (process.env.HF_HOME) {
    candidates.push(path.join(process.env.HF_HOME, "hub"));
  }

  if (process.env.XDG_CACHE_HOME) {
    candidates.push(
      path.join(process.env.XDG_CACHE_HOME, "huggingface", "hub")
    );
  }

  candidates.push(path.join(os.homedir(), DEFAULT_HF_SUBDIR));

  for (const candidate of candidates) {
    const resolved = ensureDir(candidate);
    if (resolved) {
      return resolved;
    }
  }

  logMessage("Hugging Face cache directory does not exist or is unavailable.", "warn");
  return undefined;
}

function getValidExplorableRoots(): string[] {
  const safeRoots: string[] = [];
  const ollamaDir = getOllamaModelsDir();
  if (ollamaDir) {
    safeRoots.push(ollamaDir);
  }

  const hfCache = getHuggingFaceCacheDir();
  if (hfCache) {
    safeRoots.push(hfCache);
  }

  return safeRoots;
}

function isPathWithin(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export async function openPathInExplorer(
  requestedPath: string
): Promise<FileExplorerResult> {
  const safeRoots = getValidExplorableRoots();
  if (safeRoots.length === 0) {
    return {
      status: "error",
      message:
        "Cannot open path: No safe directories (like Ollama or Hugging Face cache) could be determined.",
    };
  }

  let normalized: string;
  try {
    normalized = normalizePath(requestedPath);
  } catch (error) {
    logMessage(
      `Failed to normalize path ${requestedPath}: ${String(error)}`,
      "warn"
    );
    return {
      status: "error",
      message: "Path could not be resolved on this system.",
    };
  }

  const isSafe = safeRoots.some((root) => isPathWithin(normalized, root));
  if (!isSafe) {
    logMessage(
      `Path traversal attempt: ${normalized} is outside allowed directories ${safeRoots.join(
        ", "
      )}`,
      "warn"
    );
    return {
      status: "error",
      message: "Access denied: Path is outside the allowed directories.",
    };
  }

  try {
    const result = await shell.openPath(normalized);
    if (result) {
      throw new Error(result);
    }
    return { status: "success", path: normalized };
  } catch (error) {
    logMessage(
      `Failed to open path ${normalized} in explorer: ${String(error)}`,
      "error"
    );
    return {
      status: "error",
      message:
        "An internal error occurred while attempting to open the path. Please check logs for details.",
    };
  }
}

export async function openModelDirectory(
  target: ModelDirectory
): Promise<FileExplorerResult> {
  const dir =
    target === "ollama" ? getOllamaModelsDir() : getHuggingFaceCacheDir();

  if (!dir) {
    const label =
      target === "ollama" ? "Ollama models" : "Hugging Face cache";
    return {
      status: "error",
      message: `${label} directory is not available on this system.`,
    };
  }

  return openPathInExplorer(dir);
}
