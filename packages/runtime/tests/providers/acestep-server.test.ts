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
import { ACESTEP_BASE_DIT, ACESTEP_TURBO_DIT } from "../../src/providers/acestep-models.js";
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

const FIRST_RUN_MODELS = ["Qwen3-Embedding-0.6B-Q8_0.gguf", "acestep-5Hz-lm-4B-Q8_0.gguf", ACESTEP_TURBO_DIT, "vae-BF16.gguf"];

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
  // The first-run set: the fake registry knows models by file name.
  for (const name of FIRST_RUN_MODELS) {
    writeFileSync(join(dir, "models", name), "gguf");
  }
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
function launcher(options: { jobMs?: number; startDelayMs?: number } = {}): string {
  const path = join(dir, "ace-server");
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      `export FAKE_ACE_ARGS_LOG='${argsLog}'`,
      `export FAKE_ACE_CRASH_FILE='${crashFile}'`,
      `export FAKE_ACE_JOB_MS=${options.jobMs ?? 60}`,
      `export FAKE_ACE_START_DELAY_MS=${options.startDelayMs ?? 0}`,
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

/** A 48 kHz stereo float WAV of `frames` silent frames. */
function floatWav(frames: number): Uint8Array {
  const data = frames * 8;
  const out = Buffer.alloc(44 + data);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + data, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(3, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(48000, 24);
  out.writeUInt32LE(48000 * 8, 28);
  out.writeUInt16LE(8, 32);
  out.writeUInt16LE(32, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(data, 40);
  return new Uint8Array(out);
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

  it("restarts the idle process when a model file arrives, so the new model is found (F1)", async () => {
    // ace-server scans --models once at startup (ace-server.cpp:1706-1711).
    const { provider } = setup();
    const lego: MusicTaskParams = {
      ...task,
      task: "lego",
      trackRole: "bass",
      candidates: 1,
      sourceAudio: floatWav(9600),
      regionStartSec: 0,
      regionEndSec: 0.2
    };
    const missing = await provider.musicTask(lego).then(
      () => null,
      (reason: unknown) => reason as Error
    );
    expect(missing?.message).toContain(`DiT not found: ${ACESTEP_BASE_DIT}`);

    // The base DiT is downloaded while the process runs (first Add instrument).
    writeFileSync(join(dir, "models", ACESTEP_BASE_DIT), "gguf");
    const result = await provider.musicTask(lego);
    expect(result.candidates).toHaveLength(1);
    expect(launches()).toHaveLength(2);
  });

  it("kills a process that is still finishing a job after the stop timeout (item 5)", async () => {
    // On SIGTERM ace-server finishes its current job before it exits
    // (ace-server.cpp:137-141, 1891-1897).
    const supervisor = new AceServerSupervisor({ stopTimeoutMs: 200 });
    supervisors.push(supervisor);
    const server = await supervisor.ensure({ binary: launcher({ jobMs: 600_000 }), modelsDir: join(dir, "models") });
    const submitted = await fetch(`${server.baseUrl}/synth`, {
      method: "POST",
      body: JSON.stringify({ caption: "x", synth_model: ACESTEP_TURBO_DIT, duration: 1 })
    });
    expect(submitted.ok).toBe(true);
    const stoppedAt = Date.now();
    await supervisor.stop();
    expect(Date.now() - stoppedAt).toBeLessThan(3000);
    await exitOf(server.pid!, 100);
  });

  it("kills the process at once from the exit hook, even with a job running (item 5)", async () => {
    const supervisor = new AceServerSupervisor();
    supervisors.push(supervisor);
    const server = await supervisor.ensure({ binary: launcher({ jobMs: 600_000 }), modelsDir: join(dir, "models") });
    await fetch(`${server.baseUrl}/synth`, {
      method: "POST",
      body: JSON.stringify({ caption: "x", synth_model: ACESTEP_TURBO_DIT, duration: 1 })
    });
    supervisor.killNow();
    await exitOf(server.pid!, 2000);
  });

  it("hands a second caller the process only once it answers /health (item 6)", async () => {
    const supervisor = new AceServerSupervisor();
    supervisors.push(supervisor);
    const launch = { binary: launcher({ startDelayMs: 600 }), modelsDir: join(dir, "models") };
    const first = supervisor.ensure(launch);
    // Let the first call spawn the child, then ask again while it scans.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(supervisor.current()).toBeNull();
    const second = await supervisor.ensure(launch);
    const health = await fetch(`${second.baseUrl}/health`).then(
      (response) => response.status,
      () => "refused"
    );
    expect(health).toBe(200);
    expect((await first).pid).toBe(second.pid);
    expect(launches()).toHaveLength(1);
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
