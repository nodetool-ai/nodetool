import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HostBinaryMissingError,
  MAX_CAPTURED_BYTES,
  clampTimeoutSeconds,
  maxConcurrentHostBinaries,
  mimeFromFilename,
  runHostBinary
} from "../src/host-binaries.js";

describe("runHostBinary", () => {
  it("runs a PATH binary with argv and no shell", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const result = await runHostBinary(process.execPath, ["-e", ""], {
        cwd,
        timeoutMs: 5000
      });
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("stops capturing output at the cap instead of buying the whole stream", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      // Two megabytes of stderr — an ffmpeg -loglevel debug run, in miniature.
      const result = await runHostBinary(
        process.execPath,
        [
          "-e",
          "const line='x'.repeat(1024)+'\\n';" +
            "for (let i=0;i<2048;i++) process.stderr.write(line);"
        ],
        { cwd, timeoutMs: 30_000 }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr.length).toBe(MAX_CAPTURED_BYTES);
      expect(result.truncated).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("kills a run whose artifact passes the size cap", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const result = await runHostBinary(
        process.execPath,
        [
          "-e",
          "const fs=require('fs');const b=Buffer.alloc(64*1024,1);" +
            "const s=fs.createWriteStream('big.bin');" +
            "const t=setInterval(()=>s.write(b),5);" +
            "setTimeout(()=>{clearInterval(t);s.end();},30000);"
        ],
        {
          cwd,
          timeoutMs: 30_000,
          artifactPath: "big.bin",
          maxArtifactBytes: 256 * 1024
        }
      );
      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain("passed the");
      expect(result.stderr).toContain("output limit");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // Concurrency is measured from what the children themselves record, not from
  // wall-clock windows: each appends a line when it starts and another when it
  // stops, so the peak is a prefix sum over an ordered log and cannot be
  // distorted by a loaded machine's scheduling.
  const busyChild = (log: string, ms: number): string[] => [
    "-e",
    `const fs=require('fs');fs.appendFileSync(${JSON.stringify("LOGPATH")}` +
      `.replace('LOGPATH',${JSON.stringify(log)}),'S\\n');` +
      `setTimeout(()=>fs.appendFileSync(${JSON.stringify(log)},'E\\n'),${ms});`
  ];

  async function peakConcurrency(log: string): Promise<number> {
    const events = (await readFile(log, "utf8")).trim().split("\n");
    let live = 0;
    let peak = 0;
    for (const event of events) {
      live += event === "S" ? 1 : -1;
      peak = Math.max(peak, live);
    }
    return peak;
  }

  it("runs no more host binaries at once than the concurrency cap", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    const log = path.join(cwd, "events.log");
    const cap = maxConcurrentHostBinaries();
    try {
      await writeFile(log, "");
      await Promise.all(
        Array.from({ length: cap + 3 }, () =>
          runHostBinary(process.execPath, busyChild(log, 150), {
            cwd,
            timeoutMs: 30_000
          })
        )
      );
      expect(await peakConcurrency(log)).toBeLessThanOrEqual(cap);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  it("holds the cap when callers arrive while a slot is being handed over", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    const log = path.join(cwd, "events.log");
    const cap = maxConcurrentHostBinaries();
    try {
      await writeFile(log, "");
      // Callers keep arriving while the queue drains — the window in which a
      // released slot has been given up but the waiter it woke has not yet
      // taken it.
      const running = Array.from({ length: cap + 2 }, () =>
        runHostBinary(process.execPath, busyChild(log, 120), {
          cwd,
          timeoutMs: 30_000
        })
      );
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        running.push(
          runHostBinary(process.execPath, busyChild(log, 120), {
            cwd,
            timeoutMs: 30_000
          })
        );
      }
      await Promise.all(running);
      expect(await peakConcurrency(log)).toBeLessThanOrEqual(cap);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  it("names a missing binary", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      await expect(
        runHostBinary("nodetool-definitely-missing-binary", [], {
          cwd,
          timeoutMs: 2000
        })
      ).rejects.toBeInstanceOf(HostBinaryMissingError);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("runHostBinary abort signal", () => {
  it("kills a sleep child well before its timeout", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const controller = new AbortController();
      const started = Date.now();
      const pending = runHostBinary(
        process.execPath,
        [
          "-e",
          "require('fs').writeFileSync('pid.txt',String(process.pid));" +
            "setTimeout(()=>{},30000);"
        ],
        { cwd, timeoutMs: 30_000, signal: controller.signal }
      );
      setTimeout(() => controller.abort(), 300);
      await expect(pending).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(15_000);
      // The child itself is gone, not just the promise: its pid no longer
      // answers a signal once SIGTERM lands.
      const pid = Number(await readFile(path.join(cwd, "pid.txt"), "utf8"));
      const deadline = Date.now() + 5000;
      for (;;) {
        try {
          process.kill(pid, 0);
        } catch {
          break;
        }
        if (Date.now() > deadline) {
          throw new Error(`child ${pid} is still alive after abort`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("does not settle until a SIGTERM-ignoring child is actually gone", async () => {
    // A Cycles render that never handles SIGTERM keeps burning its core
    // until SIGKILL. The caller frees the concurrency slot and deletes the
    // scratch directory when this promise settles, so settling at the
    // signal would hand both to the next run while the child still lives.
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const controller = new AbortController();
      const started = Date.now();
      let settledAt = 0;
      const pending = runHostBinary(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>{});" +
            "require('fs').writeFileSync('pid.txt',String(process.pid));" +
            "setInterval(()=>{},1000);"
        ],
        { cwd, timeoutMs: 30_000, signal: controller.signal }
      ).then(
        () => {
          settledAt = Date.now();
          throw new Error("aborted run should reject");
        },
        (err: unknown) => {
          settledAt = Date.now();
          throw err;
        }
      );
      setTimeout(() => controller.abort(), 300);
      await expect(pending).rejects.toThrow();
      // SIGKILL lands five seconds after SIGTERM: settling any earlier
      // means the promise gave up while the child still ran.
      expect(settledAt - started).toBeGreaterThanOrEqual(4500);
      const pid = Number(await readFile(path.join(cwd, "pid.txt"), "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("never spawns when the signal is already aborted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const controller = new AbortController();
      controller.abort();
      let name = "";
      try {
        await runHostBinary(
          process.execPath,
          ["-e", "require('fs').writeFileSync('spawned.txt','x');"],
          { cwd, timeoutMs: 5000, signal: controller.signal }
        );
      } catch (err) {
        name = err instanceof Error ? err.name : "";
      }
      expect(name).toBe("AbortError");
      expect(existsSync(path.join(cwd, "spawned.txt"))).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("runHostBinary stderr lines and env", () => {
  it("calls onStderrLine once per complete line", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const lines: string[] = [];
      const result = await runHostBinary(
        process.execPath,
        [
          "-e",
          "process.stderr.write('alpha\\nbeta\\n');" +
            "process.stderr.write('gam' + 'ma\\npartial');"
        ],
        { cwd, timeoutMs: 5000, onStderrLine: (line) => lines.push(line) }
      );
      expect(result.exitCode).toBe(0);
      expect(lines).toEqual(["alpha", "beta", "gamma"]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("keeps feeding onStderrLine after the capture cap truncates", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const lines: string[] = [];
      const result = await runHostBinary(
        process.execPath,
        [
          "-e",
          "for(let i=0;i<3000;i++) process.stderr.write(" +
            "'L'+String(i).padStart(5,'0')+'_'+'y'.repeat(90)+'\\n');"
        ],
        { cwd, timeoutMs: 30_000, onStderrLine: (line) => lines.push(line) }
      );
      expect(result.exitCode).toBe(0);
      expect(result.truncated).toBe(true);
      expect(lines).toHaveLength(3000);
      expect(lines[0]).toBe(`L00000_${"y".repeat(90)}`);
      expect(lines[2999]).toBe(`L02999_${"y".repeat(90)}`);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("replaces process.env with env when env is set", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    const key = "NT_HOST_BIN_TEST_SECRET";
    process.env[key] = "s3cr3t";
    try {
      const probe = [
        "-e",
        `process.stdout.write(process.env[${JSON.stringify(key)}] ?? 'absent');`
      ];
      const inherited = await runHostBinary(process.execPath, probe, {
        cwd,
        timeoutMs: 5000
      });
      expect(inherited.stdout).toContain("s3cr3t");
      const scrubbed = await runHostBinary(process.execPath, probe, {
        cwd,
        timeoutMs: 5000,
        env: { PATH: process.env["PATH"] ?? "" }
      });
      expect(scrubbed.stdout).toBe("absent");
    } finally {
      delete process.env[key];
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

describe("runHostBinary concurrency classes", () => {
  const taggedChild = (log: string, tag: string, ms: number): string[] => [
    "-e",
    `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},` +
      `${JSON.stringify(`S${tag}\n`)});` +
      `setTimeout(()=>fs.appendFileSync(${JSON.stringify(log)},` +
      `${JSON.stringify(`E${tag}\n`)}),${ms});`
  ];

  async function readEvents(log: string): Promise<string[]> {
    const text = await readFile(log, "utf8");
    return text.trim().split("\n");
  }

  it("serializes two render runs under NODETOOL_BLENDER_CONCURRENCY=1", async () => {
    vi.stubEnv("NODETOOL_BLENDER_CONCURRENCY", "1");
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    const log = path.join(cwd, "render.log");
    try {
      await writeFile(log, "");
      await Promise.all([
        runHostBinary(process.execPath, taggedChild(log, "A", 600), {
          cwd,
          timeoutMs: 30_000,
          concurrencyClass: "render"
        }),
        runHostBinary(process.execPath, taggedChild(log, "B", 600), {
          cwd,
          timeoutMs: 30_000,
          concurrencyClass: "render"
        })
      ]);
      expect(await readEvents(log)).toEqual(["SA", "EA", "SB", "EB"]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("reports queue wait on queuedMs: zero uncontended, positive when queued", async () => {
    vi.stubEnv("NODETOOL_BLENDER_CONCURRENCY", "1");
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const first = runHostBinary(
        process.execPath,
        ["-e", "setTimeout(()=>{},800)"],
        { cwd, timeoutMs: 30_000, concurrencyClass: "render" }
      );
      // Wait until the first run holds the only slot, so the second queues.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const second = await runHostBinary(
        process.execPath,
        ["-e", ""],
        { cwd, timeoutMs: 30_000, concurrencyClass: "render" }
      );
      const firstResult = await first;
      expect(firstResult.queuedMs).toBe(0);
      expect(second.queuedMs).toBeGreaterThan(0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("a queued run aborts while waiting and never spawns", async () => {
    // A cancelled ExportModel queued behind a ten-minute render must not
    // wait for the render: the abort releases the queue position and the
    // child never spawns.
    vi.stubEnv("NODETOOL_BLENDER_CONCURRENCY", "1");
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const first = runHostBinary(
        process.execPath,
        ["-e", "setTimeout(()=>{},3000)"],
        { cwd, timeoutMs: 30_000, concurrencyClass: "render" }
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      const controller = new AbortController();
      const started = Date.now();
      const queued = runHostBinary(
        process.execPath,
        ["-e", "require('fs').writeFileSync('spawned-B.txt','x');"],
        { cwd, timeoutMs: 30_000, concurrencyClass: "render", signal: controller.signal }
      );
      setTimeout(() => controller.abort(), 300);
      await expect(queued).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(2000);
      expect(existsSync(path.join(cwd, "spawned-B.txt"))).toBe(false);
      await first;
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("timeoutMs covers the spawned run only, not the queue wait", async () => {
    // Deliberate semantics, pinned: the timer starts at spawn, so a run
    // queued behind a long render does not time out while waiting. The
    // queue wait is reported separately as queuedMs.
    vi.stubEnv("NODETOOL_BLENDER_CONCURRENCY", "1");
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    try {
      const first = runHostBinary(
        process.execPath,
        ["-e", "setTimeout(()=>{},1200)"],
        { cwd, timeoutMs: 30_000, concurrencyClass: "render" }
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      const second = await runHostBinary(process.execPath, ["-e", ""], {
        cwd,
        timeoutMs: 800,
        concurrencyClass: "render"
      });
      expect(second.exitCode).toBe(0);
      expect(second.queuedMs).toBeGreaterThan(0);
      await first;
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  it("starts a default-class run while a render run holds its slot", async () => {
    vi.stubEnv("NODETOOL_BLENDER_CONCURRENCY", "1");
    const cwd = await mkdtemp(path.join(tmpdir(), "nt-host-bin-"));
    const log = path.join(cwd, "mixed.log");
    try {
      await writeFile(log, "");
      const render = runHostBinary(process.execPath, taggedChild(log, "R", 1500), {
        cwd,
        timeoutMs: 30_000,
        concurrencyClass: "render"
      });
      // Wait until the render child actually started before launching the
      // default-class run, so the log order below is deterministic.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const text = await readFile(log, "utf8");
        if (text.includes("SR")) break;
        if (Date.now() > deadline) {
          throw new Error("render child never started");
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await runHostBinary(process.execPath, taggedChild(log, "D", 50), {
        cwd,
        timeoutMs: 30_000
      });
      await render;
      expect(await readEvents(log)).toEqual(["SR", "SD", "ED", "ER"]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("mimeFromFilename / clampTimeoutSeconds", () => {
  it("maps common media extensions", () => {
    expect(mimeFromFilename("clip.mp4")).toBe("video/mp4");
    expect(mimeFromFilename("a.WAV")).toBe("audio/wav");
    expect(mimeFromFilename("x.bin")).toBe("application/octet-stream");
  });

  it("clamps timeouts", () => {
    expect(clampTimeoutSeconds(undefined, 180, 600)).toBe(180);
    expect(clampTimeoutSeconds(10, 180, 600)).toBe(10);
    expect(clampTimeoutSeconds(9999, 180, 600)).toBe(600);
    expect(clampTimeoutSeconds(-1, 180, 600)).toBe(180);
  });

  // A guest asking for 0.5 used to get 0, which `runHostBinary` turns into
  // `setTimeout(kill, 0)` — the child dies on the next tick.
  it("floors a sub-second timeout to one second, never to zero", () => {
    expect(clampTimeoutSeconds(0.5, 180, 600)).toBe(1);
    expect(clampTimeoutSeconds(0.999999, 180, 600)).toBe(1);
    expect(clampTimeoutSeconds(Number.MIN_VALUE, 300, 900)).toBe(1);
  });

  it.each([
    // Not a number at all -> the caller's default.
    [undefined, 180],
    [null, 180],
    ["10", 180],
    [true, 180],
    [{}, 180],
    [[10], 180],
    // A number with no usable magnitude -> the caller's default.
    [Number.NaN, 180],
    [Number.POSITIVE_INFINITY, 180],
    [Number.NEGATIVE_INFINITY, 180],
    // Zero and below -> the caller's default.
    [-1000, 180],
    [-1.5, 180],
    [-0, 180],
    [0, 180],
    // Positive: truncated down, floored at one second.
    [Number.MIN_VALUE, 1],
    [0.4, 1],
    [0.9, 1],
    [1, 1],
    [1.9, 1],
    [2, 2],
    [59.9, 59],
    [180.5, 180],
    // At and past the ceiling.
    [599.9, 599],
    [600, 600],
    [600.1, 600],
    [9999, 600],
    [Number.MAX_SAFE_INTEGER, 600],
    [Number.MAX_VALUE, 600]
  ])("clampTimeoutSeconds(%s, 180, 600) === %s", (raw, expected) => {
    expect(clampTimeoutSeconds(raw, 180, 600)).toBe(expected);
  });
});
