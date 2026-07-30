/**
 * Spawns the real `nodetool` CLI against the checked-out source, via `tsx` —
 * the same door a user gets (`npm run dev:nodetool -- <args>`), shared by
 * `cli.ts` and `app-headless.ts`. No compiled `dist/` dependency, so it works
 * in the same tree `npm run dev` does.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { findRepoRoot, resolveTsxBin } from "./repo-root.js";

export interface CliRunResult {
  code: number;
  stdout: string;
  stderr: string;
  repoRoot: string;
}

export async function spawnNodetoolCli(
  args: string[],
  timeoutMs: number
): Promise<CliRunResult> {
  const repoRoot = findRepoRoot();
  const tsxBin = resolveTsxBin(repoRoot);
  const nodetoolEntry = join(repoRoot, "packages", "cli", "src", "nodetool.ts");

  return new Promise<CliRunResult>((resolvePromise) => {
    const child = spawn(tsxBin, [nodetoolEntry, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (buf: Buffer) => (stdout += buf.toString()));
    child.stderr.on("data", (buf: Buffer) => (stderr += buf.toString()));

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr, repoRoot });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ code: 127, stdout, stderr: stderr + String(err), repoRoot });
    });
  });
}
