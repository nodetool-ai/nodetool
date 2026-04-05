import {
  StreamRunnerBase,
  type StreamRunnerOptions
} from "./stream-runner-base.js";

/**
 * Docker-backed Ruby code runner.
 *
 * Prepends env_locals as `key = repr(value)` assignment lines before user code
 * and executes via `ruby -e`.
 */
export class RubyDockerRunner extends StreamRunnerBase {
  constructor(options?: { image?: string } & StreamRunnerOptions) {
    super({ image: options?.image ?? "ruby:3.3-alpine", ...options });
  }

  override buildContainerCommand(
    userCode: string,
    envLocals: Record<string, unknown>
  ): string[] {
    let code = "";
    for (const [key, value] of Object.entries(envLocals)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
      code += `${key}=${rubyRepr(value)}\n`;
    }
    code += userCode;
    return ["ruby", "-e", code];
  }
}

/**
 * Best-effort Ruby `repr` / `inspect` equivalent for common JS types.
 */
function rubyRepr(value: unknown): string {
  if (value === null || value === undefined) {
    return "nil";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => rubyRepr(v)).join(", ");
    return `[${items}]`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${JSON.stringify(k)} => ${rubyRepr(v)}`
    );
    return `{${parts.join(", ")}}`;
  }
  return JSON.stringify(String(value));
}
