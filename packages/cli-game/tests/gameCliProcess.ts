import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { killProcessTree } from "../../../scripts/child-shutdown.mjs";
import { childExitCode } from "@nodetool-ai/pack-manager/child-exit";

interface GameCliOptions {
  readonly signal: AbortSignal;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly entry?: string;
  readonly maxOutputBytes?: number;
}

export interface GameCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const active = new Set<{ stop(): void; readonly closed: Promise<void> }>();
const cli = fileURLToPath(new URL("../dist/nodetool.js", import.meta.url));
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function descendants(pid: number): { pid: number; group: number }[] {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid=,pgid="], { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 1000 });
  const children = new Map<number, { pid: number; group: number }[]>();
  for (const row of rows.trim().split("\n")) {
    const [child, parent, group] = row.trim().split(/\s+/).map(Number);
    const list = children.get(parent) ?? [];
    list.push({ pid: child, group });
    children.set(parent, list);
  }
  const pending = [pid];
  const owned: { pid: number; group: number }[] = [];
  for (let index = 0; index < pending.length; index += 1) {
    for (const child of children.get(pending[index]) ?? []) { owned.push(child); pending.push(child.pid); }
  }
  return owned.reverse();
}

/** Run the built CLI without inheriting the test worker's heap or clock mocks. */
export function runGameCli(args: readonly string[], options: GameCliOptions): Promise<GameCliResult> {
  options.signal.throwIfAborted();
  const child = spawn(process.execPath, [options.entry ?? cli, ...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const maximum = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let bytes = 0;
  let failure: unknown;
  let finish: () => void = () => {};
  const closed = new Promise<void>((resolve) => { finish = resolve; });
  const stop = (): void => {
    if (child.pid === undefined) { return; }
    const kill = (pid: number): void => {
      try { process.kill(pid, "SIGKILL"); } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") { failure ??= error; }
      }
    };
    if (process.platform !== "win32") {
      try {
        // Playwright starts Chromium in a separate group. Capture ancestry before killing its CLI parent.
        for (const owned of descendants(child.pid)) {
          if (owned.group === owned.pid) { kill(-owned.pid); }
          kill(owned.pid);
        }
      } catch (error) { failure ??= error; }
    }
    try { killProcessTree(child.pid); } catch (error) { failure ??= error; }
    if (process.platform !== "win32") {
      try { process.kill(-child.pid, "SIGKILL"); } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
          failure ??= error;
          try { child.kill("SIGKILL"); } catch (error) { failure ??= error; }
        }
      }
    }
  };
  const owned = { stop, closed };
  active.add(owned);
  const abort = (): void => {
    failure ??= options.signal.reason;
    stop();
  };
  options.signal.addEventListener("abort", abort, { once: true });
  if (options.signal.aborted) { abort(); }
  return new Promise<GameCliResult>((resolve, reject) => {
    const collect = (target: Buffer[], chunk: Buffer): void => {
      const available = maximum - bytes;
      if (available > 0) { target.push(chunk.subarray(0, available)); }
      bytes += chunk.length;
      if (bytes > maximum) {
        failure ??= new Error(`Game CLI output exceeds ${maximum} bytes`);
        stop();
      }
    };
    child.stdout.on("data", (chunk: Buffer) => { collect(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { collect(stderr, chunk); });
    child.once("error", (error) => { failure ??= error; });
    // Stop remaining members of the CLI process group when its leader exits.
    child.once("exit", stop);
    child.once("close", (status, signal) => {
      options.signal.removeEventListener("abort", abort);
      active.delete(owned);
      finish();
      if (failure !== undefined) { reject(failure); return; }
      resolve({ exitCode: childExitCode({ status, signal, error: undefined }),
        stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

/** Await owned child shutdown before a test removes its temporary files. */
export async function cleanupGameCliProcesses(): Promise<void> {
  const pending = [...active];
  for (const process of pending) { process.stop(); }
  await Promise.all(pending.map((process) => process.closed));
}
