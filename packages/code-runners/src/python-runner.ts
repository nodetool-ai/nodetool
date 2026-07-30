import { delimiter, join } from "node:path";
import { accessSync, constants } from "node:fs";
import {
  StreamRunnerBase,
  type StreamRunnerOptions
} from "./stream-runner-base.js";

/**
 * Docker-backed Python code runner.
 *
 * Prepends env_locals as `key = repr(value)` assignment lines before user code
 * and executes via `python -c`.
 */
export class PythonDockerRunner extends StreamRunnerBase {
  constructor(options?: { image?: string } & StreamRunnerOptions) {
    super({ ...options, image: options?.image ?? "python:3.11-slim" });
  }

  override buildContainerCommand(
    userCode: string,
    envLocals: Record<string, unknown>
  ): string[] {
    let code = "";
    for (const [key, value] of Object.entries(envLocals)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
      code += `${key}=${pythonRepr(value)}\n`;
    }
    code += userCode;
    return ["python", "-c", code];
  }

  /**
   * Subprocess mode reuses `buildContainerCommand`, whose `python` is correct
   * inside `python:3.11-slim` but not on a host. Debian, Ubuntu and macOS ship
   * only `python3` — no unsuffixed shim — so the container name spawns ENOENT
   * there. Called on the subprocess path only, so Docker keeps `python`.
   */
  override wrapSubprocessCommand(command: string[]): [string[], unknown] {
    if (command[0] !== "python") return super.wrapSubprocessCommand(command);
    return super.wrapSubprocessCommand([
      resolvePythonExecutable(),
      ...command.slice(1)
    ]);
  }
}

let cachedPythonExecutable: string | undefined;

/**
 * First of `python`/`python3` present on PATH, preferring the unsuffixed name
 * so an explicit shim (pyenv, a venv, conda) still wins. Falls back to
 * `python3` when neither resolves, which gives the clearer error of the two.
 */
function resolvePythonExecutable(): string {
  if (cachedPythonExecutable !== undefined) return cachedPythonExecutable;
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const suffixes = process.platform === "win32" ? [".exe", ".bat", ""] : [""];
  for (const name of ["python", "python3"]) {
    for (const dir of dirs) {
      for (const suffix of suffixes) {
        try {
          accessSync(join(dir, name + suffix), constants.X_OK);
          cachedPythonExecutable = name;
          return name;
        } catch {
          // Not executable here — keep looking.
        }
      }
    }
  }
  cachedPythonExecutable = "python3";
  return cachedPythonExecutable;
}

/**
 * Best-effort Python `repr()` equivalent for common JS types.
 */
function pythonRepr(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    // Use JSON.stringify which produces a valid Python string literal for most cases
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => pythonRepr(v)).join(", ");
    return `[${items}]`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${JSON.stringify(k)}: ${pythonRepr(v)}`
    );
    return `{${parts.join(", ")}}`;
  }
  return JSON.stringify(String(value));
}
