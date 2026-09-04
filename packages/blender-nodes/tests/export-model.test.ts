/**
 * T4: `export_model` through the real Blender.
 *
 * One boot per format over the triangle fixture: the FBX starts with the
 * FBX magic bytes, the OBJ decodes as text with the Blender header and one
 * `v` line per triangle vertex, and the USD is the binary `PXR-USDC` file
 * it claims to be. Skipped without Blender, like the render T4s.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { BlenderOp, ExportModelParams } from "../src/job.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderAvailable } from "./blender-available.js";
import { blenderTestContext, type BlenderTestContext } from "./context.js";
import { createTriangleGlb } from "./fixtures.js";

/** Binary FBX magic: `Kaydara FBX Binary  \x00\x1a\x00`. */
const FBX_MAGIC = Buffer.from("Kaydara FBX Binary  \x00\x1a\x00", "binary");
/** Binary USD magic. */
const USD_MAGIC = Buffer.from("PXR-USDC", "ascii");

function exportOp(format: ExportModelParams["format"]): BlenderOp {
  return { op: "export_model", params: { format } };
}

const OUTPUT_FILE = {
  fbx: "model.fbx",
  obj: "model.obj",
  usd: "model.usd"
} as const;

describe.skipIf(!blenderAvailable())("export_model integration", () => {
  let helper: BlenderTestContext | null = null;

  beforeEach(() => {
    helper = blenderTestContext();
  });

  afterEach(() => {
    helper?.cleanup();
    helper = null;
  });

  it("exports an FBX starting with the FBX magic bytes", async () => {
    const result = await runBlenderJob(
      helper!.context,
      createTriangleGlb(),
      exportOp("fbx"),
      { file: OUTPUT_FILE.fbx },
      { timeoutMs: 300_000 }
    );
    const fbx = result.outputs["file"]!;
    expect(fbx.byteLength).toBeGreaterThan(FBX_MAGIC.byteLength);
    expect(Buffer.from(fbx.subarray(0, FBX_MAGIC.byteLength)).equals(FBX_MAGIC)).toBe(
      true
    );
    expect(result.stats.objects).toBe(1);
  }, 300_000);

  it("exports an OBJ that parses as text with one vertex per corner", async () => {
    const result = await runBlenderJob(
      helper!.context,
      createTriangleGlb(),
      exportOp("obj"),
      { file: OUTPUT_FILE.obj },
      { timeoutMs: 300_000 }
    );
    const obj = result.outputs["file"]!;
    const text = new TextDecoder().decode(obj);
    expect(text.startsWith("# Blender")).toBe(true);
    const vertices = text.split("\n").filter((line) => line.startsWith("v "));
    // The triangle fixture carries exactly three corners.
    expect(vertices).toHaveLength(3);
    expect(result.stats.objects).toBe(1);
  }, 300_000);

  it("exports OBJ geometry-only: no mtllib line, no dangling material", async () => {
    // `wm.obj_export` writes `model.mtl` next to `model.obj`, but the job
    // declares only `file` — so the export disables materials and the OBJ
    // must not reference a material file that dies with the scratch dir.
    const result = await runBlenderJob(
      helper!.context,
      createTriangleGlb(),
      exportOp("obj"),
      { file: OUTPUT_FILE.obj },
      { timeoutMs: 300_000 }
    );
    const obj = result.outputs["file"]!;
    const text = new TextDecoder().decode(obj);
    expect(text.startsWith("# Blender")).toBe(true);
    expect(
      text.split("\n").filter((line) => line.startsWith("mtllib"))
    ).toEqual([]);
    expect(
      text.split("\n").filter((line) => line.startsWith("usemtl"))
    ).toEqual([]);
    const vertices = text.split("\n").filter((line) => line.startsWith("v "));
    expect(vertices).toHaveLength(3);
  }, 300_000);

  it("exports a USD file that is what it claims to be", async () => {
    const result = await runBlenderJob(
      helper!.context,
      createTriangleGlb(),
      exportOp("usd"),
      { file: OUTPUT_FILE.usd },
      { timeoutMs: 300_000 }
    );
    const usd = result.outputs["file"]!;
    expect(usd.byteLength).toBeGreaterThan(USD_MAGIC.byteLength);
    expect(Buffer.from(usd.subarray(0, USD_MAGIC.byteLength)).equals(USD_MAGIC)).toBe(
      true
    );
    expect(result.stats.objects).toBe(1);
  }, 300_000);

  it("persists the export as an AssetRef with format and mime metadata", async () => {
    // The node half of the contract: bytes through the real Blender,
    // persistence through a capturing `createAsset`.
    const { ExportModelNode } = await import("../src/nodes/export-model.js");
    const captured: {
      args?: { name: string; contentType: string; content: Uint8Array };
    } = {};
    const context = helper!.context;
    (context as unknown as Record<string, unknown>)["createAsset"] = async (args: {
      name: string;
      contentType: string;
      content: Uint8Array;
    }) => {
      captured.args = args;
      return { id: "asset-fbx-1" };
    };

    const node = new ExportModelNode();
    const { triangleModelProp } = await import("./fixtures.js");
    node.model = triangleModelProp();
    node.format = "fbx";

    const result = await node.process(context);
    expect(result.file).toEqual({
      type: "asset",
      uri: "asset://asset-fbx-1",
      asset_id: "asset-fbx-1",
      metadata: { format: "fbx", mime: "application/octet-stream" }
    });
    expect(captured.args?.name).toBe("model.fbx");
    expect(captured.args?.contentType).toBe("application/octet-stream");
    expect(
      Buffer.from(captured.args!.content.subarray(0, FBX_MAGIC.byteLength)).equals(
        FBX_MAGIC
      )
    ).toBe(true);
  }, 300_000);
});
