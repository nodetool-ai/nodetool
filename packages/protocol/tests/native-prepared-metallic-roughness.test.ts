import { expect, it } from "vitest";
import { nativePreparedModel } from "../src/native-game.js";

const material = { color: [1, 1, 1, 1], metallic: 0.65, roughness: 0.46, image: -1, doubleSided: false };
const model = (extra: Record<string, unknown> = {}): unknown => ({
  meshes: [], materials: [{ ...material, ...extra }], images: [{ mimeType: "image/png",
    source: { assetId: "texture", offset: 0, length: 1, digest: "a".repeat(64) } }], nodes: [],
  roots: [], skins: [], animations: [], source: {}
});

it("admits optional metallic-roughness image and sampler without changing absent payloads", () => {
  const old = nativePreparedModel.parse(model()).materials[0];
  expect(old).not.toHaveProperty("metallicRoughnessImage");
  expect(old).not.toHaveProperty("metallicRoughnessSampler");
  const mapped = nativePreparedModel.parse(model({
    metallicRoughnessImage: 0,
    metallicRoughnessSampler: { wrapS: 33071, wrapT: 33648, magFilter: 9728, minFilter: 9984 }
  })).materials[0];
  expect(mapped).toMatchObject({ metallic: 0.65, roughness: 0.46, metallicRoughnessImage: 0,
    metallicRoughnessSampler: { wrapS: 33071, wrapT: 33648, magFilter: 9728, minFilter: 9984 } });
});

it("rejects malformed metallic-roughness indices and samplers", () => {
  for (const metallicRoughnessImage of [-2, 1, 1000, 0.5, NaN, Infinity, "0"]) {
    expect(nativePreparedModel.safeParse(model({ metallicRoughnessImage })).success).toBe(false);
  }
  for (const metallicRoughnessSampler of [{ wrapS: 0 }, { wrapT: 0 }, { minFilter: 0 }, { magFilter: 9987 }, { texCoord: 1 }]) {
    expect(nativePreparedModel.safeParse(model({ metallicRoughnessImage: 0, metallicRoughnessSampler })).success).toBe(false);
  }
});
