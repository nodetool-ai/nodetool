import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { gameAssetBinding3D } from "@nodetool-ai/protocol";
import { decodePreparedGameCollider3D } from "../src/prepared-collider3d.js";

function artifact(vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0], indices = [0, 1, 2]) {
  const bytes = new TextEncoder().encode(JSON.stringify({ vertices, indices }));
  const binding = gameAssetBinding3D.parse({ mediaKind: "collider", assetId: "collider-source", digest: createHash("sha256").update(bytes).digest("hex"), shape: "triangleMesh",
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 0 } }, vertices: 3, triangles: 1 });
  if (binding.mediaKind !== "collider") throw new Error("Fixture requires collider");
  return { bytes, binding };
}

describe("prepared collider decoding", () => {
  it("verifies geometry bytes, counts and bounds before exposing typed arrays", async () => {
    const { bytes, binding } = artifact();
    const decoded = await decodePreparedGameCollider3D(bytes, binding);
    expect(decoded.vertices).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    expect(decoded.indices).toEqual(new Uint32Array([0, 1, 2]));
    expect(decoded.digest).toBe(binding.digest);
  });
  it("rejects digest/version mismatch, out-of-bounds triangles and misleading bounds", async () => {
    const { bytes, binding } = artifact();
    await expect(decodePreparedGameCollider3D(bytes, { ...binding, digest: "wrong" })).rejects.toThrow("digest");
    await expect(decodePreparedGameCollider3D(bytes, { ...binding, preparationVersion: "future" })).rejects.toThrow("version");
    await expect(decodePreparedGameCollider3D(bytes, { ...binding, bounds: { ...binding.bounds, max: { x: 2, y: 1, z: 0 } } })).rejects.toThrow("bounds");
    const invalid = artifact(undefined, [0, 1, 3]);
    await expect(decodePreparedGameCollider3D(invalid.bytes, invalid.binding)).rejects.toThrow("vertex bounds");
  });
});
