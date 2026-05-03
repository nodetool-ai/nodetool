/**
 * Code execution tool — runs JavaScript in a QuickJS sandbox.
 *
 * Only JavaScript is supported. TypeScript, Python, and Bash have been
 * removed for security (no subprocess spawning).
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import { runInSandbox } from "../js-sandbox.js";

const DEFAULT_TIMEOUT_MS = 30_000;

interface RunCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export class RunCodeTool extends Tool {
  readonly name = "run_code";
  readonly description =
    "Execute JavaScript code in a sandboxed QuickJS environment. Only javascript is supported.";
  readonly inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["javascript"],
        description: "The language to use. Only 'javascript' is supported."
      },
      code: {
        type: "string",
        description: "JavaScript source code to execute."
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
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<RunCodeResult> {
    const language = params.language as string;
    const code = params.code as string;

    if (!code || typeof code !== "string" || !code.trim()) {
      return { stdout: "", stderr: "No code provided.", exitCode: 1 };
    }

    if (language !== "javascript") {
      return {
        stdout: "",
        stderr: `Unsupported language: ${language}. Only 'javascript' is supported.`,
        exitCode: 1
      };
    }

    const result = await runInSandbox({
      code,
      context,
      timeoutMs: this.timeoutMs
    });

    const logs = result.logs?.join("\n") ?? "";

    if (result.success) {
      const output =
        result.result !== undefined && result.result !== null
          ? typeof result.result === "string"
            ? result.result
            : JSON.stringify(result.result, null, 2)
          : "";
      const stdout = logs ? `${logs}\n${output}`.trim() : output;
      return { stdout, stderr: "", exitCode: 0 };
    }

    const errorParts: string[] = [];
    if (logs) errorParts.push(logs);
    if (result.error) errorParts.push(result.error);
    if (result.stack) errorParts.push(result.stack);

    return {
      stdout: "",
      stderr: errorParts.join("\n").trim(),
      exitCode: 1
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const code = (params.code as string) ?? "";
    if (code.length > 0 && code.length < 50) {
      return `Executing javascript: '${code.slice(0, 40)}...'`;
    }
    return "Executing javascript...";
  }
}
