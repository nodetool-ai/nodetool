import { describe, expect, it } from "vitest";

import {
  animationDurations,
  applyOperations,
  createModel3DFile,
  deleteObject,
  setTransform,
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

describe("ids that collide in the stored file", () => {
  it("addresses the object the listing showed, when a stored id equals another's fallback", () => {
    // What the editor saves after a duplicate: the copy carries no id, and
    // later nodes carry ids minted as node-<index> before the copy existed.
    const json: GltfJson = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2, 3] }],
      nodes: [
        { name: "A", extras: { nodetool_id: "node-0" } },
        { name: "A 2" },
        { name: "B", extras: { nodetool_id: "node-1" } },
        { name: "C", extras: { nodetool_id: "node-2" } }
      ]
    };
    const listed = listScene(json);
    expect(new Set(listed.map((o) => o.uuid)).size).toBe(4);
    const copyId = listed.find((o) => o.name === "A 2")!.uuid;
    expect(setTransform(json, copyId, { position: [5, 0, 0] }).name).toBe("A 2");
    expect(listScene(json).find((o) => o.name === "A 2")!.uuid).toBe(copyId);
  });

  it("lists a repeated stored id once and keeps it on the first node", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: "X", extras: { nodetool_id: "abc" } },
        { name: "Y", extras: { nodetool_id: "abc" } }
      ]
    };
    const [x, y] = listScene(json);
    expect(x.uuid).toBe("abc");
    expect(y.uuid).not.toBe("abc");
    expect(resolveTarget(json, y.uuid)).toBe(1);
  });
});

describe("delete and animations", () => {
  it("remaps a KHR_animation_pointer target and drops one aimed at the deleted node", () => {
    const pointerTo = (pointer: string) => ({
      sampler: 0,
      target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } }
    });
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0, 1, 2] }],
      nodes: [{ name: "Doomed" }, { name: "Kept" }, { name: "Last" }],
      accessors: [{ componentType: 5126, count: 1, type: "SCALAR", max: [1] }],
      animations: [
        {
          channels: [pointerTo("/nodes/2/translation"), pointerTo("/nodes/0/scale")],
          samplers: [{ input: 0, output: 0 }]
        }
      ]
    };
    deleteObject(json, "Doomed");
    const channels = json.animations![0].channels;
    expect(channels).toHaveLength(1);
    expect(channels[0].target.extensions).toEqual({
      KHR_animation_pointer: { pointer: "/nodes/1/translation" }
    });
  });

  it("measures a clip by the samplers its remaining channels play", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0, 1] }],
      nodes: [{ name: "Keep" }, { name: "Gone" }],
      accessors: [
        { componentType: 5126, count: 2, type: "SCALAR", max: [1] },
        { componentType: 5126, count: 2, type: "SCALAR", max: [5] },
        { componentType: 5126, count: 2, type: "VEC3" }
      ],
      animations: [
        {
          name: "Walk",
          channels: [
            { sampler: 0, target: { node: 0, path: "translation" } },
            { sampler: 1, target: { node: 1, path: "translation" } }
          ],
          samplers: [
            { input: 0, output: 2 },
            { input: 1, output: 2 }
          ]
        }
      ]
    };
    expect(animationDurations(json)[0].durationSec).toBe(5);
    deleteObject(json, "Gone");
    expect(animationDurations(json)[0].durationSec).toBe(1);
  });
});

describe("new names", () => {
  it("does not reuse a name an existing node holds with stray spaces", () => {
    const file = createModel3DFile();
    file.json.nodes = [{ name: "Box " }];
    file.json.scenes = [{ nodes: [0] }];
    applyOperations(file, [{ op: "add_object", kind: "box" }]);
    const added = file.json.nodes![1].name!;
    expect(added).not.toBe("Box");
    expect(resolveTarget(file.json, added)).toBe(1);
  });
});

describe("validateModel3D structure checks", () => {
  const base = (): GltfJson => ({ asset: { version: "2.0" }, scenes: [{ nodes: [0] }] });

  it("reports a child listed twice under one parent", () => {
    const json = { ...base(), nodes: [{ children: [1, 1] }, {}] };
    expect(validateModel3D(json).errors.some((e) => /twice/.test(e.message))).toBe(true);
  });

  it("reports attributes of different lengths and an empty accessor", () => {
    const json: GltfJson = {
      ...base(),
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 } }] }],
      accessors: [
        { componentType: 5126, count: 2, type: "VEC3" },
        { componentType: 5126, count: 1, type: "VEC3" },
        { componentType: 5126, count: 0, type: "VEC2" }
      ]
    };
    const messages = validateModel3D(json).errors.map((e) => e.message);
    expect(messages.some((m) => /different lengths/.test(m))).toBe(true);
    expect(messages.some((m) => /count is 0/.test(m))).toBe(true);
  });
});
