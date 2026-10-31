import { expect, it } from "vitest";
import { Bone, Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from "three";
import { NativeModelInstance } from "../src/native-cpp/model3d-instance.js";
import type { NativePreparedModel } from "../src/native-cpp/model3d-types.js";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function selectedSceneModel(roots: readonly number[], skinned = false): NativePreparedModel {
  const primitive = {
    vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]].map(position => ({
      position, normal: [0, 0, 1], uv: [0, 0], joints: [0, 0, 0, 0], weights: [1, 0, 0, 0]
    })), indices: [0, 1, 2]
  };
  return {
    roots, images: [],
    meshes: [[{ ...primitive, material: 0 }], [{ ...primitive, material: 1 }]],
    materials: [0, 1].map(() => ({ color: [1, 1, 1, 1], metallic: 0, roughness: 1, image: -1, doubleSided: false })),
    nodes: [
      { local: identity, children: [1], mesh: -1, skin: -1 },
      { local: identity, children: [], mesh: 0, skin: skinned ? 0 : -1 },
      { local: identity, children: [3], mesh: -1, skin: -1 },
      { local: identity, children: [], mesh: 1, skin: skinned ? 1 : -1 },
      { local: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 0, 0, 1], children: [], mesh: -1, skin: -1 },
      { local: identity, children: [], mesh: -1, skin: -1 }
    ],
    skins: skinned ? [{ joints: [4], inverseBind: [identity] }, { joints: [5], inverseBind: [identity] }] : [],
    animations: [{ name: "outside-joint", duration: 2, channels: [{
      node: 4, path: "translation", interpolation: "LINEAR", times: [0, 2], values: [[7, 0, 0, 0], [11, 0, 0, 0]]
    }] }]
  };
}

it.each([{ roots: [0], material: 0 }, { roots: [2], material: 1 }])("draws only the selected scene's non-mesh-root descendants ($roots)", ({ roots, material }) => {
  const materials = [new MeshStandardMaterial({ color: "green" }), new MeshStandardMaterial({ color: "red" })];
  const instance = new NativeModelInstance(selectedSceneModel(roots), materials);
  try {
    const visibleMaterials: Array<Mesh["material"]> = [];
    instance.root.traverse(object => { if (object instanceof Mesh) { visibleMaterials.push(object.material); } });
    expect(visibleMaterials).toEqual([materials[material]]);
  } finally { instance.dispose(); materials.forEach(entry => entry.dispose()); }
});

it("excludes inactive scene skinned meshes while retaining an animated joint outside the selected closure", () => {
  const materials = [new MeshStandardMaterial(), new MeshStandardMaterial()];
  const instance = new NativeModelInstance(selectedSceneModel([0], true), materials);
  try {
    const meshes: SkinnedMesh[] = [];
    instance.root.traverse(object => { if (object instanceof SkinnedMesh) { meshes.push(object); } });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].material).toBe(materials[0]);
    instance.sample(0, 1);
    expect(meshes[0].applyBoneTransform(0, new Vector3()).x).toBe(9);
  } finally { instance.dispose(); materials.forEach(entry => entry.dispose()); }
});

it("selects a deep scene at the admitted node bound without drawing a disconnected mesh", () => {
  const source = selectedSceneModel([0]), materials = [new MeshStandardMaterial(), new MeshStandardMaterial()];
  const model: NativePreparedModel = { ...source, animations: [], nodes: Array.from({ length: 1000 }, (_, index) => ({
    local: identity, children: index < 998 ? [index + 1] : [], mesh: index === 998 ? 0 : index === 999 ? 1 : -1, skin: -1
  })) };
  const instance = new NativeModelInstance(model, materials);
  try {
    instance.sample(0, 0);
    let meshes = 0, transformNodes = 0;
    instance.root.traverse(object => { if (object instanceof Mesh) { meshes++; } if (object instanceof Bone) { transformNodes++; } });
    expect(meshes).toBe(1);
    expect(transformNodes).toBe(1000);
  } finally { instance.dispose(); materials.forEach(entry => entry.dispose()); }
});
