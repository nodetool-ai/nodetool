import { describe, expect, it } from "vitest";

import {
  applyOperations,
  createModel3DFile,
  deleteObject,
  ensureObjectIds,
  eulerDegreesToQuaternion,
  hexToLinearRgb,
  linearRgbToHex,
  listScene,
  Model3DOperationError,
  parseModel3D,
  quaternionToEulerDegrees,
  renameObject,
  sceneBounds,
  selectedId,
  serializeModel3D,
  setMaterialColor,
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

describe("primitives", () => {
  it("adds every primitive kind as a valid glTF document", () => {
    const file = build([
      "box",
      "sphere",
      "plane",
      "cylinder",
      "torus",
      "directionalLight",
      "pointLight"
    ]);
    const report = validateModel3D(file.json);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.objectCount).toBe(7);
    expect(listScene(file.json).map((o) => o.type)).toEqual([
      "Mesh",
      "Mesh",
      "Mesh",
      "Mesh",
      "Mesh",
      "DirectionalLight",
      "PointLight"
    ]);
  });

  it("names duplicates apart, the way the editor does", () => {
    const file = build(["box", "box", "box"]);
    expect(listScene(file.json).map((o) => o.name)).toEqual([
      "Box",
      "Box 2",
      "Box 3"
    ]);
  });

  it("tips the plane onto the ground plane", () => {
    const file = build(["plane"]);
    expect(listScene(file.json)[0].rotation[0]).toBeCloseTo(-90, 6);
  });

  it("reports the scene's world-space bounds", () => {
    const file = build(["box"]);
    applyOperations(file, [
      { op: "set_transform", target: "Box", position: [2, 0, 0], scale: [2, 2, 2] }
    ]);
    const bounds = sceneBounds(file.json);
    expect(bounds).not.toBeNull();
    expect(bounds?.min).toEqual([1, -1, -1]);
    expect(bounds?.max).toEqual([3, 1, 1]);
    expect(bounds?.size).toEqual([2, 2, 2]);
  });

  it("has no bounds for a scene of lights alone", () => {
    expect(sceneBounds(build(["pointLight"]).json)).toBeNull();
  });
});

describe("transforms", () => {
  it("round-trips Euler degrees through the stored quaternion", () => {
    for (const euler of [
      [0, 0, 0],
      [45, 0, 0],
      [0, 30, 0],
      [10, -20, 35],
      [-90, 0, 0]
    ] as [number, number, number][]) {
      const back = quaternionToEulerDegrees(eulerDegreesToQuaternion(euler));
      back.forEach((value, axis) => expect(value).toBeCloseTo(euler[axis], 5));
    }
  });

  it("rebuilds every rotation on a swept Euler grid, both poles included", () => {
    // At pitch = +/-90 roll and yaw are one degree of freedom, so the reader
    // pins yaw to 0 and the triple it returns is not the one it was given.
    // Compare the rotations instead — and a quaternion and its negation are the
    // same rotation. The tolerance is what asin delivers next to +/-1, where
    // its slope is infinite; a wrong pole costs a radian, not an epsilon.
    const grid = [-180, -135, -90, -45, -10, 0, 10, 45, 90, 135, 180];
    for (const rx of grid) {
      for (const ry of grid) {
        for (const rz of grid) {
          const q = eulerDegreesToQuaternion([rx, ry, rz]);
          const rebuilt = eulerDegreesToQuaternion(quaternionToEulerDegrees(q));
          const same = rebuilt.every((v, i) => Math.abs(v - q[i]) < 1e-6);
          const negated = rebuilt.every((v, i) => Math.abs(v + q[i]) < 1e-6);
          expect(same || negated, `[${rx}, ${ry}, ${rz}]`).toBe(true);
        }
      }
    }
  });

  it("reads back a negative-pitch rotation it was given", () => {
    const file = build(["box"]);
    applyOperations(file, [
      { op: "set_transform", target: "Box", rotation: [30, -90, 0] }
    ]);
    const object = listScene(file.json)[0];
    expect(object.rotation[0]).toBeCloseTo(30, 5);
    expect(object.rotation[1]).toBeCloseTo(-90, 5);
    expect(object.rotation[2]).toBeCloseTo(0, 5);
  });

  it("applies a partial patch and leaves the rest alone", () => {
    const file = build(["box"]);
    applyOperations(file, [
      { op: "set_transform", target: "Box", position: [1, 2, 3] }
    ]);
    applyOperations(file, [
      { op: "set_transform", target: "Box", rotation: [0, 90, 0] }
    ]);
    const object = listScene(file.json)[0];
    expect(object.position).toEqual([1, 2, 3]);
    expect(object.rotation[1]).toBeCloseTo(90, 5);
    expect(object.scale).toEqual([1, 1, 1]);
  });

  it("refuses a non-finite transform", () => {
    const file = build(["box"]);
    expect(() =>
      applyOperations(file, [
        { op: "set_transform", target: "Box", position: [Number.NaN, 0, 0] }
      ])
    ).toThrow(Model3DOperationError);
  });

  it("replaces a matrix node's matrix with the TRS it edited", () => {
    const file = build(["box"]);
    const node = file.json.nodes![0];
    delete node.translation;
    delete node.rotation;
    delete node.scale;
    node.matrix = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 5, 0, 0, 1];
    expect(listScene(file.json)[0].position).toEqual([5, 0, 0]);
    expect(listScene(file.json)[0].scale).toEqual([2, 2, 2]);

    applyOperations(file, [
      { op: "set_transform", target: "Box", position: [0, 1, 0] }
    ]);
    expect(file.json.nodes![0].matrix).toBeUndefined();
    expect(listScene(file.json)[0].scale).toEqual([2, 2, 2]);
  });
});

describe("addressing and selection", () => {
  it("resolves a target by uuid or case-insensitive name", () => {
    const file = build(["box"]);
    const [object] = listScene(file.json);
    expect(
      applyOperations(file, [{ op: "select_object", target: object.uuid }])[0]
        .object?.uuid
    ).toBe(object.uuid);
    expect(
      applyOperations(file, [{ op: "select_object", target: "bOx" }])[0].object
        ?.uuid
    ).toBe(object.uuid);
    expect(selectedId(file.json)).toBe(object.uuid);
  });

  it("clears the selection with null", () => {
    const file = build(["box"]);
    applyOperations(file, [{ op: "select_object", target: null }]);
    expect(selectedId(file.json)).toBeNull();
  });

  it("names the missing target", () => {
    const file = build(["box"]);
    expect(() =>
      applyOperations(file, [{ op: "delete_object", target: "Ghost" }])
    ).toThrow(/No object found matching "Ghost"/);
  });

  it("keeps an id pointing at the same object after a delete renumbers nodes", () => {
    const file = build(["box", "sphere", "torus"]);
    const before = listScene(file.json);
    const torusId = before[2].uuid;
    applyOperations(file, [{ op: "delete_object", target: "Box" }]);
    const after = listScene(file.json);
    expect(after.map((o) => o.name)).toEqual(["Sphere", "Torus"]);
    expect(after.find((o) => o.uuid === torusId)?.name).toBe("Torus");
  });
});

describe("ensureObjectIds", () => {
  const doc = (extrasList: unknown[]): GltfJson =>
    ({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: extrasList.map((_, i) => i) }],
      nodes: extrasList.map((extras, i) => ({ name: `n${i}`, extras }))
    }) as GltfJson;

  const idsOf = (json: GltfJson) =>
    (json.nodes ?? []).map((node) => node.extras?.["nodetool_id"]);

  it("re-mints a repeated id so one id never addresses two objects", () => {
    // A .glb that left NodeTool and came back with an object duplicated
    // carries the same nodetool_id twice.
    const json = doc([{ nodetool_id: "obj_1" }, { nodetool_id: "obj_1" }]);
    ensureObjectIds(json);
    expect(idsOf(json)).toEqual(["obj_1", "obj_2"]);
  });

  it("leaves the second of a duplicate pair addressable", () => {
    const json = doc([{ nodetool_id: "obj_1" }, { nodetool_id: "obj_1" }]);
    // Every mutation calls ensureObjectIds first; renameObject is one.
    renameObject(json, "obj_1", "First");
    const listing = listScene(json);
    expect(new Set(listing.map((o) => o.uuid)).size).toBe(2);

    // While both nodes answered to "obj_1" the second was unreachable: every
    // edit landed on the first, and deleting it twice emptied the scene.
    renameObject(json, listing[1].uuid, "Second");
    expect((json.nodes ?? []).map((n) => n.name)).toEqual(["First", "Second"]);
  });

  it("keeps an id a caller already holds, and mints past the ones in use", () => {
    const json = doc([
      { nodetool_id: "obj_2" },
      {},
      { nodetool_id: "hero" },
      undefined
    ]);
    ensureObjectIds(json);
    expect(idsOf(json)).toEqual(["obj_2", "obj_1", "hero", "obj_3"]);
  });

  it("mints an id wherever the document carries no usable one", () => {
    const json = doc([
      { nodetool_id: "" },
      { nodetool_id: 5 },
      "not-a-record",
      undefined
    ]);
    ensureObjectIds(json);
    expect(idsOf(json)).toEqual(["obj_1", "obj_2", "obj_3", "obj_4"]);
  });

  it("assigns distinct non-empty ids and is idempotent", () => {
    const json = doc([
      { nodetool_id: "obj_1" },
      { nodetool_id: "obj_1" },
      { nodetool_id: "" },
      undefined,
      { nodetool_id: "x" }
    ]);
    ensureObjectIds(json);
    const first = idsOf(json);
    expect(first.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true
    );
    expect(new Set(first).size).toBe(first.length);
    ensureObjectIds(json);
    expect(idsOf(json)).toEqual(first);
  });

  it("does nothing to a document with no nodes", () => {
    const json = { asset: { version: "2.0" } } as GltfJson;
    ensureObjectIds(json);
    expect(json.nodes).toEqual([]);
  });
});

describe("delete", () => {
  it("removes descendants and remaps every node reference", () => {
    const file = build(["box", "sphere", "torus"]);
    file.json.nodes![0].children = [1];
    file.json.scenes![0].nodes = [0, 2];
    file.json.animations = [
      {
        channels: [
          { sampler: 0, target: { node: 1, path: "translation" } },
          { sampler: 0, target: { node: 2, path: "translation" } }
        ],
        samplers: [{}]
      }
    ];

    deleteObject(file.json, "Box");

    expect(file.json.nodes).toHaveLength(1);
    expect(file.json.nodes![0].name).toBe("Torus");
    expect(file.json.scenes![0].nodes).toEqual([0]);
    expect(file.json.animations[0].channels).toEqual([
      { sampler: 0, target: { node: 0, path: "translation" } }
    ]);
    expect(validateModel3D(file.json).errors).toEqual([]);
  });
});

describe("materials", () => {
  it("converts hex to a linear factor and back", () => {
    for (const hex of ["#000000", "#ffffff", "#ff8800", "#3366cc"]) {
      expect(linearRgbToHex(hexToLinearRgb(hex)!)).toBe(hex);
    }
    expect(hexToLinearRgb("not-a-color")).toBeNull();
  });

  it("recolors one mesh without repainting a shared material", () => {
    const file = build(["box", "sphere"]);
    // Point both meshes at material 0, the way an imported model often does.
    file.json.meshes![1].primitives[0].material = 0;

    setMaterialColor(file.json, "Box", "#ff0000");

    const objects = listScene(file.json);
    expect(objects[0].materialColor).toBe("#ff0000");
    expect(objects[1].materialColor).not.toBe("#ff0000");
    expect(validateModel3D(file.json).errors).toEqual([]);
  });

  it("refuses a color on a light, and a malformed color anywhere", () => {
    const file = build(["box", "pointLight"]);
    expect(() =>
      applyOperations(file, [
        { op: "set_material_color", target: "Point Light", color: "#ff0000" }
      ])
    ).toThrow(/has no material/);
    expect(() =>
      applyOperations(file, [
        { op: "set_material_color", target: "Box", color: "red" }
      ])
    ).toThrow(/CSS hex/);
  });
});

describe("visibility", () => {
  it("hides and re-shows an object", () => {
    const file = build(["box"]);
    applyOperations(file, [
      { op: "set_visibility", target: "Box", visible: false }
    ]);
    expect(listScene(file.json)[0].visible).toBe(false);
    applyOperations(file, [
      { op: "set_visibility", target: "Box", visible: true }
    ]);
    expect(listScene(file.json)[0].visible).toBe(true);
  });
});

describe("containers", () => {
  it("round-trips a .gltf document through serialize and parse", () => {
    const file = build(["box", "pointLight"]);
    const reparsed = parseModel3D(serializeModel3D(file));
    expect(reparsed.format).toBe("gltf");
    expect(listScene(reparsed.json)).toEqual(listScene(file.json));
  });

  it("round-trips a .glb document, keeping its binary chunk", () => {
    const file = build(["box"]);
    const glb = { ...file, format: "glb" as const, bin: new Uint8Array([1, 2, 3, 4]) };
    const reparsed = parseModel3D(serializeModel3D(glb));
    expect(reparsed.format).toBe("glb");
    expect(reparsed.bin?.slice(0, 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(listScene(reparsed.json).map((o) => o.name)).toEqual(["Box"]);
  });

  it("rejects bytes that are not glTF", () => {
    expect(() => parseModel3D(new TextEncoder().encode("hello"))).toThrow(
      /Not a glTF document/
    );
    expect(() => parseModel3D(new TextEncoder().encode('{"nodes":[]}'))).toThrow(
      /asset.version/
    );
  });
});
