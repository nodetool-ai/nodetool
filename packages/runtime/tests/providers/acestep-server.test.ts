/**
 * Supervision of the local ace-server (MUSIC-MODE.md 12.3), with the fake
 * ace-server running as a real child process (acestep-fake-server-bin.mjs).
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { createConnection } from "node:net";
import { getPriority, networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AceStepProvider } from "../../src/providers/acestep-provider.js";
import { ACESTEP_TURBO_DIT } from "../../src/providers/acestep-models.js";
import {
  ACESTEP_IDLE_SHUTDOWN_MS,
  AceServerSupervisor,
  type AceServerTimer
} from "../../src/providers/acestep-server.js";
import type { MusicTaskParams } from "../../src/providers/types.js";

const BIN = fileURLToPath(new URL("./acestep-fake-server-bin.mjs", import.meta.url));

const task: MusicTaskParams = {
  task: "text2music",
  model: ACESTEP_TURBO_DIT,
  caption: "dusty breakbeat",
  bpm: 96,
  timeSignature: 4,
  durationSec: 12,
  seed: 3,
  candidates: 2
};

let dir: string;
let argsLog: string;
let crashFile: string;
let supervisors: AceServerSupervisor[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "acestep-supervision-"));
  argsLog = join(dir, "args.jsonl");
  crashFile = join(dir, "crashes");
  writeFileSync(crashFile, "0");
  mkdirSync(join(dir, "models"));
  writeFileSync(join(dir, "models", ACESTEP_TURBO_DIT), "");
  supervisors = [];
});

afterEach(async () => {
  await Promise.all(supervisors.map((supervisor) => supervisor.stop()));
  rmSync(dir, { recursive: true, force: true });
});

/**
 * A launcher that runs the fake with the Node binary running this test, with
 * the controls in its environment.
 */
function launcher(): string {
  const path = join(dir, "ace-server");
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      `export FAKE_ACE_ARGS_LOG='${argsLog}'`,
      `export FAKE_ACE_CRASH_FILE='${crashFile}'`,
      "export FAKE_ACE_JOB_MS=60",
      `exec '${process.execPath}' '${BIN}' "$@"`
    ].join("\n")
  );
  chmodSync(path, 0o755);
  return path;
}

function launches(): string[][] {
  return readFileSync(argsLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

function setup(options: ConstructorParameters<typeof AceServerSupervisor>[0] = {}) {
  const supervisor = new AceServerSupervisor(options);
  supervisors.push(supervisor);
  const binary = launcher();
  const provider = new AceStepProvider(
    {},
    {
      supervisor,
      pollIntervalMs: 10,
      locateInstall: async () => ({ binary, modelsDir: join(dir, "models") })
    }
  );
  return { supervisor, provider };
}

async function exitOf(pid: number, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`process ${pid} still runs`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe.skipIf(process.platform === "win32")("ace-server supervision", () => {
  it("binds the child to 127.0.0.1 on a picked port at lowered priority (MM6 exit 5, PF-3)", async () => {
    const { supervisor, provider } = setup();
    await provider.musicTask(task);

    const [args] = launches();
    expect(args).toEqual([
      "--models",
      join(dir, "models"),
      "--host",
      "127.0.0.1",
      "--port",
      expect.stringMatching(/^\d+$/),
      "--max-batch",
      "4"
    ]);
    const server = supervisor.current();
    expect(server?.baseUrl).toBe(`http://127.0.0.1:${args![5]}`);
    expect(getPriority(server!.pid!)).toBeGreaterThanOrEqual(10);

    // A connection from a non-loopback address of this machine is refused.
    const external = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry && entry.family === "IPv4" && !entry.internal);
    if (external) {
      const refused = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host: external.address, port: Number(args![5]) });
        socket.once("connect", () => {
          socket.destroy();
          resolve(false);
        });
        socket.once("error", () => resolve(true));
      });
      expect(refused).toBe(true);
    }
  });

  it("passes --keep-loaded only when the setting allows it", async () => {
    const supervisor = new AceServerSupervisor();
    supervisors.push(supervisor);
    const binary = launcher();
    const provider = new AceStepProvider(
      { ACESTEP_KEEP_LOADED: "true" },
      { supervisor, pollIntervalMs: 10, locateInstall: async () => ({ binary, modelsDir: join(dir, "models") }) }
    );
    await provider.musicTask({ ...task, candidates: 1 });
    expect(launches()[0]).toContain("--keep-loaded");
  });

  it("restarts the process and resubmits once when it dies during a job (MM6 exit 2)", async () => {
    const { supervisor, provider } = setup();
    writeFileSync(crashFile, "1");
    const result = await provider.musicTask(task);

    expect(result.candidates.map((candidate) => candidate.seed)).toEqual([3, 4]);
    expect(launches()).toHaveLength(2);
    expect(supervisor.current()?.generation).toBe(2);
    expect(readFileSync(crashFile, "utf8")).toBe("0");
  });

  it("fails with the log tail when the process dies a second time (MM6 exit 2)", async () => {
    const { provider } = setup();
    writeFileSync(crashFile, "2");
    const error = await provider.musicTask(task).then(
      () => null,
      (reason: unknown) => reason as Error
    );

    expect(error?.message).toMatch(/ace-server lost the synth job twice/);
    expect(error?.message).toContain("[Server] FATAL: simulated GGML abort");
    expect(launches()).toHaveLength(2);
  });

  it("exits after the idle timeout and starts again for the next job (MM6 exit 6)", async () => {
    const timers: Array<{ callback: () => void; ms: number; cancelled: boolean }> = [];
    const schedule = (callback: () => void, ms: number): AceServerTimer => {
      const timer = { callback, ms, cancelled: false };
      timers.push(timer);
      return { cancel: () => void (timer.cancelled = true) };
    };
    const { supervisor, provider } = setup({ schedule });

    await provider.musicTask(task);
    const first = supervisor.current();
    expect(first).not.toBeNull();
    const pending = timers.filter((timer) => !timer.cancelled);
    expect(pending.map((timer) => timer.ms)).toEqual([ACESTEP_IDLE_SHUTDOWN_MS]);
    expect(ACESTEP_IDLE_SHUTDOWN_MS).toBe(10 * 60 * 1000);

    pending[0]!.callback();
    await exitOf(first!.pid!);
    expect(supervisor.current()).toBeNull();

    await provider.musicTask(task);
    expect(launches()).toHaveLength(2);
    expect(supervisor.current()?.generation).toBe(2);
    expect(supervisor.current()?.pid).not.toBe(first!.pid);
  });

  it("does not exit while a job holds the server", async () => {
    const timers: Array<{ callback: () => void; cancelled: boolean }> = [];
    const schedule = (callback: () => void): AceServerTimer => {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return { cancel: () => void (timer.cancelled = true) };
    };
    const { supervisor, provider } = setup({ schedule });
    await provider.musicTask({ ...task, candidates: 1 });
    const second = provider.musicTask({ ...task, candidates: 1 });
    // The idle timer of the first job is cancelled when the second holds the server.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(timers[0]!.cancelled).toBe(true);
    await second;
    expect(launches()).toHaveLength(1);
    expect(supervisor.current()).not.toBeNull();
  });

  it("names the missing install", async () => {
    const supervisor = new AceServerSupervisor();
    supervisors.push(supervisor);
    const provider = new AceStepProvider(
      {},
      { supervisor, locateInstall: async () => ({ binary: null, modelsDir: null }) }
    );
    expect(await provider.unavailableReason()).toMatch(/ace-server is not installed/);
    await expect(provider.musicTask(task)).rejects.toThrow(/ace-server is not installed/);
  });
});
