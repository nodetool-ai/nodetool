import * as THREE from "three";
import {
  HIDDEN_EXTRA,
  bindTracksToUuids,
  cloneObjectDeep,
  computeSceneStats,
  nextAvailableName,
  removeStrayLightChildren,
  restoreEditorSettings,
  restoreHiddenFlags,
  restoreNodeNames,
  stampObjectIds
} from "../sceneOps";
import { findSceneObject } from "../useModel3DAgentTools";
import { createPrimitive } from "../objectFactory";

describe("cloneObjectDeep", () => {
  it("binds a copied skinned mesh to the copied bones", () => {
    const rig = new THREE.Group();
    const bone = new THREE.Bone();
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    rig.add(bone, mesh);
    mesh.bind(new THREE.Skeleton([bone]));

    const copy = cloneObjectDeep(rig);
    const [copyBone, copyMesh] = copy.children as [THREE.Bone, THREE.SkinnedMesh];

    expect(copyMesh.skeleton).not.toBe(mesh.skeleton);
    expect(copyMesh.skeleton.bones).toHaveLength(1);
    expect(copyMesh.skeleton.bones[0]).toBe(copyBone);
    expect(mesh.skeleton.bones[0]).toBe(bone);
  });

  it("gives the copy its own geometry and material", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const copy = cloneObjectDeep(mesh) as THREE.Mesh;

    expect(copy.geometry).not.toBe(mesh.geometry);
    expect(copy.material).not.toBe(mesh.material);
    (copy.material as THREE.MeshStandardMaterial).color.set("#ff0000");
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe("ffffff");
  });

  it("drops the headless object id from the copy", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.userData.nodetool_id = "obj_3";
    const copy = cloneObjectDeep(mesh);
    expect(copy.userData.nodetool_id).toBeUndefined();
    expect(mesh.userData.nodetool_id).toBe("obj_3");
  });

  it("aims a copied light at its own copied target child", () => {
    const light = createPrimitive("directionalLight") as THREE.DirectionalLight;
    const copy = cloneObjectDeep(light) as THREE.DirectionalLight;

    expect(copy.target.parent).toBe(copy);
    expect(copy.target).not.toBe(light.target);
    expect(copy.children).toHaveLength(1);
  });
});

describe("computeSceneStats", () => {
  it("counts objects, lights and triangles but not light targets", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    root.add(createPrimitive("directionalLight"));

    expect(computeSceneStats(root)).toEqual({
      objects: 2,
      meshes: 1,
      lights: 1,
      vertices: 24,
      triangles: 12
    });
  });
});

describe("nextAvailableName", () => {
  it("raises a trailing number until the name is free", () => {
    expect(nextAvailableName("Crate 2", new Set(["Crate 2", "Crate 3"]))).toBe("Crate 4");
    expect(nextAvailableName("Crate_1", new Set(["Crate_1"]))).toBe("Crate_2");
  });

  it("appends a number to a name without one", () => {
    expect(nextAvailableName("Box", new Set(["Box"]))).toBe("Box 2");
    expect(nextAvailableName("Box", new Set())).toBe("Box");
  });

  it("treats names that differ only in case or spaces as taken", () => {
    expect(nextAvailableName("box", new Set(["Box"]))).toBe("box 2");
    expect(nextAvailableName("Box", new Set(["box 2 ", "BOX"]))).toBe("Box 3");
  });
});

describe("bindTracksToUuids", () => {
  it("keeps a track bound after its node is renamed", () => {
    const root = new THREE.Group();
    const node = new THREE.Object3D();
    node.name = "Spinner";
    root.add(node);
    const track = new THREE.NumberKeyframeTrack("Spinner.position[x]", [0, 1], [0, 1]);
    const clip = new THREE.AnimationClip("Spin", 1, [track]);

    bindTracksToUuids([clip], root);
    node.name = "Renamed";

    expect(track.name).toBe(`${node.uuid}.position[x]`);
    expect(THREE.PropertyBinding.findNode(root, node.uuid)).toBe(node);
  });
});

describe("load fix-ups", () => {
  it("hides nodes saved with the hidden extra and removes the flag", () => {
    const root = new THREE.Group();
    const node = new THREE.Object3D();
    node.userData[HIDDEN_EXTRA] = true;
    root.add(node);

    restoreHiddenFlags(root);

    expect(node.visible).toBe(false);
    expect(node.userData).toEqual({});
  });

  it("hides nodes the headless scene tools saved as not visible", () => {
    const root = new THREE.Group();
    const hidden = new THREE.Object3D();
    hidden.userData.visible = false;
    const shown = new THREE.Object3D();
    shown.userData.visible = true;
    root.add(hidden, shown);

    restoreHiddenFlags(root);

    expect(hidden.visible).toBe(false);
    expect(shown.visible).toBe(true);
    expect(hidden.userData).toEqual({});
  });

  it("removes the empty target node older saves wrote under a light", () => {
    const light = createPrimitive("directionalLight") as THREE.DirectionalLight;
    const stray = new THREE.Object3D();
    light.add(stray);
    const root = new THREE.Group();
    root.add(light);

    removeStrayLightChildren(root);

    expect(light.children).toEqual([light.target]);
  });

  it("restores node names the loader sanitized", () => {
    const scene = new THREE.Group();
    const node = new THREE.Object3D();
    node.name = "Crate_1";
    scene.add(node);
    const associations = new Map([[node, { nodes: 0 }]]);

    restoreNodeNames({
      scene,
      parser: { json: { nodes: [{ name: "Crate 1" }] }, associations }
    });

    expect(node.name).toBe("Crate 1");
  });
});

describe("restoreEditorSettings", () => {
  it("puts back the Inspector settings saved in extras and drops the extras", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    material.userData.nodetool_editor = {
      wireframe: true,
      flatShading: true,
      backSide: true,
      depthTest: false,
      depthWrite: false,
      vertexColors: false
    };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.userData.nodetool_editor = {
      castShadow: true,
      receiveShadow: true,
      frustumCulled: false,
      renderOrder: 2
    };
    root.add(mesh);

    restoreEditorSettings(root);

    expect(material).toMatchObject({
      wireframe: true,
      flatShading: true,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      vertexColors: false
    });
    expect(mesh).toMatchObject({
      castShadow: true,
      receiveShadow: true,
      frustumCulled: false,
      renderOrder: 2
    });
    expect(material.userData).toEqual({});
    expect(mesh.userData).toEqual({});
  });

  it("gives a multi-material group's shadow settings to its meshes", () => {
    const group = new THREE.Group();
    group.userData.nodetool_editor = { castShadow: true };
    const part = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    group.add(part);

    restoreEditorSettings(group);

    expect(part.castShadow).toBe(true);
  });
});

describe("stampObjectIds", () => {
  it("gives each loaded object the id the scene tools list it under", () => {
    // A file listing a child before its parent, as Blender writes them. The
    // tools list Wheel as node-0; the editor saves Car first, so without a
    // stored id node-0 would name Car after the save.
    const scene = new THREE.Group();
    const car = new THREE.Group();
    const wheel = new THREE.Mesh();
    const tagged = new THREE.Object3D();
    car.add(wheel);
    scene.add(car, tagged);
    const associations = new Map<THREE.Object3D, { nodes?: number }>([
      [wheel, { nodes: 0 }],
      [car, { nodes: 1 }],
      [tagged, { nodes: 2 }]
    ]);
    tagged.userData.nodetool_id = "abc";

    stampObjectIds({
      scene,
      parser: {
        json: {
          nodes: [{ name: "Wheel" }, { name: "Car", children: [0] }, { extras: { nodetool_id: "abc" } }]
        },
        associations
      }
    });

    expect(wheel.userData.nodetool_id).toBe("node-0");
    expect(car.userData.nodetool_id).toBe("node-1");
    expect(tagged.userData.nodetool_id).toBe("abc");
    expect(findSceneObject(scene, "node-0")).toBe(wheel);
  });
});
