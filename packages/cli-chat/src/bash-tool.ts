import { spawn } from "node:child_process";
import { z } from "zod";
import { Tool } from "@nodetool-ai/agents";
import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";

const MAX_OUTPUT_BYTES = 32_768;
const MAX_TIMEOUT_MS = 120_000;

/** Local interactive chat only. Never register this in the shared agent belt. */
export class BashTool extends Tool {
  readonly name = "bash";
  readonly description =
    "Run a bash command on the CLI host in the chat workspace. Commands can " +
    "access the host filesystem and network; this is not a sandbox. " +
    "Use only for commands the user requested. Output is truncated to 32 KiB.";
  protected override readonly jsonSchema: JsonSchema = {
    type: "object",
    properties: {
      command: { type: "string", description: "Bash command to run." },
      timeout_ms: {
        type: "integer",
        description: "Maximum duration in milliseconds (default 30000, maximum 120000)."
      }
    },
    required: ["command"]
  };

  constructor(private readonly cwd: string) {
    super();
  }

  override userMessage(params: Record<string, unknown>): string {
    return `Running bash: ${String(params["command"] ?? "")}`;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const { command, timeout_ms = 30_000 } = z.object({
      command: z.string().trim().min(1),
      timeout_ms: z.number().int().min(1).max(MAX_TIMEOUT_MS).optional()
    }).parse(params);
    return new Promise((resolve, reject) => {
      const child = spawn("bash", ["-lc", command], {
        cwd: this.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32"
      });
      let stdout = "";
      let stderr = "";
      let captured = 0;
      let truncated = false;
      let timedOut = false;
      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        const remaining = MAX_OUTPUT_BYTES - captured;
        const part = chunk.subarray(0, Math.max(0, remaining));
        captured += part.length;
        if (part.length < chunk.length) truncated = true;
        if (target === "stdout") stdout += part.toString("utf8");
        else stderr += part.toString("utf8");
      };
      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      const timer = setTimeout(() => {
        timedOut = true;
        // Kill the process group so a command's descendants cannot outlive the timeout.
        if (process.platform !== "win32" && child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        } else child.kill("SIGKILL");
      }, timeout_ms);
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exit_code: exitCode, signal, timed_out: timedOut, truncated });
      });
    });
  }
}
