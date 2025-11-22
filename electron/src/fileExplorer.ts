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
  await logMessage(
    `[fileExplorer] Received request to open path: ${requestedPath}`
  );
  const safeRoots = getValidExplorableRoots();
  await logMessage(
    `[fileExplorer] Safe roots resolved: ${
      safeRoots.length > 0 ? safeRoots.join(", ") : "<none>"
    }`
  );
  if (safeRoots.length === 0) {
    await logMessage(
      "[fileExplorer] Aborting openPathInExplorer because no safe roots were found",
      "warn"
    );
    return {
      status: "error",
      message:
        "Cannot open path: No safe directories (like Ollama or Hugging Face cache) could be determined.",
    };
  }

  let normalized: string;
  try {
    normalized = normalizePath(requestedPath);
    await logMessage(
      `[fileExplorer] Normalized requested path to: ${normalized}`
    );
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
    await logMessage(
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
    await logMessage(
      `[fileExplorer] Opening path via shell: ${normalized}`,
      "info"
    );
    const result = await shell.openPath(normalized);
    if (result) {
      throw new Error(result);
    }
    await logMessage(
      `[fileExplorer] Successfully opened path in explorer: ${normalized}`
    );
    return { status: "success", path: normalized };
  } catch (error) {
    await logMessage(
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
  await logMessage(
    `[fileExplorer] Request to open model directory: ${target}`
  );
  const dir =
    target === "ollama" ? getOllamaModelsDir() : getHuggingFaceCacheDir();

  if (!dir) {
    const label =
      target === "ollama" ? "Ollama models" : "Hugging Face cache";
    await logMessage(
      `[fileExplorer] ${label} directory is unavailable; cannot open in explorer`,
      "warn"
    );
    return {
      status: "error",
      message: `${label} directory is not available on this system.`,
    };
  }

  await logMessage(
    `[fileExplorer] Resolved ${target} directory to: ${dir}. Forwarding to openPathInExplorer.`
  );
  return openPathInExplorer(dir);
}
