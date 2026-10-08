import { describe, expect, it } from "vitest";

import {
  applyOperations,
  createModel3DFile,
  deleteObject,
  emptyGltf,
  listScene,
  Model3DParseError,
  parseModel3D,
  quaternionToEulerDegrees,
  renameObject,
  sceneBounds,
  serializeModel3D,
  setMaterialColor,
  setTransform,
  setVisibility,
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

const errorsOf = (json: GltfJson): string[] =>
  validateModel3D(json).errors.map((issue) => issue.message);

describe("validateModel3D reads without changing or crashing", () => {
  it("reports a document with an empty scenes list instead of throwing", () => {
    const json: GltfJson = { asset: { version: "2.0" }, scenes: [], nodes: [{ name: "A" }] };
    expect(() => validateModel3D(json)).not.toThrow();
    expect(validateModel3D(json).objectCount).toBe(1);
  });

  it("leaves the document it checks untouched", () => {
    const json: GltfJson = { asset: { version: "2.0" } };
    const before = JSON.stringify(json);
    validateModel3D(json);
    listScene(json);
    expect(JSON.stringify(json)).toBe(before);
  });

  it("walks a 20,000-node chain without overflowing the stack", () => {
    const count = 20_000;
    const nodes = Array.from({ length: count }, (_, i) =>
      i + 1 < count ? { children: [i + 1] } : {}
    );
    const json: GltfJson = { asset: { version: "2.0" }, scenes: [{ nodes: [0] }], nodes };
    expect(validateModel3D(json).objectCount).toBe(count);
    expect(listScene(json)).toHaveLength(count);
  });

  it("finds a cycle in a 20,000-node chain without overflowing the stack", () => {
    const count = 20_000;
    const nodes = Array.from({ length: count }, (_, i) => ({ children: [(i + 1) % count] }));
    const json: GltfJson = { asset: { version: "2.0" }, scenes: [{ nodes: [0] }], nodes };
    expect(errorsOf(json).some((m) => m.includes("cycle"))).toBe(true);
  });
});

describe("validateModel3D catches structural errors", () => {
  const base = (): GltfJson => ({
    asset: { version: "2.0" },
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: "A", children: [2] }, { name: "B", children: [2] }, { name: "C" }]
  });

  it("rejects a node with two parents", () => {
    expect(errorsOf(base()).some((m) => m.includes("two parents") || m.includes("more than one parent"))).toBe(true);
  });

  it("rejects out-of-range skin and camera indices", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "A", skin: 3, camera: 1 }]
    };
    const errors = errorsOf(json);
    expect(errors.some((m) => m.includes("skin 3"))).toBe(true);
    expect(errors.some((m) => m.includes("camera 1"))).toBe(true);
  });

  it("rejects an animation channel aimed at a missing node or sampler", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "A" }],
      animations: [
        {
          channels: [
            { sampler: 0, target: { node: 9, path: "translation" } },
            { sampler: 4, target: { node: 0, path: "translation" } }
          ],
          samplers: [{ input: 0, output: 0 }]
        }
      ]
    };
    const errors = errorsOf(json);
    expect(errors.some((m) => m.includes("node 9"))).toBe(true);
    expect(errors.some((m) => m.includes("sampler 4"))).toBe(true);
  });

  it("rejects an accessor that reads past its buffer view and a bogus accessor type", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      buffers: [{ byteLength: 12 }],
      bufferViews: [{ buffer: 0, byteLength: 12 }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 2, type: "VEC3" },
        { bufferView: 0, componentType: 5126, count: 1, type: "VEC7" }
      ]
    };
    const errors = errorsOf(json);
    expect(errors.some((m) => m.includes("accessors[0]") && m.includes("past"))).toBe(true);
    expect(errors.some((m) => m.includes("VEC7"))).toBe(true);
  });
});

describe("transforms and addressing", () => {
  it("reads a non-unit quaternion as the rotation it stands for", () => {
    const euler = quaternionToEulerDegrees([1, 0, 0, 1]);
    expect(euler[0]).toBeCloseTo(90, 6);
  });

  it("keeps the rotation of a non-unit quaternion when only position changes", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "A", rotation: [1, 0, 0, 1] }]
    };
    const result = setTransform(json, "A", { position: [1, 0, 0] });
    expect(result.rotation[0]).toBeCloseTo(90, 5);
  });

  it("keeps listed ids working after the first edit", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0, 1] }],
      nodes: [{ name: "A" }, { name: "B" }]
    };
    const [, b] = listScene(json);
    renameObject(json, "A", "Alpha");
    expect(() => setTransform(json, b.uuid, { position: [0, 1, 0] })).not.toThrow();
    expect(listScene(json)[1].uuid).toBe(b.uuid);
  });

  it("does not hand out a name that differs only in case", () => {
    const file = createModel3DFile();
    applyOperations(file, [
      { op: "add_object", kind: "box", name: "Crate" },
      { op: "add_object", kind: "box", name: "crate" }
    ]);
    const names = listScene(file.json).map((o) => o.name);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(2);
  });
});

describe("bounds and materials", () => {
  it("rotates the mesh box into world space", () => {
    // The default plane lies flat, rotated -90 degrees about X.
    const bounds = sceneBounds(build(["plane"]).json);
    expect(bounds?.size[1]).toBeCloseTo(0, 6);
    expect(bounds?.size[2]).toBeCloseTo(2, 6);
  });

  it("recolors one node without repainting another node that shares its mesh", () => {
    const file = build(["box"]);
    const json = file.json;
    json.nodes?.push({ name: "Twin", mesh: 0 });
    json.scenes?.[0].nodes?.push(1);
    setMaterialColor(json, "Twin", "#ff0000");
    const [box, twin] = listScene(json);
    expect(twin.materialColor).toBe("#ff0000");
    expect(box.materialColor).not.toBe("#ff0000");
  });
});

describe("delete keeps the document valid", () => {
  it("drops animations and skins it emptied", () => {
    const json: GltfJson = {
      ...emptyGltf(),
      scenes: [{ nodes: [0, 1] }],
      nodes: [{ name: "Bone" }, { name: "Body", skin: 0 }],
      skins: [{ joints: [0] }],
      animations: [
        {
          channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }],
          samplers: [{ input: 0, output: 0 }]
        }
      ]
    };
    deleteObject(json, "Bone");
    expect(json.animations ?? []).toHaveLength(0);
    expect(json.skins ?? []).toHaveLength(0);
    expect(json.nodes?.[0].skin).toBeUndefined();
    expect(validateModel3D(json).ok).toBe(true);
  });
});

describe("GLB parsing", () => {
  const glbOf = (jsonText: string): Uint8Array => {
    const file = parseModel3D(serializeModel3D({ json: emptyGltf(), bin: null, format: "glb" }));
    const bytes = serializeModel3D(file);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunkLength = view.getUint32(12, true);
    const text = new TextEncoder().encode(jsonText.padEnd(chunkLength, " "));
    if (text.length !== chunkLength) {
      throw new Error("test JSON longer than the chunk");
    }
    const out = bytes.slice();
    out.set(text, 20);
    return out;
  };

  it("reports a broken JSON chunk as a parse error", () => {
    expect(() => parseModel3D(glbOf("{ not json"))).toThrow(Model3DParseError);
  });

  it("rejects a GLB whose JSON has no asset.version", () => {
    expect(() => parseModel3D(glbOf('{"scenes":[]}'))).toThrow(Model3DParseError);
  });

  it("rejects a GLB whose header length disagrees with its size", () => {
    const bytes = serializeModel3D({ json: emptyGltf(), bin: null, format: "glb" });
    const truncated = bytes.slice(0, bytes.length - 4);
    expect(() => parseModel3D(truncated)).toThrow(Model3DParseError);
  });
});

describe("visibility the browser editor saved", () => {
  it("reads an object the editor hid as hidden, and shows it again", () => {
    const json: GltfJson = {
      asset: { version: "2.0" },
      scenes: [{ nodes: [0] }],
      nodes: [{ name: "Pillar", extras: { nodetool_hidden: true } }]
    };
    expect(listScene(json)[0].visible).toBe(false);
    expect(setVisibility(json, "Pillar", true).visible).toBe(true);
  });
});
