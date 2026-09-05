import { chmodSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PythonBridge } from "@nodetool-ai/runtime";
import { HostBinaryMissingError } from "@nodetool-ai/runtime";
import { resetBlenderBinaryCache } from "../src/blender-binary.js";
import { BLENDER_JOB_VERSION, type BlenderJob } from "../src/job.js";
import {
  __setWorkerBlenderBridgeFactoryForTesting,
  BlenderJobError,
  resolveOpScriptDir,
  WorkerBlenderRunner
} from "../src/runner.js";
import {
  __setBlenderBinaryResolverForTesting,
  __setBlenderRunnerForTesting,
  resolveBlenderRunner
} from "../src/run-job.js";

const imageJob = (): BlenderJob => ({
  version: BLENDER_JOB_VERSION,
  inputs: { model: "model.glb" },
  outputs: { image: "render.png" },
  job: { op: "render_image", params: {} }
});

interface CapturedRequest {
  readonly inputs: Record<string, string>;
  readonly blobs: Record<string, Uint8Array>;
  readonly timeout: number;
}

function workerBridge(
  result: Record<string, unknown> = {
    ok: true,
    produced: ["image"],
    blobs: { image: new Uint8Array([5, 0x50, 0x4e, 0x47]) },
    sizes: { image: 4 },
    stats: { blender_version: "5.2.1", render_seconds: 1.5 }
  },
  enabled = true
): { bridge: PythonBridge; requests: CapturedRequest[]; closed: () => boolean } {
  const requests: CapturedRequest[] = [];
  let wasClosed = false;
  const bridge = {
    ensureConnected: async () => {},
    supportsBlender: () => enabled,
    blenderExecute: async (
      _job: Record<string, unknown>,
      inputs: Record<string, string>,
      options: { blobs?: Record<string, Uint8Array>; timeout?: number }
    ) => {
      requests.push({
        inputs,
        blobs: options.blobs ?? {},
        timeout: options.timeout ?? 0
      });
      return result;
    },
    close: () => {
      wasClosed = true;
    }
  } as unknown as PythonBridge;
  return { bridge, requests, closed: () => wasClosed };
}

async function filesBelow(root: string, dir = root): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(root, file)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, file).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

describe("WorkerBlenderRunner", () => {
  let savedBlenderPath: string | undefined;
  let savedWorkerUrl: string | undefined;
  const temporaryDirectories: string[] = [];

  beforeEach(() => {
    savedBlenderPath = process.env["BLENDER_PATH"];
    savedWorkerUrl = process.env["NODETOOL_WORKER_URL"];
    resetBlenderBinaryCache();
  });

  afterEach(async () => {
    __setBlenderRunnerForTesting(null);
    __setBlenderBinaryResolverForTesting(null);
    __setWorkerBlenderBridgeFactoryForTesting(null);
    if (savedBlenderPath === undefined) delete process.env["BLENDER_PATH"];
    else process.env["BLENDER_PATH"] = savedBlenderPath;
    if (savedWorkerUrl === undefined) delete process.env["NODETOOL_WORKER_URL"];
    else process.env["NODETOOL_WORKER_URL"] = savedWorkerUrl;
    await Promise.all(
      temporaryDirectories.splice(0).map((dir) =>
        rm(dir, { recursive: true, force: true })
      )
    );
    resetBlenderBinaryCache();
  });

  it("sends every blender_ops file by relative path alongside declared inputs", async () => {
    const stub = workerBridge();
    const runner = new WorkerBlenderRunner({ bridge: stub.bridge });

    const result = await runner.run(
      imageJob(),
      { model: new Uint8Array([1, 2, 3]) },
      { timeoutMs: 6000 }
    );

    expect(result.outputs["image"]).toEqual(new Uint8Array([5, 0x50, 0x4e, 0x47]));
    expect(stub.requests).toHaveLength(1);
    const request = stub.requests[0]!;
    expect(request.inputs).toEqual({ model: "model" });
    expect(request.timeout).toBe(6);
    expect(Object.keys(request.blobs).sort()).toEqual([
      "model",
      ...(await filesBelow(resolveOpScriptDir()))
    ].sort());
    expect(new TextDecoder().decode(request.blobs["run_job.py"]!)).toContain(
      "def main()"
    );
  });

  it("maps BlenderExecutorError codes directly to BlenderJobError", async () => {
    const stub = workerBridge({
      ok: false,
      error: { code: "render_failed", message: "Eevee complained" }
    });
    const err = await new WorkerBlenderRunner({ bridge: stub.bridge })
      .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 6000 })
      .then(
        () => null,
        (error: unknown) => error
      );

    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("render_failed");
    expect((err as Error).message).toContain("Eevee complained");
  });

  it.each([0, 100])("counts worker animation frames starting at %i", async (frameStart) => {
    const stub = workerBridge();
    const execute = stub.bridge.blenderExecute.bind(stub.bridge);
    stub.bridge.blenderExecute = async (job, inputs, options, onEvent, requestId) => {
      for (let frame = frameStart; frame < frameStart + 3; frame++) {
        onEvent?.({ event: "progress", frame, total: 3 });
      }
      return execute(job, inputs, options, onEvent, requestId);
    };
    const job: BlenderJob = {
      ...imageJob(),
      job: {
        op: "render_animation",
        params: { frame_start: frameStart, frame_end: frameStart + 2 }
      }
    };
    const seen: Array<[number, number]> = [];
    await new WorkerBlenderRunner({ bridge: stub.bridge }).run(
      job,
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, onProgress: (frame, total) => seen.push([frame, total]) }
    );
    expect(seen).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("cancels while connecting and closes an owned bridge", async () => {
    let connect: (() => void) | undefined;
    let closed = false;
    const bridge = {
      ensureConnected: () =>
        new Promise<void>((resolve) => {
          connect = resolve;
        }),
      supportsBlender: () => true,
      close: () => {
        closed = true;
      }
    } as unknown as PythonBridge;
    __setWorkerBlenderBridgeFactoryForTesting(() => bridge);
    const runner = new WorkerBlenderRunner();
    const controller = new AbortController();
    const reason = new Error("cancelled while connecting");
    const pending = runner.run(
      imageJob(),
      { model: new Uint8Array([1]) },
      { timeoutMs: 6000, signal: controller.signal }
    );
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(closed).toBe(true);
    connect?.();
  });

  it("times out while connecting and closes an owned bridge", async () => {
    let closed = false;
    const bridge = {
      ensureConnected: () => new Promise<void>(() => {}),
      close: () => {
        closed = true;
      }
    } as unknown as PythonBridge;
    __setWorkerBlenderBridgeFactoryForTesting(() => bridge);
    const runner = new WorkerBlenderRunner();

    const err = await runner
      .run(imageJob(), { model: new Uint8Array([1]) }, { timeoutMs: 20 })
      .then(
        () => null,
        (error: unknown) => error
      );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("timeout");
    expect(closed).toBe(true);
  });

  it("selects the worker only when no local binary resolves and the worker enables Blender", async () => {
    const stub = workerBridge();
    process.env["NODETOOL_WORKER_URL"] = "ws://worker.example.test";
    __setBlenderBinaryResolverForTesting(async () => {
      throw new HostBinaryMissingError("blender");
    });
    __setWorkerBlenderBridgeFactoryForTesting(() => stub.bridge);
    resetBlenderBinaryCache();

    expect((await resolveBlenderRunner()).kind).toBe("worker");
    expect(stub.closed()).toBe(true);
  });

  it("selects the local runner without creating a configured worker bridge", async () => {
    const stub = workerBridge();
    const dir = await mkdtemp(path.join(os.tmpdir(), "blender-worker-runner-"));
    temporaryDirectories.push(dir);
    const binary = path.join(dir, "blender");
    writeFileSync(binary, "#!/bin/sh\necho 'Blender 5.2.1'\n");
    chmodSync(binary, 0o755);
    process.env["BLENDER_PATH"] = binary;
    process.env["NODETOOL_WORKER_URL"] = "ws://worker.example.test";
    __setWorkerBlenderBridgeFactoryForTesting(() => stub.bridge);
    resetBlenderBinaryCache();

    expect((await resolveBlenderRunner()).kind).toBe("local");
    expect(stub.closed()).toBe(false);
  });

  it("rejects an explicitly configured worker that does not enable Blender", async () => {
    const stub = workerBridge(undefined, false);
    process.env["NODETOOL_WORKER_URL"] = "ws://worker.example.test";
    __setBlenderBinaryResolverForTesting(async () => {
      throw new HostBinaryMissingError("blender");
    });
    __setWorkerBlenderBridgeFactoryForTesting(() => stub.bridge);
    resetBlenderBinaryCache();

    const err = await resolveBlenderRunner().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("worker_unavailable");
    expect((err as Error).message).toContain("NODETOOL_WORKER_URL");
    expect(stub.closed()).toBe(true);
  });
});
