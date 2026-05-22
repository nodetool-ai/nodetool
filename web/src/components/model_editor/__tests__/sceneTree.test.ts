import * as THREE from "three";
import { buildSceneTree, flattenTree, disposeObject } from "../sceneTree";

const makeMesh = (name: string) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  );
  mesh.name = name;
  return mesh;
};

describe("buildSceneTree", () => {
  it("reflects the child hierarchy with depth and metadata", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.name = "Parent";
    const child = makeMesh("Child");
    parent.add(child);
    root.add(parent);

    const tree = buildSceneTree(root);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("Parent");
    expect(tree[0].depth).toBe(0);
    expect(tree[0].uuid).toBe(parent.uuid);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("Child");
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].type).toBe("Mesh");
  });

  it("falls back to the object type when unnamed", () => {
    const root = new THREE.Group();
    root.add(new THREE.Group());
    const tree = buildSceneTree(root);
    expect(tree[0].name).toBe("Group");
  });
});

describe("flattenTree", () => {
  it("returns nodes depth-first", () => {
    const root = new THREE.Group();
    const a = new THREE.Group();
    a.name = "A";
    const b = makeMesh("B");
    a.add(b);
    const c = new THREE.Group();
    c.name = "C";
    root.add(a);
    root.add(c);

    const flat = flattenTree(buildSceneTree(root));
    expect(flat.map((n) => n.name)).toEqual(["A", "B", "C"]);
  });
});

describe("disposeObject", () => {
  it("disposes geometry and material across the subtree", () => {
    const mesh = makeMesh("M");
    const geometrySpy = jest.spyOn(mesh.geometry, "dispose");
    const materialSpy = jest.spyOn(mesh.material as THREE.Material, "dispose");

    disposeObject(mesh);

    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(materialSpy).toHaveBeenCalledTimes(1);
  });
});
