import { chmodSync, copyFileSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlenderJob } from "../src/job.js";
import { BLENDER_JOB_VERSION } from "../src/job.js";
import { BlenderJobError, LocalBlenderRunner } from "../src/runner.js";

const FAKE_SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "helpers",
  "fake-blender.mjs"
);

function baseParams() {
  return {
    camera_mode: "orbit" as const,
    azimuth: 45,
    elevation: 25,
    fov: 35,
    zoom: 1,
    lighting: "studio" as const,
    light_intensity: 1,
    background_color: "#ffffff",
    transparent: false,
    engine: "eevee" as const,
    samples: 16,
    denoise: true,
    resolution_percentage: 100,
    width: 64,
    height: 64
  };
}

function imageJob(outputs: Record<string, string> = { image: "render.png" }): BlenderJob {
  return {
    version: BLENDER_JOB_VERSION,
    inputs: { model: "model.glb" },
    outputs,
    job: { op: "render_image", params: baseParams() }
  };
}

function animationJob(): BlenderJob {
  return {
    version: BLENDER_JOB_VERSION,
    inputs: { model: "model.glb" },
    outputs: { video: "anim.mp4" },
    job: {
      op: "render_animation",
      params: { ...baseParams(), frame_start: 1, frame_end: 3, fps: 24, orbit_degrees: 90 }
    }
  };
}

describe("LocalBlenderRunner against a fake blender", () => {
  let savedBlenderPath: string | undefined;
  let scratchParent: string;
  let binDir: string;

  beforeEach(async () => {
    savedBlenderPath = process.env["BLENDER_PATH"];
    scratchParent = await mkdtemp(path.join(os.tmpdir(), "blender-test-scratch-"));
    binDir = await mkdtemp(path.join(os.tmpdir(), "blender-test-bin-"));
  });

  afterEach(async () => {
    if (savedBlenderPath === undefined) delete process.env["BLENDER_PATH"];
    else process.env["BLENDER_PATH"] = savedBlenderPath;
    await rm(scratchParent, { recursive: true, force: true });
    await rm(binDir, { recursive: true, force: true });
  });

  /** Copy the fake to `fake-<mode>.mjs` and point BLENDER_PATH at it. */
  function useFake(mode: string): LocalBlenderRunner {
    const target = path.join(binDir, `fake-${mode}.mjs`);
    copyFileSync(FAKE_SOURCE, target);
    chmodSync(target, 0o755);
    process.env["BLENDER_PATH"] = target;
    return new LocalBlenderRunner({ scratchParent });
  }

  async function expectScratchGone(): Promise<void> {
    expect(await readdir(scratchParent)).toEqual([]);
  }

  /**
   * Wait until the run owns its scratch directory and the fake inside it
   * reports its spawn with a `started` marker. Polls instead of sleeping a
   * guessed interval, so the wait holds under load. Fails loudly when the
   * run settles first (an abort or timeout before the spawn).
   */
  async function waitForSpawnMarker(
    parent: string,
    isSettled: () => boolean
  ): Promise<void> {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const entries = await readdir(parent);
      if (entries.length === 1) {
        try {
          await stat(path.join(parent, entries[0]!, "started"));
          return;
        } catch {
          // The run owns its directory but the child is not up yet.
        }
      }
      if (isSettled()) {
        throw new Error("the blender run settled before the fake reported its spawn");
      }
      if (Date.now() > deadline) {
        throw new Error("timed out waiting for the fake blender to spawn");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  it("exit 64 with no result.json -> bad_result carrying the stderr tail", async () => {
    const runner = useFake("exit64-empty");
    const err = await runner
      .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 10000 })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("bad_result");
    expect((err as Error).message).toContain("Traceback");
    await expectScratchGone();
  });

  it("ok:false result -> BlenderJobError with the op code", async () => {
    const runner = useFake("import-failed");
    const err = await runner
      .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 10000 })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("import_failed");
    expect((err as Error).message).toContain("unsupported extension");
    await expectScratchGone();
  });

  it("a run that never exits -> timeout", async () => {
    const runner = useFake("hang");
    const err = await runner
      .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 1000 })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    expect((err as Error).message).toContain("1000");
    await expectScratchGone();
  });

  it("abort mid-run rejects with the abort reason and cleans up", async () => {
    const runner = useFake("hang");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const err = await runner
      .run(
        imageJob(),
        { model: new Uint8Array([1]) },
        { timeoutMs: 30000, signal: controller.signal }
      )
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).not.toBeNull();
    expect(err).not.toBeInstanceOf(BlenderJobError);
    expect(controller.signal.aborted).toBe(true);
    await expectScratchGone();
  });

  it("abort keeps the scratch directory until the SIGTERM-ignoring child dies", async () => {
    // The runner frees nothing when the signal fires: the promise settles
    // on the child's close, so the scratch directory still exists while a
    // child that ignores SIGTERM runs on toward SIGKILL.
    //
    // The abort fires only after the fake reports its spawn (a `started`
    // marker in the run directory). A fixed delay races the `--version`
    // probe and the spawn: under load the run has not started when the
    // timer fires, the run rejects without spawning, and the scratch
    // directory is already gone.
    const runner = useFake("ignore-term");
    const controller = new AbortController();
    let settled = false;
    const pending = runner
      .run(
        imageJob(),
        { model: new Uint8Array([1]) },
        { timeoutMs: 30000, signal: controller.signal }
      )
      .then(
        () => null,
        (e: unknown) => e
      )
      .finally(() => {
        settled = true;
      });
    await waitForSpawnMarker(scratchParent, () => settled);
    controller.abort();
    expect(await readdir(scratchParent)).toHaveLength(1);
    const err = await pending;
    expect(err).not.toBeNull();
    expect(err).not.toBeInstanceOf(BlenderJobError);
    await expectScratchGone();
  }, 30_000);

  it("a segfault surfaces the crash log Blender wrote to its temp directory", async () => {
    // Blender writes <name>.crash.txt into its temp directory ($TMPDIR),
    // never into the run's cwd: the "Crash log:" suffix needs that path.
    // The temp directory is unique per test: a fixed file name under the
    // shared $TMPDIR collides when suites run concurrently, and one run
    // deletes the other's file.
    const crashDir = await mkdtemp(path.join(os.tmpdir(), "blender-test-crash-"));
    const savedTmpdir = process.env["TMPDIR"];
    process.env["TMPDIR"] = crashDir;
    try {
      const runner = useFake("crash");
      const err = await runner
        .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 10000 })
        .then(
          () => null,
          (e: unknown) => e
        );
      expect(err).toBeInstanceOf(BlenderJobError);
      expect((err as BlenderJobError).code).toBe("bad_result");
      expect((err as Error).message).toContain("Crash log:");
      expect((err as Error).message).toContain("segfault in render pipeline");
      await expectScratchGone();
    } finally {
      if (savedTmpdir === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = savedTmpdir;
      await rm(crashDir, { recursive: true, force: true });
    }
  });

  it("ignores a pre-existing crash log from an earlier run", async () => {
    // A `blender.crash.txt` left by the user's own interactive Blender, or
    // by an earlier run on a shared server, predates this run and belongs
    // to somebody else's failure. The run below writes no crash log of its
    // own (exit64-empty), so the stale file must not reach the message.
    const crashDir = await mkdtemp(path.join(os.tmpdir(), "blender-test-crash-"));
    const savedTmpdir = process.env["TMPDIR"];
    process.env["TMPDIR"] = crashDir;
    try {
      const stale = path.join(crashDir, "blender.crash.txt");
      writeFileSync(stale, "yesterday's segfault (stale)\n");
      const hourAgo = (Date.now() - 3_600_000) / 1000;
      utimesSync(stale, hourAgo, hourAgo);
      const runner = useFake("exit64-empty");
      const err = await runner
        .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 10000 })
        .then(
          () => null,
          (e: unknown) => e
        );
      expect(err).toBeInstanceOf(BlenderJobError);
      expect((err as BlenderJobError).code).toBe("bad_result");
      expect((err as Error).message).not.toContain("Crash log:");
      expect((err as Error).message).not.toContain("stale");
      await expectScratchGone();
    } finally {
      if (savedTmpdir === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = savedTmpdir;
      await rm(crashDir, { recursive: true, force: true });
    }
  });

  it("prefers the run's own crash log over an alphabetically-first stale one", async () => {
    // The stale file sorts first (`a-old` < `blender`), so a reader that
    // takes the alphabetically first `*.crash.txt` attaches the wrong
    // failure. The mtime bound must skip it and surface this run's log.
    const crashDir = await mkdtemp(path.join(os.tmpdir(), "blender-test-crash-"));
    const savedTmpdir = process.env["TMPDIR"];
    process.env["TMPDIR"] = crashDir;
    try {
      const stale = path.join(crashDir, "a-old.crash.txt");
      writeFileSync(stale, "yesterday's segfault (stale)\n");
      const hourAgo = (Date.now() - 3_600_000) / 1000;
      utimesSync(stale, hourAgo, hourAgo);
      const runner = useFake("crash");
      const err = await runner
        .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 10000 })
        .then(
          () => null,
          (e: unknown) => e
        );
      expect(err).toBeInstanceOf(BlenderJobError);
      expect((err as BlenderJobError).code).toBe("bad_result");
      expect((err as Error).message).toContain("segfault in render pipeline");
      expect((err as Error).message).not.toContain("stale");
      await expectScratchGone();
    } finally {
      if (savedTmpdir === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = savedTmpdir;
      await rm(crashDir, { recursive: true, force: true });
    }
  });

  it("ignores an undeclared produced name and never opens a result path", async () => {
    const runner = useFake("evil");
    const result = await runner.run(
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 10000 }
    );
    // The declared output still succeeds; "evil" was never read (no such
    // file exists, so reading `produced` as file names would fail), and the
    // smuggled absolute path — a FIFO with no writer — was never opened:
    // opening it blocks forever, so an implementation that reads it inside
    // a `try/catch` hangs into a timeout instead of passing. This test
    // succeeding proves the runner never touches the smuggled path.
    expect(Object.keys(result.outputs)).toEqual(["image"]);
    expect(result.outputs["image"]).toEqual(new Uint8Array(32).fill(0x50));
    await expectScratchGone();
  });

  it("one output over maxOutputBytes -> output_too_large before any read", async () => {
    const runner = useFake("big-output");
    const err = await runner
      .run(imageJob(), { model: new Uint8Array([1]) }, {
        timeoutMs: 10000,
        maxOutputBytes: 16
      })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("output_too_large");
    expect((err as Error).message).toContain("image");
    expect((err as Error).message).toContain("16");
    await expectScratchGone();
  });

  it("four outputs over maxTotalOutputBytes -> output_too_large", async () => {
    const runner = useFake("big-total");
    const outputs = { a: "a.png", b: "b.png", c: "c.png", d: "d.mp4" };
    const err = await runner
      .run(imageJob(outputs), { model: new Uint8Array([1]) }, {
        timeoutMs: 10000,
        maxTotalOutputBytes: 100
      })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("output_too_large");
    expect((err as Error).message).toContain("100");
    await expectScratchGone();
  });

  it("no scratch parent anywhere -> bad_job instead of a tmpdir fallback", async () => {
    // No constructor parent and none in options: the runner must refuse
    // before resolving a binary or writing anything, and the scratch parent
    // stays empty afterwards.
    const bare = new LocalBlenderRunner();
    const err = await bare
      .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 10000 })
      .then(
        () => null,
        (e: unknown) => e
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("bad_job");
    expect((err as Error).message).toContain("scratchParent");
    await expectScratchGone();
  });

  it("Fra: lines become onProgress calls", async () => {
    const runner = useFake("fra");
    const seen: Array<[number, number]> = [];
    const result = await runner.run(
      animationJob(),
      { model: new Uint8Array([1]) },
      {
        timeoutMs: 10000,
        onProgress: (frame, total) => {
          seen.push([frame, total]);
        }
      }
    );
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3]
    ]);
    expect(Object.keys(result.outputs)).toEqual(["video"]);
    await expectScratchGone();
  });
});
