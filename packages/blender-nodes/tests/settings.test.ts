import { chmodSync, copyFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFakeContext,
  createLocalWorkspace,
  ProcessingContext
} from "@nodetool-ai/runtime";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { runBlenderJob } from "../src/run-job.js";
import type { BlenderOp } from "../src/job.js";

const source = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "helpers",
  "fake-blender.mjs"
);

const op: BlenderOp = {
  op: "render_image",
  params: {
    camera_mode: "orbit",
    azimuth: 45,
    elevation: 25,
    fov: 35,
    zoom: 1,
    lighting: "studio",
    light_intensity: 1,
    background_color: "#fff",
    transparent: false,
    engine: "eevee",
    samples: 16,
    denoise: true,
    resolution_percentage: 100,
    width: 8,
    height: 8
  }
};

describe("Blender settings", () => {
  let binDir: string | undefined;
  const cleanups: Array<() => void> = [];
  const savedEnv = {
    blender: process.env["BLENDER_PATH"],
    profile: process.env["NODETOOL_NODE_PROFILE"],
    env: process.env["NODETOOL_ENV"]
  };

  afterEach(async () => {
    __setBlenderRunnerForTesting(null);
    for (const cleanup of cleanups.splice(0)) cleanup();
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = undefined;
    if (savedEnv.blender === undefined) delete process.env["BLENDER_PATH"];
    else process.env["BLENDER_PATH"] = savedEnv.blender;
    if (savedEnv.profile === undefined) delete process.env["NODETOOL_NODE_PROFILE"];
    else process.env["NODETOOL_NODE_PROFILE"] = savedEnv.profile;
    if (savedEnv.env === undefined) delete process.env["NODETOOL_ENV"];
    else process.env["NODETOOL_ENV"] = savedEnv.env;
  });

  it("uses each context's setting, refreshes changed paths, and keeps env untouched", async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), "nodetool-blender-settings-"));
    const ok = path.join(binDir, "fake-ok.mjs");
    const failed = path.join(binDir, "fake-import-failed.mjs");
    copyFileSync(source, ok);
    copyFileSync(source, failed);
    chmodSync(ok, 0o755);
    chmodSync(failed, 0o755);
    const values = new Map([["user-a", ok], ["user-b", failed]]);
    const firstHandle = createFakeContext();
    const secondHandle = createFakeContext();
    cleanups.push(() => firstHandle.cleanup(), () => secondHandle.cleanup());
    const settings = {
      getSetting: async ({ userId, key }: { userId: string; key: string }) => {
        expect(key).toBe("BLENDER_PATH");
        return values.get(userId) ?? null;
      }
    };
    const first = new ProcessingContext({
      jobId: "job-a",
      userId: "user-a",
      workspace: createLocalWorkspace(firstHandle.workspaceDir)
    });
    const second = new ProcessingContext({
      jobId: "job-b",
      userId: "user-b",
      workspace: createLocalWorkspace(secondHandle.workspaceDir)
    });
    first.setModelInterfaces(settings);
    second.setModelInterfaces(settings);
    const envBefore = process.env["BLENDER_PATH"];
    const result = await runBlenderJob(first, new Uint8Array([1]), op, { image: "render.png" }, { timeoutMs: 5000 });
    expect(result.outputs.image).toBeInstanceOf(Uint8Array);
    values.set("user-a", failed);
    await expect(runBlenderJob(first, new Uint8Array([1]), op, { image: "render.png" }, { timeoutMs: 5000 })).rejects.toMatchObject({ code: "import_failed" });
    await expect(runBlenderJob(second, new Uint8Array([1]), op, { image: "render.png" }, { timeoutMs: 5000 })).rejects.toMatchObject({ code: "import_failed" });
    values.set("user-b", ok);
    const other = await runBlenderJob(second, new Uint8Array([1]), op, { image: "render.png" }, { timeoutMs: 5000 });
    expect(other.outputs.image).toBeInstanceOf(Uint8Array);
    await expect(runBlenderJob(first, new Uint8Array([1]), op, { image: "render.png" }, { timeoutMs: 5000 })).rejects.toMatchObject({ code: "import_failed" });
    expect(process.env["BLENDER_PATH"]).toBe(envBefore);
  });

  it("does not read a stored path under the cloud profile", async () => {
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const handle = createFakeContext();
    cleanups.push(() => handle.cleanup());
    let reads = 0;
    handle.context.setModelInterfaces({
      getSetting: async () => {
        reads++;
        return "/arbitrary/user/path";
      }
    });
    __setBlenderRunnerForTesting({
      kind: "local",
      run: async () => ({ outputs: {}, stats: { blender_version: "5.2.0", render_seconds: 0 } })
    });
    await runBlenderJob(handle.context, new Uint8Array([1]), op, {}, { timeoutMs: 1000 });
    expect(reads).toBe(0);
  });
});
