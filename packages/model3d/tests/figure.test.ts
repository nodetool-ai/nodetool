import { describe, expect, it } from "vitest";

import {
  applyOperations,
  base64Encode,
  buildFigure,
  createModel3DFile,
  figureBounds,
  FIGURE_BODIES,
  FIGURE_DEFAULT_HEIGHT,
  FIGURE_JOINTS,
  FIGURE_POSES,
  listScene,
  Model3DOperationError,
  parseModel3D,
  parseOperation,
  sceneBounds,
  serializeModel3D,
  validateModel3D,
  type FigureBody,
  type FigurePose,
  type GltfJson,
  type Model3DFile,
  type Model3DOperation
} from "../src/index.js";

const fresh = (ops: Model3DOperation[] = []): Model3DFile => {
  const file = createModel3DFile();
  applyOperations(file, ops);
  return file;
};

const partNodes = (json: GltfJson) =>
  (json.nodes ?? []).filter((node) => node.extras?.["nodetool_figure_part"] !== undefined);

describe("buildFigure", () => {
  const cases = FIGURE_BODIES.flatMap((body) =>
    FIGURE_POSES.map((pose) => [body, pose] as [FigureBody, FigurePose])
  );

  it.each(cases)("%s %s rests on the ground", (body, pose) => {
    const { parts } = buildFigure(body, pose);
    const { min } = figureBounds(parts);
    expect(min[1]).toBeCloseTo(0, 5);
  });

  it.each(FIGURE_BODIES)("%s stands at its default height", (body) => {
    const { max, min } = figureBounds(buildFigure(body, "stand").parts);
    expect(max[1] - min[1]).toBeCloseTo(FIGURE_DEFAULT_HEIGHT[body], 2);
  });

  it("stands at a requested height", () => {
    const { max } = figureBounds(buildFigure("male", "stand", 2.1).parts);
    expect(max[1]).toBeCloseTo(2.1, 2);
  });

  it("orders the bodies by height: male, female, child", () => {
    const top = (body: FigureBody) => figureBounds(buildFigure(body).parts).max[1];
    expect(top("male")).toBeGreaterThan(top("female"));
    expect(top("female")).toBeGreaterThan(top("child"));
  });

  it("has every joint once, each parent listed before its children", () => {
    const { parts } = buildFigure();
    expect(parts.map((part) => part.joint)).toEqual([...FIGURE_JOINTS]);
    const seen = new Set<string>();
    for (const part of parts) {
      if (part.parent === null) {
        expect(part.joint).toBe("pelvis");
      } else {
        expect(seen.has(part.parent)).toBe(true);
      }
      seen.add(part.joint);
    }
  });

  it("hangs the limbs from the right pivots", () => {
    const { parts } = buildFigure("male", "stand");
    const of = (joint: string) => parts.find((part) => part.joint === joint)!;
    expect(of("lowerLegL").parent).toBe("upperLegL");
    expect(of("footL").parent).toBe("lowerLegL");
    expect(of("handR").parent).toBe("lowerArmR");
    expect(of("head").parent).toBe("torso");
    // Left is +X when the figure faces +Z.
    expect(of("upperArmL").translation[0]).toBeGreaterThan(0);
    expect(of("upperArmR").translation[0]).toBeLessThan(0);
    // A limb's mesh hangs below its pivot.
    const thigh = of("upperLegL").geometry.positions;
    let lowest = Infinity;
    for (let i = 1; i < thigh.length; i += 3) {
      lowest = Math.min(lowest, thigh[i]);
    }
    expect(lowest).toBeLessThan(-0.3);
  });

  it("faces +Z: the feet point forward", () => {
    const { parts } = buildFigure("male", "stand");
    const foot = parts.find((part) => part.joint === "footL")!.geometry.positions;
    let front = -Infinity;
    let back = Infinity;
    for (let i = 2; i < foot.length; i += 3) {
      front = Math.max(front, foot[i]);
      back = Math.min(back, foot[i]);
    }
    expect(front).toBeGreaterThan(-back * 2);
  });

  it.each(FIGURE_POSES.filter((pose) => pose !== "stand"))(
    "%s differs from stand",
    (pose) => {
      const rotations = (p: FigurePose) =>
        JSON.stringify(buildFigure("male", p).parts.map((part) => part.rotation));
      expect(rotations(pose)).not.toBe(rotations("stand"));
    }
  );

  it("sits lower than it stands and lies lower still", () => {
    const top = (pose: FigurePose) => figureBounds(buildFigure("male", pose).parts).max[1];
    expect(top("sit")).toBeLessThan(top("stand") * 0.8);
    expect(top("sit")).toBeGreaterThan(top("stand") * 0.55);
    expect(top("lie")).toBeLessThan(0.4);
    const lying = figureBounds(buildFigure("male", "lie").parts);
    expect(lying.max[2] - lying.min[2]).toBeGreaterThan(1.6);
  });

  it("strides along Z when walking and running", () => {
    const depth = (pose: FigurePose) => {
      const { min, max } = figureBounds(buildFigure("male", pose).parts);
      return max[2] - min[2];
    };
    expect(depth("walk")).toBeGreaterThan(depth("stand") * 1.8);
    expect(depth("run")).toBeGreaterThan(depth("walk"));
  });

  it.each(FIGURE_BODIES)("%s stays well under 4k triangles", (body) => {
    const { triangleCount, parts } = buildFigure(body);
    expect(triangleCount).toBeLessThan(3000);
    expect(triangleCount).toBeGreaterThan(200);
    for (const part of parts) {
      const count = part.geometry.positions.length / 3;
      expect(part.geometry.normals.length).toBe(part.geometry.positions.length);
      for (const index of part.geometry.indices) {
        expect(index).toBeLessThan(count);
      }
      for (let i = 0; i < part.geometry.normals.length; i += 3) {
        const n = part.geometry.normals;
        expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 4);
      }
    }
  });
});

describe("figure operations", () => {
  it("parses the figure fields of add_object", () => {
    expect(
      parseOperation({
        op: "add_object",
        kind: "figure",
        name: "Hero",
        body: "female",
        pose: "walk",
        height: 1.7,
        color: "#ff8800",
        entityId: "abc",
        label: "Ana",
        position: [1, 0, 2]
      })
    ).toEqual({
      op: "add_object",
      kind: "figure",
      name: "Hero",
      body: "female",
      pose: "walk",
      height: 1.7,
      color: "#ff8800",
      entityId: "abc",
      label: "Ana",
      position: [1, 0, 2]
    });
  });

  it("rejects a bad body, a bad pose, and figure fields on another kind", () => {
    expect(() => parseOperation({ op: "add_object", kind: "figure", body: "robot" })).toThrow(
      /male, female, child/
    );
    expect(() => parseOperation({ op: "add_object", kind: "figure", pose: "jump" })).toThrow(
      /stand, sit, walk, run, lie/
    );
    expect(() => parseOperation({ op: "add_object", kind: "box", pose: "sit" })).toThrow(
      /kind "figure" only/
    );
    expect(() => parseOperation({ op: "set_figure", target: "Figure" })).toThrow(/at least one/);
    expect(() => fresh([{ op: "add_object", kind: "figure", height: 9 }])).toThrow(
      Model3DOperationError
    );
  });

  it("adds a figure as one object with its joints hidden from the listing", () => {
    const file = fresh([
      { op: "add_object", kind: "figure", body: "child", pose: "sit", entityId: "e1", label: "Kid" }
    ]);
    const objects = listScene(file.json);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({
      name: "Figure",
      type: "Figure",
      parentUuid: null,
      position: [0, 0, 0],
      materialColor: "#b8b8b8",
      figure: { body: "child", pose: "sit", height: 1.2, entityId: "e1", label: "Kid" }
    });
    expect(file.json.nodes).toHaveLength(1 + FIGURE_JOINTS.length);
    expect(partNodes(file.json)).toHaveLength(FIGURE_JOINTS.length);
    expect(file.json.nodes?.[0].extras?.["nodetool_figure"]).toEqual({
      body: "child",
      pose: "sit",
      height: 1.2,
      entityId: "e1",
      label: "Kid"
    });
    expect(file.json.materials).toHaveLength(1);
    expect(file.json.scenes?.[0].nodes).toEqual([0]);
  });

  it("validates, with feet on the ground and the right height in world space", () => {
    const file = fresh([
      { op: "add_object", kind: "figure", position: [2, 0, -1] },
      { op: "add_object", kind: "directionalLight" }
    ]);
    const report = validateModel3D(file.json);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.objectCount).toBe(2);
    const bounds = sceneBounds(file.json)!;
    expect(bounds.min[1]).toBeCloseTo(0, 4);
    expect(bounds.max[1]).toBeCloseTo(1.8, 2);
    expect(bounds.center[0]).toBeCloseTo(2, 1);
  });

  it("does not warn about joint names shared by two figures", () => {
    const file = fresh([
      { op: "add_object", kind: "figure" },
      { op: "add_object", kind: "figure" },
      { op: "add_object", kind: "pointLight" }
    ]);
    expect(listScene(file.json).map((object) => object.name)).toEqual([
      "Figure",
      "Figure 2",
      "Point Light"
    ]);
    expect(validateModel3D(file.json).warnings).toEqual([]);
  });

  it("does not address a joint by name or id", () => {
    const file = fresh([{ op: "add_object", kind: "figure" }]);
    expect(() => applyOperations(file, [{ op: "delete_object", target: "Head" }])).toThrow(
      /No object found/
    );
    const jointId = partNodes(file.json)[0].extras?.["nodetool_id"] as string;
    expect(() => applyOperations(file, [{ op: "delete_object", target: jointId }])).toThrow(
      /No object found/
    );
    // A joint's name stays free for other objects.
    applyOperations(file, [{ op: "add_object", kind: "sphere", name: "Head" }]);
    expect(listScene(file.json).map((object) => object.name)).toEqual(["Figure", "Head"]);
  });

  it("poses in place with set_figure", () => {
    const file = fresh([{ op: "add_object", kind: "figure" }]);
    const before = JSON.stringify(file.json.nodes);
    const buffers = file.json.buffers?.length;
    const [{ object }] = applyOperations(file, [
      { op: "set_figure", target: "Figure", pose: "run", label: "Runner" }
    ]);
    expect(object?.figure).toEqual({ body: "male", pose: "run", height: 1.8, label: "Runner" });
    expect(JSON.stringify(file.json.nodes)).not.toBe(before);
    expect(file.json.buffers).toHaveLength(buffers as number);
    expect(file.json.nodes).toHaveLength(1 + FIGURE_JOINTS.length);
    expect(sceneBounds(file.json)!.min[1]).toBeCloseTo(0, 4);
    expect(validateModel3D(file.json).errors).toEqual([]);
  });

  it("changes the body with set_figure and takes the new body's height", () => {
    const file = fresh([{ op: "add_object", kind: "figure", color: "#336699", label: "A" }]);
    const [{ object }] = applyOperations(file, [
      { op: "set_figure", target: "Figure", body: "child", label: null }
    ]);
    expect(object?.figure).toEqual({ body: "child", pose: "stand", height: 1.2 });
    expect(object?.materialColor).toBe("#336699");
    expect(sceneBounds(file.json)!.max[1]).toBeCloseTo(1.2, 2);
    expect(file.json.nodes).toHaveLength(1 + FIGURE_JOINTS.length);
    expect(validateModel3D(file.json).errors).toEqual([]);
  });

  it("refuses set_figure on another object", () => {
    const file = fresh([{ op: "add_object", kind: "box" }]);
    expect(() =>
      applyOperations(file, [{ op: "set_figure", target: "Box", pose: "sit" }])
    ).toThrow(/not a figure/);
  });

  it("recolors the whole figure and nothing else", () => {
    const file = fresh([
      { op: "add_object", kind: "figure" },
      { op: "add_object", kind: "figure" },
      { op: "set_material_color", target: "Figure", color: "#ff0000" }
    ]);
    const [first, second] = listScene(file.json);
    expect(first.materialColor).toBe("#ff0000");
    expect(second.materialColor).toBe("#b8b8b8");
    expect(file.json.materials).toHaveLength(2);
  });

  it("moves, renames and deletes as one object", () => {
    const file = fresh([
      { op: "add_object", kind: "figure" },
      { op: "add_object", kind: "box" },
      { op: "set_transform", target: "Figure", position: [3, 0, 0], rotation: [0, 90, 0] },
      { op: "rename_object", target: "Figure", name: "Ana" }
    ]);
    expect(listScene(file.json)[0]).toMatchObject({ name: "Ana", position: [3, 0, 0] });
    applyOperations(file, [{ op: "delete_object", target: "Ana" }]);
    expect(listScene(file.json).map((object) => object.name)).toEqual(["Box"]);
    expect(file.json.nodes).toHaveLength(1);
    expect(validateModel3D(file.json).errors).toEqual([]);
  });

  it("survives a round trip through the GLB writer", () => {
    const file = fresh([
      { op: "add_object", kind: "figure", body: "female", pose: "walk", entityId: "e9" }
    ]);
    const glb: Model3DFile = { json: file.json, bin: null, format: "glb" };
    const back = parseModel3D(serializeModel3D(glb));
    expect(back.format).toBe("glb");
    expect(listScene(back.json)).toEqual(listScene(file.json));
    expect(sceneBounds(back.json)).toEqual(sceneBounds(file.json));
    expect(validateModel3D(back.json).errors).toEqual([]);
    applyOperations(back, [{ op: "set_figure", target: "Figure", pose: "sit" }]);
    expect(listScene(back.json)[0].figure?.pose).toBe("sit");
    // And as .gltf text.
    const text = parseModel3D(serializeModel3D(file));
    expect(listScene(text.json)).toEqual(listScene(file.json));
  });

  it("packs every joint's geometry into one buffer the accessors stay inside", () => {
    const file = fresh([{ op: "add_object", kind: "figure" }]);
    expect(file.json.buffers).toHaveLength(1);
    expect(file.json.bufferViews).toHaveLength(3);
    expect(file.json.accessors).toHaveLength(FIGURE_JOINTS.length * 3);
    expect(file.json.buffers?.[0].uri?.startsWith("data:application/octet-stream;base64,")).toBe(
      true
    );
    expect(base64Encode(new Uint8Array([1]))).toBe("AQ==");
  });
});
