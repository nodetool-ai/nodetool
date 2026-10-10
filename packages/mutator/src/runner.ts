/** Run a test command with a timeout, killing its whole process group. */

import { spawn } from "node:child_process";

export interface CommandResult {
  code: number;
  timedOut: boolean;
  seconds: number;
  output: string;
}

export interface CommandRunner {
  verbose: boolean;
  run(command: string, cwd: string, timeoutSeconds: number | null): Promise<CommandResult>;
}

const OUTPUT_LIMIT = 64 * 1024;

export class ShellRunner implements CommandRunner {
  constructor(
    public readonly verbose = false,
    private readonly env: NodeJS.ProcessEnv = process.env
  ) {}

  run(command: string, cwd: string, timeoutSeconds: number | null): Promise<CommandResult> {
    if (this.verbose) {
      process.stderr.write(`$ (cd ${cwd} && ${command})\n`);
    }
    const started = performance.now();
    return new Promise((resolvePromise) => {
      const child = spawn(command, {
        cwd,
        shell: true,
        detached: process.platform !== "win32",
        env: { ...this.env, CI: this.env.CI ?? "true", FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString("utf8")).slice(-OUTPUT_LIMIT);
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      let timedOut = false;
      const timer =
        timeoutSeconds === null
          ? null
          : setTimeout(() => {
              timedOut = true;
              killGroup(child.pid);
            }, timeoutSeconds * 1000);
      const finish = (code: number) => {
        if (timer) {
          clearTimeout(timer);
        }
        // A test runner can leave workers behind after its main process exits.
        killGroup(child.pid);
        resolvePromise({ code, timedOut, seconds: (performance.now() - started) / 1000, output });
      };
      child.once("error", (error) => {
        output += String(error);
        finish(127);
      });
      child.once("close", (code, signal) => finish(code ?? (signal ? 128 : 1)));
    });
  }
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
  } catch {
    // The group has already exited.
  }
}
