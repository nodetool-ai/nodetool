/**
 * T6b node seam: `ExportModel` against `FakeBlenderRunner`.
 *
 * Records the `job` and `inputs` the fake receives, proving the node builds
 * the expected `BlenderJob` from its props and never reaches past the
 * `BlenderRunner` interface — and that it persists the export through
 * `context.createAsset` and returns an `AssetRef`, never a `Model3DRef`.
 * No Blender binary is touched here; the real binary runs in
 * `export-model.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { BLENDER_JOB_VERSION } from "../src/job.js";
import { BlenderJobError } from "../src/runner.js";
import { __setBlenderRunnerForTesting } from "../src/run-job.js";
import { ExportModelNode } from "../src/nodes/export-model.js";
import { FakeBlenderRunner } from "./fake-runner.js";
import { triangleModelProp } from "./fixtures.js";

const FBX_BYTES = new Uint8Array([
  0x4b, 0x61, 0x79, 0x64, 0x61, 0x72, 0x61, 0x20, 0x46, 0x42, 0x58, 0x20,
  0x42, 0x69, 0x6e, 0x61, 0x72, 0x79, 0x20, 0x20, 0x00, 0x1a, 0x00
]);

function cannedRunner(bytes: Uint8Array = FBX_BYTES): FakeBlenderRunner {
  return new FakeBlenderRunner({
    outputs: { file: bytes },
    stats: { blender_version: "5.2.0-test", render_seconds: 0.5, objects: 1 }
  });
}

/**
 * The node persists through `context.createAsset`, which only the fake
 * runner lets a test reach without a workspace: the fake is not a
 * `LocalBlenderRunner`, so `runBlenderJob` never asks for `scratchDir`.
 */
function stubContext(captured: {
  args?: { name: string; contentType: string; content: Uint8Array };
}): ProcessingContext {
  return {
    getSetting: async () => null,
    createAsset: async (args: {
      name: string;
      contentType: string;
      content: Uint8Array;
    }) => {
      captured.args = args;
      return { id: "asset-export-1" };
    }
  } as unknown as ProcessingContext;
}

function exportNode(): ExportModelNode {
  const node = new ExportModelNode();
  node.model = triangleModelProp();
  return node;
}

afterEach(() => {
  __setBlenderRunnerForTesting(null);
  vi.restoreAllMocks();
});

describe("ExportModel against FakeBlenderRunner", () => {
  it("builds the expected BlenderJob from its props", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const seen: {
      args?: { name: string; contentType: string; content: Uint8Array };
    } = {};
    const node = exportNode();
    node.format = "obj";
    node.timeout = 60;

    await node.process(stubContext(seen));
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.job.version).toBe(BLENDER_JOB_VERSION);
    expect(call.job.inputs).toEqual({ model: "model.glb" });
    expect(call.job.outputs).toEqual({ file: "model.obj" });
    expect(call.job.job).toEqual({
      op: "export_model",
      params: { format: "obj" }
    });
    expect(call.options.timeoutMs).toBe(60_000);
    expect(call.inputs["model"]!.length).toBeGreaterThan(0);
  });

  it.each([
    ["fbx", "model.fbx", "application/octet-stream"],
    ["obj", "model.obj", "text/plain"],
    ["usd", "model.usd", "application/octet-stream"]
  ] as const)(
    "returns an AssetRef with format and mime metadata for %s",
    async (format, file, mime) => {
      __setBlenderRunnerForTesting(cannedRunner());
      const seen: {
        args?: { name: string; contentType: string; content: Uint8Array };
      } = {};
      const node = exportNode();
      node.format = format;

      const result = await node.process(stubContext(seen));
      expect(result.file).toEqual({
        type: "asset",
        uri: "asset://asset-export-1",
        asset_id: "asset-export-1",
        metadata: { format, mime }
      });
      expect(seen.args?.name).toBe(file);
      expect(seen.args?.contentType).toBe(mime);
      expect(seen.args?.content).toEqual(FBX_BYTES);
    }
  );

  it("refuses an unknown format before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = exportNode();
    node.format = "glb";
    const seen: {
      args?: { name: string; contentType: string; content: Uint8Array };
    } = {};
    const err = await node.process(stubContext(seen)).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("bad_job");
    expect((err as Error).message).toContain("nodetool.blender.ExportModel");
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects an empty model before touching the runner", async () => {
    const fake = cannedRunner();
    __setBlenderRunnerForTesting(fake);
    const node = new ExportModelNode();
    node.model = { type: "model_3d", uri: "", data: null };
    const seen: {
      args?: { name: string; contentType: string; content: Uint8Array };
    } = {};
    await expect(node.process(stubContext(seen))).rejects.toThrow(/empty/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("needs a context with createAsset", async () => {
    __setBlenderRunnerForTesting(cannedRunner());
    const err = await exportNode().process(undefined).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as BlenderJobError).code).toBe("bad_job");
    expect((err as Error).message).toContain("createAsset");
  });

  it("prefixes the node name on an op failure", async () => {
    const fake = new FakeBlenderRunner();
    __setBlenderRunnerForTesting(fake);
    const seen: {
      args?: { name: string; contentType: string; content: Uint8Array };
    } = {};
    // The default fake returns zero-byte outputs, which the node refuses.
    const err = await exportNode().process(stubContext(seen)).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderJobError);
    expect((err as Error).message).toContain("nodetool.blender.ExportModel");
  });
});
