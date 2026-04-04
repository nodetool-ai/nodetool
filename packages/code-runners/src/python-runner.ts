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
    super({ image: options?.image ?? "python:3.11-slim", ...options });
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
