/** Run a test command with a timeout, killing its whole process group. */

import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

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
        shell: process.platform === "win32"
          ? this.env.NODETOOL_BASH ?? join(this.env.ProgramFiles ?? "C:/Program Files", "Git", "bin", "bash.exe")
          : true,
        windowsHide: true,
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
      let finished = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let exitCode: number | undefined;
      const timer =
        timeoutSeconds === null
          ? null
          : setTimeout(() => {
              timedOut = true;
              killGroup(child.pid);
              // A detached descendant may keep these pipes open after the
              // group is killed. It is outside the group and may outlive us.
              child.stdout.destroy();
              child.stderr.destroy();
              deadline = setTimeout(() => finish(128), 1000);
            }, timeoutSeconds * 1000);
      const finish = (code: number) => {
        if (finished) return;
        finished = true;
        if (timer) {
          clearTimeout(timer);
        }
        if (deadline) clearTimeout(deadline);
        // A test runner can leave workers behind after its main process exits.
        killGroup(child.pid);
        resolvePromise({ code, timedOut, seconds: (performance.now() - started) / 1000, output });
      };
      child.once("error", (error) => {
        output += String(error);
        finish(127);
      });
      child.once("exit", (code, signal) => {
        exitCode = code ?? (signal ? 128 : 1);
        if (timer) clearTimeout(timer);
        killGroup(child.pid);
        if (timedOut) {
          finish(exitCode);
        } else {
          deadline = setTimeout(() => {
            child.stdout.destroy();
            child.stderr.destroy();
            finish(exitCode!);
          }, 1000);
        }
      });
      child.once("close", (code, signal) => finish(exitCode ?? code ?? (signal ? 128 : 1)));
    });
  }
}

function killGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group has already exited.
  }
}
