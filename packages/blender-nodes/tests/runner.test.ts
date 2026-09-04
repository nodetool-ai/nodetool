import { chmodSync, copyFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
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
    const runner = useFake("ignore-term");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const pending = runner
      .run(
        imageJob(),
        { model: new Uint8Array([1]) },
        { timeoutMs: 30000, signal: controller.signal }
      )
      .then(
        () => null,
        (e: unknown) => e
      );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await readdir(scratchParent)).toHaveLength(1);
    const err = await pending;
    expect(err).not.toBeNull();
    expect(err).not.toBeInstanceOf(BlenderJobError);
    await expectScratchGone();
  }, 30_000);

  it("a segfault surfaces the crash log Blender wrote to its temp directory", async () => {
    // Blender writes <name>.crash.txt into its temp directory ($TMPDIR),
    // never into the run's cwd: the "Crash log:" suffix needs that path.
    const runner = useFake("crash");
    const crashFile = path.join(
      process.env["TMPDIR"] ?? process.env["TEMP"] ?? os.tmpdir(),
      "blender.crash.txt"
    );
    try {
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
      await rm(crashFile, { force: true });
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
    // smuggled absolute path — a directory — would fail loudly if opened.
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
