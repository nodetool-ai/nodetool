import { describe, expect, it } from "vitest";

import {
  applyOperations,
  composeMatrix,
  createModel3DFile,
  listScene,
  lookAtQuaternion,
  parseModel3D,
  parseOperation,
  serializeModel3D,
  transformPoint,
  validateModel3D,
  type GltfCamera,
  type Model3DFile,
  type Model3DOperation,
  type Quat,
  type Vec3
} from "../src/index.js";

const fresh = (ops: Model3DOperation[] = []): Model3DFile => {
  const file = createModel3DFile();
  applyOperations(file, ops);
  return file;
};

/** Where a node's -Z axis points, given its rotation. */
const forward = (rotation: Quat): Vec3 =>
  transformPoint(composeMatrix([0, 0, 0], rotation, [1, 1, 1]), [0, 0, -1]);

describe("lookAtQuaternion", () => {
  it("aims -Z at the target and keeps +Y up", () => {
    const rotation = lookAtQuaternion([0, 2, 5], [0, 1, 0])!;
    const direction = forward(rotation);
    const length = Math.hypot(0, -1, -5);
    expect(direction[0]).toBeCloseTo(0, 6);
    expect(direction[1]).toBeCloseTo(-1 / length, 6);
    expect(direction[2]).toBeCloseTo(-5 / length, 6);
    const up = transformPoint(composeMatrix([0, 0, 0], rotation, [1, 1, 1]), [0, 1, 0]);
    expect(up[1]).toBeGreaterThan(0.9);
  });

  it("is the identity for a camera already looking down -Z", () => {
    const rotation = lookAtQuaternion([0, 0, 3], [0, 0, 0])!;
    expect(rotation.map((n) => Math.abs(Math.round(n * 1e6) / 1e6))).toEqual([0, 0, 0, 1]);
  });

  it("handles a straight-down view and rejects a zero-length one", () => {
    const direction = forward(lookAtQuaternion([0, 5, 0], [0, 0, 0])!);
    expect(direction[1]).toBeCloseTo(-1, 3);
    expect(lookAtQuaternion([1, 2, 3], [1, 2, 3])).toBeNull();
  });
});

describe("camera objects", () => {
  it("parses the camera fields", () => {
    expect(
      parseOperation({
        op: "add_object",
        kind: "camera",
        name: "cam_wide",
        position: [0, 1.5, 6],
        lookAt: [0, 1, 0],
        fovDeg: 30
      })
    ).toEqual({
      op: "add_object",
      kind: "camera",
      name: "cam_wide",
      position: [0, 1.5, 6],
      lookAt: [0, 1, 0],
      fovDeg: 30
    });
    expect(
      parseOperation({ op: "set_camera", target: "cam_wide", fovDeg: 24, lookAt: [1, 1, 1] })
    ).toEqual({ op: "set_camera", target: "cam_wide", fovDeg: 24, lookAt: [1, 1, 1] });
    expect(() => parseOperation({ op: "set_camera", target: "cam_wide" })).toThrow(/at least one/);
    expect(() => parseOperation({ op: "add_object", kind: "box", fovDeg: 30 })).toThrow(
      /kind "camera" only/
    );
    expect(() => parseOperation({ op: "add_object", kind: "camera", lookAt: [1, 2] })).toThrow(
      /three finite numbers/
    );
  });

  it("adds a perspective camera node with defaults", () => {
    const file = fresh([{ op: "add_object", kind: "camera" }]);
    const [camera] = listScene(file.json);
    expect(camera).toMatchObject({
      name: "Camera",
      type: "PerspectiveCamera",
      position: [0, 1.6, 5],
      camera: { projection: "perspective", fovDeg: 40, znear: 0.1, zfar: 1000 }
    });
    expect(camera.rotation.map((n) => n + 0)).toEqual([0, 0, 0]);
    expect(camera.camera?.aspectRatio).toBeCloseTo(16 / 9, 5);
    const def = (file.json.cameras as GltfCamera[])[0];
    expect(def.type).toBe("perspective");
    expect(def.name).toBeUndefined();
    expect(def.perspective?.yfov).toBeCloseTo((40 * Math.PI) / 180, 9);
    expect(file.json.nodes?.[0].camera).toBe(0);
    expect(validateModel3D(file.json).errors).toEqual([]);
  });

  it("places and aims a camera in one operation", () => {
    const file = fresh([
      {
        op: "add_object",
        kind: "camera",
        name: "cam_low",
        position: [4, 0.5, 4],
        lookAt: [0, 1, 0],
        fovDeg: 55
      }
    ]);
    const node = file.json.nodes![0];
    const direction = forward(node.rotation as Quat);
    const expected = [-4, 0.5, -4];
    const length = Math.hypot(...expected);
    expected.forEach((value, axis) => {
      expect(direction[axis]).toBeCloseTo(value / length, 5);
    });
    expect(listScene(file.json)[0].camera?.fovDeg).toBe(55);
  });

  it("changes the lens, moves and re-aims with set_camera", () => {
    const file = fresh([{ op: "add_object", kind: "camera", name: "cam_a" }]);
    const [{ object }] = applyOperations(file, [
      { op: "set_camera", target: "cam_a", position: [0, 10, 0], lookAt: [0, 0, 0], fovDeg: 20 }
    ]);
    expect(object?.position).toEqual([0, 10, 0]);
    expect(object?.camera?.fovDeg).toBe(20);
    expect(forward(file.json.nodes![0].rotation as Quat)[1]).toBeCloseTo(-1, 3);
    // The lens is kept when only the aim changes.
    applyOperations(file, [{ op: "set_camera", target: "cam_a", lookAt: [5, 10, 0] }]);
    expect(listScene(file.json)[0].camera?.fovDeg).toBe(20);
    expect(forward(file.json.nodes![0].rotation as Quat)[0]).toBeCloseTo(1, 5);
  });

  it("rejects bad lens values and a non-camera target", () => {
    expect(() => fresh([{ op: "add_object", kind: "camera", fovDeg: 0 }])).toThrow(/fovDeg/);
    expect(() => fresh([{ op: "add_object", kind: "camera", znear: 5, zfar: 1 }])).toThrow(
      /zfar/
    );
    expect(() =>
      fresh([{ op: "add_object", kind: "camera", position: [1, 1, 1], lookAt: [1, 1, 1] }])
    ).toThrow(/own position/);
    const file = fresh([{ op: "add_object", kind: "box" }]);
    expect(() => applyOperations(file, [{ op: "set_camera", target: "Box", fovDeg: 30 }])).toThrow(
      /not a camera/
    );
    expect(() =>
      applyOperations(file, [{ op: "set_material_color", target: "Box", color: "#fff" }])
    ).not.toThrow();
  });

  it("gives a node sharing a camera entry its own lens", () => {
    const file = fresh([{ op: "add_object", kind: "camera", name: "cam_a" }]);
    file.json.nodes!.push({ name: "cam_b", camera: 0 });
    file.json.scenes![0].nodes!.push(1);
    applyOperations(file, [{ op: "set_camera", target: "cam_b", fovDeg: 70 }]);
    const [a, b] = listScene(file.json);
    expect(a.camera?.fovDeg).toBe(40);
    expect(b.camera?.fovDeg).toBe(70);
  });

  it("moves with set_transform and survives a GLB round trip", () => {
    const file = fresh([
      { op: "add_object", kind: "camera", name: "cam_a", lookAt: [0, 1, 0] },
      { op: "set_transform", target: "cam_a", position: [1, 2, 3] }
    ]);
    const back = parseModel3D(serializeModel3D({ ...file, format: "glb" }));
    expect(listScene(back.json)).toEqual(listScene(file.json));
    expect(listScene(back.json)[0].position).toEqual([1, 2, 3]);
  });

  it("reports a camera with a bad lens", () => {
    const file = fresh([{ op: "add_object", kind: "camera" }]);
    (file.json.cameras as GltfCamera[])[0].perspective!.yfov = 0;
    expect(validateModel3D(file.json).errors.map((issue) => issue.path)).toEqual(["cameras[0]"]);
  });
});
