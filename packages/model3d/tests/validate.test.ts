import { describe, expect, it } from "vitest";

import {
  applyOperations,
  createModel3DFile,
  validateModel3D,
  type GltfJson
} from "../src/index.js";

const lit = (): GltfJson => {
  const file = createModel3DFile();
  applyOperations(file, [
    { op: "add_object", kind: "box" },
    { op: "add_object", kind: "directionalLight" }
  ]);
  return file.json;
};

const messages = (json: GltfJson): string[] =>
  validateModel3D(json).errors.map((issue) => issue.message);

describe("validateModel3D", () => {
  it("passes a scene the operations built", () => {
    const report = validateModel3D(lit());
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  // Each case breaks one thing in a document that was just proven clean, so a
  // check that examines nothing cannot pass this suite.
  it("catches a wrong glTF version", () => {
    const json = lit();
    json.asset.version = "1.0";
    expect(messages(json)[0]).toMatch(/glTF 2.0/);
  });

  it("catches a scene index nothing resolves", () => {
    const json = lit();
    json.scene = 7;
    expect(messages(json)[0]).toMatch(/scene is 7/);
  });

  it("catches a dangling node, mesh, accessor, material and buffer reference", () => {
    const dangling: [string, (json: GltfJson) => void, RegExp][] = [
      ["scene node", (json) => json.scenes![0].nodes!.push(99), /lists node 99/],
      ["child", (json) => (json.nodes![0].children = [99]), /has child 99/],
      ["mesh", (json) => (json.nodes![0].mesh = 99), /references mesh 99/],
      [
        "attribute accessor",
        (json) => (json.meshes![0].primitives[0].attributes.POSITION = 99),
        /reads accessor 99/
      ],
      [
        "material",
        (json) => (json.meshes![0].primitives[0].material = 99),
        /material is 99/
      ],
      [
        "bufferView buffer",
        (json) => (json.bufferViews![0].buffer = 99),
        /reads buffer 99/
      ],
      [
        "light",
        (json) => {
          const ext = json.nodes![1].extensions!["KHR_lights_punctual"] as {
            light: number;
          };
          ext.light = 99;
        },
        /references light 99/
      ]
    ];
    for (const [label, breakIt, pattern] of dangling) {
      const json = lit();
      breakIt(json);
      expect(messages(json).join("\n"), label).toMatch(pattern);
    }
  });

  it("catches a cycle in the node hierarchy", () => {
    const json = lit();
    json.nodes![0].children = [1];
    json.nodes![1].children = [0];
    expect(messages(json).join("\n")).toMatch(/cycle/);
  });

  it("catches a matrix alongside TRS fields, and a malformed one", () => {
    const both = lit();
    both.nodes![0].matrix = new Array(16).fill(0);
    expect(messages(both).join("\n")).toMatch(/both a matrix and TRS/);

    const short = lit();
    delete short.nodes![0].translation;
    delete short.nodes![0].rotation;
    delete short.nodes![0].scale;
    short.nodes![0].matrix = [1, 2, 3];
    expect(messages(short).join("\n")).toMatch(/16 numbers/);
  });

  it("catches a buffer view that reads past its buffer", () => {
    const json = lit();
    json.bufferViews![0].byteLength = 10_000_000;
    expect(messages(json).join("\n")).toMatch(/reads to byte/);
  });

  it("catches an extension the build cannot honor", () => {
    const json = lit();
    json.extensionsRequired = ["KHR_draco_mesh_compression"];
    expect(messages(json)[0]).toMatch(/KHR_draco_mesh_compression/);
  });

  it("warns about an empty scene, an unlit one, and duplicate names", () => {
    const empty = createModel3DFile().json;
    expect(validateModel3D(empty).warnings[0].message).toMatch(/empty/);

    const unlitFile = createModel3DFile();
    applyOperations(unlitFile, [{ op: "add_object", kind: "box" }]);
    expect(validateModel3D(unlitFile.json).warnings[0].message).toMatch(/no light/);

    const duplicate = lit();
    duplicate.nodes![1].name = "Box";
    expect(
      validateModel3D(duplicate).warnings.map((w) => w.message).join("\n")
    ).toMatch(/2 objects are named "box"/);
  });
});
