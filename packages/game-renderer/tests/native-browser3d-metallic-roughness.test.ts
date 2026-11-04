import { expect, it, vi } from "vitest";
import { NoColorSpace, SRGBColorSpace, ClampToEdgeWrapping, NearestFilter } from "three";
import { NativeModelTexturePool, NativePBRMaterials } from "../src/native-cpp/3d-materials.js";
import type { NativePreparedModel } from "../src/native-cpp/model3d-types.js";

function model(): NativePreparedModel {
  return { meshes: [], materials: [{ color: [1, 1, 1, 1], metallic: 0.65, roughness: 0.46,
    image: 0, normalImage: 0, doubleSided: false, metallicRoughnessImage: 0 }],
    images: [{ mimeType: "image/png", source: { assetId: "texture", offset: 0, length: 1, digest: "a".repeat(64) } }],
    nodes: [], roots: [], skins: [], animations: [] };
}
const images = [{ bitmap: {} as ImageBitmap, digest: "a".repeat(64) }];

it("shares one linear metallic-roughness texture without changing either authored factor", () => {
  const pool = new NativeModelTexturePool(), materials = new NativePBRMaterials(model(), images, pool);
  const material = materials.materials[0];
  expect(material.roughnessMap).not.toBeNull();
  expect(material.roughnessMap).toBe(material.metalnessMap);
  expect(material.roughnessMap).toBe(material.normalMap);
  expect(material.roughnessMap?.colorSpace).toBe(NoColorSpace);
  expect(material.map?.colorSpace).toBe(SRGBColorSpace);
  expect(material.roughness).toBe(0.46);
  expect(material.metalness).toBe(0.65);
  expect(pool.variants).toBe(2);
  const dispose = vi.spyOn(material.roughnessMap!, "dispose");
  materials.dispose();
  expect(dispose).not.toHaveBeenCalled();
  pool.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

it("retains metallic-roughness sampling and rejects a missing admitted image", () => {
  const source = model();
  const mapped = { ...source, materials: source.materials.map(material => ({ ...material,
    metallicRoughnessSampler: { wrapS: 33071 as const, wrapT: 33071 as const, magFilter: 9728 as const, minFilter: 9728 as const } })) };
  const materials = new NativePBRMaterials(mapped, images);
  const texture = materials.materials[0].roughnessMap;
  expect(texture?.wrapS).toBe(ClampToEdgeWrapping);
  expect(texture?.magFilter).toBe(NearestFilter);
  expect(texture?.generateMipmaps).toBe(false);
  materials.dispose();
  const onlyMetallicRoughness = { ...source, materials: source.materials.map(material => ({ ...material, image: -1, normalImage: -1 })) };
  expect(() => new NativePBRMaterials(onlyMetallicRoughness, [])).toThrow("Native admitted model image is missing");
});

it("keeps metallic-roughness maps absent for existing material payloads", () => {
  const source = model();
  const materials = new NativePBRMaterials({ ...source, materials: source.materials.map(({ metallicRoughnessImage: _image, ...material }) => material) }, images);
  expect(materials.materials[0].roughnessMap).toBeNull();
  expect(materials.materials[0].metalnessMap).toBeNull();
  materials.dispose();
});
