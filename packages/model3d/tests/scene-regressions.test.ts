import { describe, expect, it } from "vitest";

import {
  applyOperations,
  createModel3DFile,
  decomposeMatrix,
  listScene,
  resolveTarget,
  selectedId,
  validateModel3D
} from "../src/index.js";
import type { GltfJson } from "../src/index.js";

const build = (kinds: string[]) => {
  const file = createModel3DFile();
  applyOperations(
    file,
    kinds.map((kind) => ({ op: "add_object", kind }) as never)
  );
  return file;
};

describe("ids after a delete", () => {
  it("never gives a new object the id of a deleted one", () => {
    const file = build(["box", "sphere"]);
    const sphereId = listScene(file.json)[1].uuid;
    applyOperations(file, [
      { op: "delete_object", target: sphereId },
      { op: "add_object", kind: "torus" }
    ]);
    expect(() => resolveTarget(file.json, sphereId)).toThrow(/No object found/);
  });

  it("does not hand an imported node's listed id to a new object", () => {
    const file = createModel3DFile();
    file.json.nodes = [{ name: "A" }, { name: "B" }, { name: "C" }];
    file.json.scenes = [{ nodes: [0, 1, 2] }];
    applyOperations(file, [
      { op: "delete_object", target: "node-2" },
      { op: "add_object", kind: "box", name: "NewBox" }
    ]);
    expect(() => resolveTarget(file.json, "node-2")).toThrow(/No object found/);
  });
});

describe("delete", () => {
  it("clears a selection that pointed into the deleted subtree", () => {
    const file = build(["box", "sphere"]);
    file.json.nodes![0].children = [1];
    file.json.scenes![0].nodes = [0];
    applyOperations(file, [
      { op: "select_object", target: "Sphere" },
      { op: "delete_object", target: "Box" }
    ]);
    expect(selectedId(file.json)).toBeNull();
  });
});

describe("transforms", () => {
  it("keeps a tiny scale it was not asked to change", () => {
    const file = build(["box"]);
    applyOperations(file, [
      { op: "set_transform", target: "Box", scale: [1e-7, 1e-7, 1e-7] },
      { op: "set_transform", target: "Box", position: [1, 0, 0] }
    ]);
    expect(file.json.nodes![0].scale).toEqual([1e-7, 1e-7, 1e-7]);
  });

  it("decomposes a matrix with a zero scale axis to its real rotation", () => {
    // 90° about Y with the Y axis scaled to 0.
    const m = [0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1];
    const { rotation, scale } = decomposeMatrix(m);
    expect(scale).toEqual([1, 0, 1]);
    const half = Math.SQRT1_2;
    expect(rotation[0]).toBeCloseTo(0, 6);
    expect(Math.abs(rotation[1])).toBeCloseTo(half, 6);
    expect(rotation[2]).toBeCloseTo(0, 6);
    expect(Math.abs(rotation[3])).toBeCloseTo(half, 6);
    expect(Math.sign(rotation[1])).toBe(Math.sign(rotation[3]));
  });

  it("decomposes an all-zero matrix to the identity rotation", () => {
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 1];
    expect(decomposeMatrix(m).rotation).toEqual([0, 0, 0, 1]);
  });
});

describe("names", () => {
  it("addresses an imported name with stray whitespace", () => {
    const file = createModel3DFile();
    file.json.nodes = [{ name: " Cube" }];
    file.json.scenes = [{ nodes: [0] }];
    expect(resolveTarget(file.json, "cube")).toBe(0);
  });

  it("does not warn about duplicate names for unnamed nodes", () => {
    const file = createModel3DFile();
    file.json.nodes = [{}, {}];
    file.json.scenes = [{ nodes: [0, 1] }];
    const report = validateModel3D(file.json);
    expect(report.warnings.some((w) => /are named/.test(w.message))).toBe(false);
  });
});

describe("validateModel3D on malformed input", () => {
  const base = (): GltfJson => ({ asset: { version: "2.0" }, scenes: [{ nodes: [] }] });

  it.each([
    ["a non-array children list", { ...base(), nodes: [{ children: 1 }] }],
    ["a null node", { ...base(), nodes: [null] }],
    ["an object as a scene's node list", { asset: { version: "2.0" }, scenes: [{ nodes: {} }] }],
    [
      "an accessor without a type",
      {
        ...base(),
        buffers: [{ byteLength: 4 }],
        bufferViews: [{ buffer: 0, byteLength: 4 }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 1 }]
      }
    ]
  ])("reports %s instead of throwing", (_label, json) => {
    const report = validateModel3D(json as unknown as GltfJson);
    expect(report.ok).toBe(false);
  });
});
