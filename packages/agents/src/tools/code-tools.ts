/**
 * Code execution tool -- runs code in a subprocess.
 *
 * Supports JavaScript, TypeScript, Python, and Bash.
 * Port of src/nodetool/agents/tools/code_tools.py (simplified for TS).
 */

import { execFile } from "node:child_process";
import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

const MAX_OUTPUT_CHARS = 50_000;
const DEFAULT_TIMEOUT_MS = 30_000;

type Language = "javascript" | "typescript" | "python" | "bash";

interface RunCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n[truncated]";
}

/**
 * Execute code in a subprocess and capture output.
 */
function runSubprocess(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<RunCodeResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_CHARS * 2,
        encoding: "utf-8"
      },
      (error, stdout, stderr) => {
        let exitCode: number | null = 0;
        if (error) {
          // Node sets `killed` when the timeout fires
          exitCode =
            (error as any).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? 1
              : (child.exitCode ?? 1);
          if ((error as any).killed) {
            stderr = (stderr || "") + "\n[process killed: timeout exceeded]";
          }
        }
        resolve({
          stdout: truncate(stdout ?? "", MAX_OUTPUT_CHARS),
          stderr: truncate(stderr ?? "", MAX_OUTPUT_CHARS),
          exitCode
        });
      }
    );
  });
}

export class RunCodeTool extends Tool {
  readonly name = "run_code";
  readonly description =
    "Execute code in a subprocess. Supports javascript, typescript, python, and bash.";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["javascript", "typescript", "python", "bash"],
        description: "The language / runtime to use."
      },
      code: {
        type: "string",
        description: "Source code to execute."
      }
    },
    required: ["language", "code"]
  };

  private readonly timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    super();
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<RunCodeResult> {
    const language = params.language as Language;
    const code = params.code as string;

    if (!code || typeof code !== "string" || !code.trim()) {
      return { stdout: "", stderr: "No code provided.", exitCode: 1 };
    }

    const validLanguages: Language[] = [
      "javascript",
      "typescript",
      "python",
      "bash"
    ];
    if (!validLanguages.includes(language)) {
      return {
        stdout: "",
        stderr: `Unsupported language: ${language}`,
        exitCode: 1
      };
    }

    const { command, args } = this.buildCommand(language, code);
    return runSubprocess(command, args, this.timeoutMs);
  }

  userMessage(params: Record<string, unknown>): string {
    const lang = (params.language as string) ?? "code";
    const code = (params.code as string) ?? "";
    if (code.length > 0 && code.length < 50) {
      return `Executing ${lang}: '${code.slice(0, 40)}...'`;
    }
    return `Executing ${lang}...`;
  }

  private buildCommand(
    language: Language,
    code: string
  ): { command: string; args: string[] } {
    switch (language) {
      case "javascript":
        return { command: "node", args: ["-e", code] };
      case "typescript":
        return { command: "npx", args: ["tsx", "-e", code] };
      case "python":
        return { command: "python3", args: ["-c", code] };
      case "bash":
        return { command: "bash", args: ["-c", code] };
    }
  }
}
