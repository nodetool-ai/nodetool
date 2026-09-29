import { describe, expect, it } from "vitest";
import { prepareGameModel, prepareGameModelBinding3D, normalizeGameModel3D, createGameColliderCandidate3D } from "../src/preparation3d.js";
import { triangleGlb, glb } from "./fixtures/game3d.js";

describe("prepared GLB runtime profile", () => {
  it("derives content identity, stable selectors and geometry metadata", async () => {
    const result = await prepareGameModelBinding3D(triangleGlb(), { assetId: "owned-model" });
    expect(result.ok).toBe(true);
    if (!result.ok) { return; }
    expect(result.binding).toMatchObject({ mediaKind: "model", assetId: "owned-model", triangles: 1,
      geometryBytes: 36, nodeIds: ["node:0"], clipIds: [], bounds: { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 0 } } });
    expect(result.binding.digest).toMatch(/^[0-9a-f]{64}$/);
  });
  it("bounds imported geometry through its node transform", async () => {
    const result = await prepareGameModel(triangleGlb({ nodes: [{ mesh: 0, translation: [2, 3, 4], scale: [2, 2, 2] }] }));
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.model.bounds).toEqual({ min: { x: 0, y: 1, z: 4 }, max: { x: 4, y: 5, z: 4 } }); }
  });
  it.each([
    [{ buffers: [{ byteLength: 36, uri: "https://outside.invalid/model.bin" }] }, "model.externalResource"],
    [{ images: [{ uri: "texture.png" }] }, "model.externalResource"],
    [{ extensionsUsed: ["KHR_draco_mesh_compression"] }, "model.decoder"],
    [{ extensionsRequired: ["UNSUPPORTED_extension"] }, "model.extension"],
    [{ nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 0 } } } }] }, "model.extension"],
    [{ extensions: { KHR_materials_unlit: {} } }, "model.extension"],
    [{ bufferViews: [{ buffer: 0, byteLength: 35 }] }, "model.accessorBounds"],
    [{ nodes: [{ children: [0] }] }, "model.malformed"],
  ])("rejects unsafe or malformed runtime content %j", async (extra, code) => {
    const result = await prepareGameModel(triangleGlb(extra));
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.diagnostics.some((entry) => entry.code === code)).toBe(true); }
  });
  it.each([undefined, 0, 1])("uses only selected/default scene geometry and selectors (scene %s)", async (scene) => {
    const selected = scene ?? 0;
    const bytes = triangleGlb({ nodes: [{ mesh: 0 }, { mesh: 0, translation: [100, -100, 0] }], scenes: [{ nodes: [0] }, { nodes: [1] }], scene });
    const prepared = await prepareGameModelBinding3D(bytes, { assetId: "scene-model" });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) { return; }
    expect(prepared.binding.bounds).toEqual({ min: { x: selected * 100 - 1, y: -selected * 100 - 1, z: 0 }, max: { x: selected * 100 + 1, y: -selected * 100 + 1, z: 0 } });
    expect(prepared.binding.nodeIds).toEqual([`node:${selected}`]);
    const collider = await createGameColliderCandidate3D(bytes, { assetId: "scene-collider", shape: "triangleMesh" });
    expect(collider.ok).toBe(true);
    if (collider.ok) { expect(collider.binding.bounds).toEqual(prepared.binding.bounds); expect(collider.binding.vertices).toBe(3); }
    const normalized = await normalizeGameModel3D(bytes, { assetId: "normalized", importSettings: { origin: "centerGround" } });
    expect(normalized.ok).toBe(true);
    if (normalized.ok) { expect(normalized.binding.bounds).toEqual({ min: { x: -1, y: 0, z: 0 }, max: { x: 1, y: 2, z: 0 } }); }
  });
  it.each([
    { scenes: [], scene: undefined }, { scenes: [{ nodes: [2] }] }, { scene: 2 }, { scenes: [{ nodes: [0, 0] }] },
    { nodes: [{ children: [1] }, { mesh: 0 }], scenes: [{ nodes: [1] }] }
  ])("rejects missing or malformed selected scene roots %j", async (extra) => {
    expect((await prepareGameModel(triangleGlb(extra))).ok).toBe(false);
  });
  it("enforces content digest and preparation budgets", async () => {
    const digest = await prepareGameModel(triangleGlb(), { expectedDigest: "changed" });
    expect(digest.ok).toBe(false);
    const geometry = await prepareGameModel(triangleGlb(), { budgets: { maxGeometryBytes: 35 } });
    expect(geometry.ok).toBe(false);
    const triangles = await prepareGameModel(triangleGlb(), { budgets: { maxTriangles: 0 } });
    expect(triangles.ok).toBe(false);
  });
  it("derives normalized integer POSITION bounds in the supported quantized profile", async () => {
    const positions = new Int16Array([-32767, -32767, 0, 32767, -32767, 0, 0, 32767, 0]);
    const model = glb({ asset: { version: "2.0" }, extensionsUsed: ["KHR_mesh_quantization"], extensionsRequired: ["KHR_mesh_quantization"],
      buffers: [{ byteLength: positions.byteLength }], bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5122, normalized: true, count: 3, type: "VEC3", min: [-32767, -32767, 0], max: [32767, 32767, 0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }] }, new Uint8Array(positions.buffer));
    const result = await prepareGameModel(model);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.model.bounds).toEqual({ min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 0 } }); }
  });
  it("propagates cancellation before preparing resources", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(prepareGameModel(triangleGlb(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});


describe("source import and prepared collider candidates", () => {
  it("normalizes self-contained glTF into GLB with recorded source identity", async () => {
    const bytes = triangleGlb(); const view = new DataView(bytes.buffer);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))).trim());
    const binary = bytes.subarray(28 + view.getUint32(12, true));
    json.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(binary).toString("base64")}`;
    const result = await normalizeGameModel3D(new TextEncoder().encode(JSON.stringify(json)), { assetId: "normalized", sourceAssetId: "owned-source" });
    expect(result.ok).toBe(true);
    if (!result.ok) { return; }
    expect(new DataView(result.bytes.buffer).getUint32(0, true)).toBe(0x46546c67);
    expect(result.binding.sourceAssetId).toBe("owned-source");
    expect(result.binding.importSettings).toEqual({ scale: 1, forward: "-z", origin: "preserve" });
  });
  it("resolves dependencies only through an authorized resolver and fails unresolved resources", async () => {
    const external = triangleGlb({ buffers: [{ byteLength: 36, uri: "owned.bin" }] });
    const failed = await normalizeGameModel3D(external, { assetId: "model" });
    expect(failed.ok).toBe(false);
    const resolved: string[] = [];
    const result = await normalizeGameModel3D(external, { assetId: "model", resolveDependency: async (uri) => { resolved.push(uri); return new Uint8Array(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer); } });
    expect(result.ok).toBe(true); expect(resolved).toEqual(["owned.bin"]);
  });
  it("bakes source units and maps ground origin without adding gameplay components", async () => {
    const result = await normalizeGameModel3D(triangleGlb(), { assetId: "model", importSettings: { scale: 2, forward: "+z", origin: "ground" } });
    expect(result.ok).toBe(true);
    if (!result.ok) { return; }
    expect(result.binding.bounds.min.y).toBe(0);
    expect(result.binding.bounds.max.y).toBe(4);
    expect(result.binding.bounds.max.x).toBeCloseTo(2);
    expect(result.binding.nodeIds).toEqual(["node:0", "node:1"]);
    const collider = await createGameColliderCandidate3D(result.bytes, { assetId: "collision", shape: "triangleMesh" });
    expect(collider.ok).toBe(true);
    if (collider.ok) {
      expect(collider.binding).toMatchObject({ shape: "triangleMesh", vertices: 3, triangles: 1 });
      expect(collider.binding.bounds.max.y).toBe(4);
    }
  });
  it("creates bounded conservative convex geometry and rejects degenerate hulls", async () => {
    const degenerate = await createGameColliderCandidate3D(triangleGlb(), { assetId: "hull", shape: "convexHull" });
    expect(degenerate.ok).toBe(false);
    const positions = new Float32Array([-1, -1, -1, 1, -1, 1, 0, 1, 0]);
    const model = glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }] }, new Uint8Array(positions.buffer));
    const hull = await createGameColliderCandidate3D(model, { assetId: "hull", shape: "convexHull" });
    expect(hull.ok).toBe(true);
    if (hull.ok) { expect(hull.binding.vertices).toBe(8); expect(hull.binding.triangles).toBe(0); }
  });
});
