import {
  StreamRunnerBase,
  type StreamRunnerOptions
} from "./stream-runner-base.js";

/**
 * Docker-backed JavaScript code runner.
 *
 * Prepends env_locals as `const key = JSON.stringify(value);` lines before
 * user code and executes via `node -e`.
 */
export class JavaScriptDockerRunner extends StreamRunnerBase {
  constructor(options?: { image?: string } & StreamRunnerOptions) {
    super({ image: options?.image ?? "node:22-alpine", ...options });
  }

  override buildContainerCommand(
    userCode: string,
    envLocals: Record<string, unknown>
  ): string[] {
    let code = "";
    for (const [key, value] of Object.entries(envLocals)) {
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) continue;
      code += `const ${key} = ${JSON.stringify(value)};\n`;
    }
    code += userCode;
    return ["node", "-e", code];
  }
}
