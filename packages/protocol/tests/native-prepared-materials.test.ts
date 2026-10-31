import { expect, it } from "vitest";
import { nativePreparedModel } from "../src/native-game.js";

const vertex = { position: [0, 0, 0], normal: [0, 0, 1], uv: [0, 0], joints: [0, 0, 0, 0], weights: [1, 0, 0, 0] };
const material = { color: [1, 1, 1, 1], metallic: 0, roughness: 1, image: -1, doubleSided: false };
function model(color?: number[], emissiveStrength?: number): unknown {
  return { meshes: [[{ vertices: [{ ...vertex, ...(color ? { color } : {}) }], indices: [0], material: 0 }]], materials: [{ ...material, ...(emissiveStrength === undefined ? {} : { emissiveStrength }) }], images: [], nodes: [], roots: [], skins: [], animations: [], source: {} };
}
it("preserves optional default omission and admits normalized linear RGBA and HDR emission", () => {
  const old = nativePreparedModel.parse(model());
  expect(old.meshes[0][0].vertices[0]).not.toHaveProperty("color");
  expect(old.materials[0]).not.toHaveProperty("emissiveStrength");
  expect(nativePreparedModel.parse(model([0.1, 0.2, 0.3, 0.7], 2.8)).materials[0].emissiveStrength).toBe(2.8);
  expect(nativePreparedModel.safeParse(model([1, 1, 1, 1], 3.4028234663852886e38)).success).toBe(true);
});
it("rejects invalid color tuples and nonrepresentable or negative emission", () => {
  for (const color of [[1, 1, 1], [1, 1, 1, 1, 1], [-0.1, 0, 0, 1], [1.1, 0, 0, 1], [NaN, 0, 0, 1], [Infinity, 0, 0, 1]]) {
    expect(nativePreparedModel.safeParse(model(color)).success).toBe(false);
  }
  for (const strength of [-1, NaN, Infinity, 3.5e38]) {
    expect(nativePreparedModel.safeParse(model(undefined, strength)).success).toBe(false);
  }
});
