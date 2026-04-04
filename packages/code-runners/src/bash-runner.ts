import {
  StreamRunnerBase,
  type StreamRunnerOptions
} from "./stream-runner-base.js";

/**
 * Docker-backed Bash code runner.
 *
 * Prepends `set -e` and env_locals as `key=repr(value)` assignment lines
 * before user code and executes via `bash -lc`.
 */
export class BashDockerRunner extends StreamRunnerBase {
  constructor(options?: { image?: string } & StreamRunnerOptions) {
    super({ image: options?.image ?? "bash:5.2", ...options });
  }

  override buildContainerCommand(
    userCode: string,
    envLocals: Record<string, unknown>
  ): string[] {
    let code = "set -e\n";
    for (const [key, value] of Object.entries(envLocals)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
      code += `${key}=${bashRepr(value)}\n`;
    }
    code += userCode;
    return ["bash", "-lc", code];
  }
}

/**
 * Best-effort Python `repr()` equivalent for shell variable assignment.
 */
function bashRepr(value: unknown): string {
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
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => bashRepr(v)).join(", ");
    return `[${items}]`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${JSON.stringify(k)}: ${bashRepr(v)}`
    );
    return `{${parts.join(", ")}}`;
  }
  return JSON.stringify(String(value));
}
