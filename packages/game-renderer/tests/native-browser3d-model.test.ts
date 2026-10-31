import { describe, expect, it } from "vitest";
import { Mesh, MeshStandardMaterial, SkinnedMesh, Vector3 } from "three";
import { NativeModelInstance } from "../src/native-cpp/model3d-instance.js";
import type { NativePreparedModel } from "../src/native-cpp/model3d-types.js";
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function fixture(skin = false): NativePreparedModel {
  return {
    meshes: [
      [
        {
          vertices: [0, 1, 2].map((x) => ({
            position: [x, 0, 0],
            normal: [0, 1, 0],
            uv: [0, 0],
            joints: [0, 0, 0, 0],
            weights: [1, 0, 0, 0]
          })),
          indices: [0, 1, 2],
          material: 0
        }
      ]
    ],
    materials: [],
    images: [],
    roots: [0],
    nodes: [
      { local: identity, children: [1], mesh: -1, skin: -1 },
      {
        local: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1],
        children: [],
        mesh: 0,
        skin: skin ? 0 : -1
      }
    ],
    skins: skin ? [{ joints: [1], inverseBind: [identity] }] : [],
    animations: [
      {
        name: "move",
        duration: 2,
        channels: [
          {
            node: 0,
            path: "translation",
            interpolation: "LINEAR",
            times: [0, 2],
            values: [
              [0, 0, 0, 0],
              [4, 0, 0, 0]
            ]
          }
        ]
      }
    ]
  };
}
describe("native admitted model presentation", () => {
  it("preserves hierarchy and seeks committed animation time in both directions", () => {
    const instance = new NativeModelInstance(fixture(), [
      new MeshStandardMaterial()
    ]);
    let mesh: Mesh | undefined;
    instance.root.traverse((object) => {
      if (object instanceof Mesh) {
        mesh = object;
      }
    });
    instance.sample(0, 1);
    expect(mesh?.getWorldPosition(new Vector3()).x).toBe(4);
    instance.sample(0, 0.25);
    expect(mesh?.getWorldPosition(new Vector3()).x).toBe(2.5);
    instance.sample(9, 1);
    expect(mesh?.getWorldPosition(new Vector3()).x).toBe(2);
    instance.dispose();
  });
  it("skins in model world space without applying the mesh node twice", () => {
    const instance = new NativeModelInstance(fixture(true), [
      new MeshStandardMaterial()
    ]);
    let mesh: SkinnedMesh | undefined;
    instance.root.traverse((object) => {
      if (object instanceof SkinnedMesh) {
        mesh = object;
      }
    });
    instance.sample(0, 1);
    expect(mesh?.applyBoneTransform(0, new Vector3(0, 0, 0)).x).toBe(4);
    instance.dispose();
  });
  it("uses resolved non-looping animation time without wrapping", () => {
    const instance = new NativeModelInstance(fixture(), [
      new MeshStandardMaterial()
    ]);
    let mesh: Mesh | undefined;
    instance.root.traverse((object) => {
      if (object instanceof Mesh) {
        mesh = object;
      }
    });
    instance.sample(0, 3, false);
    expect(mesh?.getWorldPosition(new Vector3()).x).toBe(6);
    instance.sample(0, 3, true);
    expect(mesh?.getWorldPosition(new Vector3()).x).toBe(4);
    instance.dispose();
  });
  it("rejects invalid animation time before updating pose", () => {
    const instance = new NativeModelInstance(fixture(), [
      new MeshStandardMaterial()
    ]);
    expect(() => instance.sample(0, NaN)).toThrow("committed");
    expect(() => instance.sample(0, -1)).toThrow("committed");
    instance.dispose();
  });
});
