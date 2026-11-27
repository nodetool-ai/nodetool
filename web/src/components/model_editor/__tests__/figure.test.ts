import * as THREE from "three";
import {
  applyOperations,
  createModel3DFile,
  FIGURE_BODIES,
  FIGURE_JOINTS,
  FIGURE_POSES,
  type GltfNode
} from "@nodetool-ai/model3d";

import { cameraPatchCommand, describeCamera } from "../agentEdits";
import {
  createFigure,
  figureInfoOf,
  figureMaterials,
  figurePatchCommand,
  figureParts,
  isFigurePart,
  selectableOf
} from "../figure";
import { createPrimitive } from "../objectFactory";
import { computeSceneStats } from "../sceneOps";
import { buildSceneTree } from "../sceneTree";
import { findSceneObject, toObjectDetail, toSceneNode } from "../useModel3DAgentTools";

const heightOf = (object: THREE.Object3D): { min: number; max: number } => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  return { min: box.min.y, max: box.max.y };
};

/** The joint nodes the headless operations write for the same figure. */
const headlessJoints = (body: string, pose: string): Map<string, GltfNode> => {
  const file = createModel3DFile();
  applyOperations(file, [{ op: "add_object", kind: "figure", body, pose } as never]);
  const joints = new Map<string, GltfNode>();
  for (const node of file.json.nodes ?? []) {
    const joint = node.extras?.["nodetool_figure_part"];
    if (typeof joint === "string") {
      joints.set(joint, node);
    }
  }
  return joints;
};

describe("createFigure", () => {
  it("builds every joint once, parented as the headless package parents them", () => {
    const figure = createFigure();
    const parts = figureParts(figure);
    expect([...parts.keys()].sort()).toEqual([...FIGURE_JOINTS].sort());
    expect(parts.get("footL")?.parent).toBe(parts.get("lowerLegL"));
    expect(parts.get("lowerLegL")?.parent).toBe(parts.get("upperLegL"));
    expect(parts.get("upperLegL")?.parent).toBe(parts.get("pelvis"));
    expect(parts.get("handR")?.parent?.parent).toBe(parts.get("upperArmR"));
    expect(parts.get("pelvis")?.parent).toBe(figure);
  });

  it.each(FIGURE_BODIES.flatMap((body) => FIGURE_POSES.map((pose) => [body, pose] as const)))(
    "%s %s matches the joints edit_model3d writes",
    (body, pose) => {
      const parts = figureParts(createFigure({ body, pose }));
      const headless = headlessJoints(body, pose);
      for (const joint of FIGURE_JOINTS) {
        const object = parts.get(joint) as THREE.Mesh;
        const node = headless.get(joint) as GltfNode;
        expect(object.name).toBe(node.name);
        object.position.toArray().forEach((value, axis) => {
          expect(value).toBeCloseTo((node.translation as number[])[axis], 5);
        });
        const expected = new THREE.Quaternion(...(node.rotation as [number, number, number, number]));
        expect(object.quaternion.angleTo(expected)).toBeLessThan(1e-5);
      }
    }
  );

  it("stands on the ground at the body's height and shares one material", () => {
    const male = heightOf(createFigure());
    expect(male.min).toBeCloseTo(0, 4);
    expect(male.max).toBeCloseTo(1.8, 2);
    expect(heightOf(createFigure({ body: "child" })).max).toBeCloseTo(1.2, 2);
    const colored = createFigure({ color: "#ff0000" });
    const materials = figureMaterials(colored);
    expect(materials).toHaveLength(1);
    expect((materials[0] as THREE.MeshStandardMaterial).color.getHexString()).toBe("ff0000");
  });

  it("keeps the cast link in the root's userData, which the exporter writes as extras", () => {
    const figure = createFigure({ entityId: " e1 ", label: "Ana" });
    expect(figure.userData.nodetool_figure).toEqual({
      body: "male",
      pose: "stand",
      height: 1.8,
      entityId: "e1",
      label: "Ana"
    });
    expect(JSON.parse(JSON.stringify(figure.userData))).toEqual(figure.userData);
  });

  it("rejects a height outside the range and a color that is not hex", () => {
    expect(() => createFigure({ height: 12 })).toThrow(/height/);
    expect(() => createFigure({ color: "reddish" })).toThrow(/hex/);
  });
});

describe("a figure in the scene", () => {
  const scene = () => {
    const root = new THREE.Group();
    const figure = createFigure();
    figure.name = "Ana";
    const box = createPrimitive("box");
    box.name = "Head";
    root.add(figure, box);
    return { root, figure, box };
  };

  it("lists as one object of type Figure in the outliner and the agent listing", () => {
    const { root, figure } = scene();
    const tree = buildSceneTree(root);
    expect(tree.map((node) => [node.name, node.type, node.children.length])).toEqual([
      ["Ana", "Figure", 0],
      ["Head", "Mesh", 0]
    ]);
    expect(toSceneNode(figure, root)).toMatchObject({
      name: "Ana",
      type: "Figure",
      parentUuid: null,
      figure: { body: "male", pose: "stand", height: 1.8 }
    });
    const detail = toObjectDetail(figure, root);
    expect(detail.children).toEqual([]);
    expect(detail.materials).toHaveLength(1);
    expect(computeSceneStats(root).objects).toBe(2);
    expect(computeSceneStats(root).meshes).toBe(1 + FIGURE_JOINTS.length);
    expect(computeSceneStats(root).triangles).toBeLessThan(4000);
  });

  it("selects the figure when one of its joints is clicked", () => {
    const { figure, box } = scene();
    const hand = figureParts(figure).get("handL") as THREE.Object3D;
    expect(isFigurePart(hand)).toBe(true);
    expect(selectableOf(hand)).toBe(figure);
    expect(selectableOf(box)).toBe(box);
    expect(selectableOf(figure)).toBe(figure);
  });

  it("does not resolve a joint by name, uuid or stored id", () => {
    const { root, figure, box } = scene();
    const head = figureParts(figure).get("head") as THREE.Object3D;
    head.userData.nodetool_id = "joint-id";
    expect(findSceneObject(root, "Head")).toBe(box);
    expect(findSceneObject(root, "head")).toBe(box);
    expect(findSceneObject(root, head.uuid)).toBeNull();
    expect(findSceneObject(root, "joint-id")).toBeNull();
    expect(findSceneObject(root, "ana")).toBe(figure);
  });

  it("poses, reshapes and recolors with one undoable command", () => {
    const figure = createFigure({ label: "Ana" });
    const thigh = figureParts(figure).get("upperLegL") as THREE.Mesh;
    const standGeometry = thigh.geometry;
    const pose = figurePatchCommand(figure, { pose: "sit" });
    expect(figureInfoOf(figure)).toMatchObject({ pose: "sit", label: "Ana" });
    expect(thigh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(thigh.geometry).toBe(standGeometry);
    expect(heightOf(figure).min).toBeCloseTo(0, 4);
    pose.undo();
    expect(figureInfoOf(figure)?.pose).toBe("stand");
    expect(thigh.rotation.x).toBeCloseTo(0);

    const reshape = figurePatchCommand(figure, { body: "child", color: "#00ff00", label: null });
    expect(figureInfoOf(figure)).toEqual({ body: "child", pose: "stand", height: 1.2 });
    expect(heightOf(figure).max).toBeCloseTo(1.2, 2);
    expect(thigh.geometry).not.toBe(standGeometry);
    const material = figureMaterials(figure)[0] as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe("00ff00");
    reshape.undo();
    expect(figureInfoOf(figure)).toEqual({ body: "male", pose: "stand", height: 1.8, label: "Ana" });
    expect(heightOf(figure).max).toBeCloseTo(1.8, 2);
    expect(material.color.getHexString()).toBe("b8b8b8");
    reshape.redo();
    expect(heightOf(figure).max).toBeCloseTo(1.2, 2);
  });

  it("refuses to pose another object or a figure that lost a joint", () => {
    expect(() => figurePatchCommand(createPrimitive("box"), { pose: "sit" })).toThrow(
      /not a figure/
    );
    const figure = createFigure();
    const hand = figureParts(figure).get("handL") as THREE.Object3D;
    hand.removeFromParent();
    expect(() => figurePatchCommand(figure, { pose: "sit" })).toThrow(/handL/);
  });
});

describe("a camera in the scene", () => {
  it("lists with its lens", () => {
    const root = new THREE.Group();
    const camera = createPrimitive("camera");
    camera.name = "cam_a";
    root.add(camera);
    expect(toSceneNode(camera, root)).toMatchObject({
      name: "cam_a",
      type: "PerspectiveCamera",
      camera: { projection: "perspective", fovDeg: 40, znear: 0.1, zfar: 1000 }
    });
  });

  it("changes the lens, moves and aims with one undoable command", () => {
    const camera = createPrimitive("camera") as THREE.PerspectiveCamera;
    const command = cameraPatchCommand(camera, {
      fovDeg: 24,
      position: [0, 10, 0],
      lookAt: [0, 0, 0]
    });
    expect(describeCamera(camera).fovDeg).toBe(24);
    expect(camera.position.toArray()).toEqual([0, 10, 0]);
    expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeCloseTo(-1, 3);
    command.undo();
    expect(camera.fov).toBe(40);
    expect(camera.position.toArray()).toEqual([0, 1.6, 5]);
    expect(camera.getWorldDirection(new THREE.Vector3()).z).toBeCloseTo(-1);
    command.redo();
    expect(camera.fov).toBe(24);
  });

  it("rejects a bad lens and a lookAt at the camera itself", () => {
    const camera = createPrimitive("camera") as THREE.PerspectiveCamera;
    expect(() => cameraPatchCommand(camera, { fovDeg: 0 })).toThrow(/fovDeg/);
    expect(() => cameraPatchCommand(camera, { znear: 5, zfar: 1 })).toThrow(/zfar/);
    expect(() => cameraPatchCommand(camera, { lookAt: [0, 1.6, 5] })).toThrow(/own position/);
    expect(camera.fov).toBe(40);
  });
});
