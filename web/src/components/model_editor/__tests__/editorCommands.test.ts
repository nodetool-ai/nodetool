import * as THREE from "three";
import {
  addObjectCommand,
  captureTransform,
  removeObject,
  reparentObject,
  transformCommand
} from "../editorCommands";

const worldPosition = (object: THREE.Object3D) => {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(new THREE.Vector3());
};

describe("editor commands", () => {
  it("restores a deleted object at its old index", () => {
    const parent = new THREE.Group();
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    const c = new THREE.Object3D();
    parent.add(a, b, c);

    const command = removeObject("Delete", b);
    expect(parent.children).toEqual([a, c]);
    command?.undo();
    expect(parent.children).toEqual([a, b, c]);
    command?.redo();
    expect(parent.children).toEqual([a, c]);
  });

  it("frees a deleted mesh only once the delete can no longer be undone", () => {
    const parent = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const dispose = jest.spyOn(geometry, "dispose");
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    parent.add(mesh);

    const command = removeObject("Delete", mesh);
    expect(dispose).not.toHaveBeenCalled();
    command?.dispose?.(false);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("frees an added mesh when the add is undone and dropped", () => {
    const parent = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const dispose = jest.spyOn(geometry, "dispose");
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    parent.add(mesh);

    const command = addObjectCommand("Add", mesh, parent);
    command.undo();
    expect(parent.children).toEqual([]);
    command.dispose?.(true);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("reparents without moving the object in the world, and undoes exactly", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    parent.position.set(5, 0, 0);
    parent.rotation.y = Math.PI / 2;
    const child = new THREE.Object3D();
    child.position.set(1, 2, 3);
    root.add(parent, child);
    const before = captureTransform(child);

    const command = reparentObject("Parent", child, parent, 0);
    expect(child.parent).toBe(parent);
    const world = worldPosition(child);
    expect(world.x).toBeCloseTo(1);
    expect(world.y).toBeCloseTo(2);
    expect(world.z).toBeCloseTo(3);

    command?.undo();
    expect(child.parent).toBe(root);
    expect(root.children.indexOf(child)).toBe(1);
    expect(child.position.equals(before.position)).toBe(true);
  });

  it("refuses to put an object inside its own subtree", () => {
    const root = new THREE.Group();
    const parent = new THREE.Group();
    const child = new THREE.Group();
    root.add(parent);
    parent.add(child);

    expect(reparentObject("Parent", parent, child, 0)).toBeNull();
    expect(parent.parent).toBe(root);
  });

  it("applies transform snapshots both ways", () => {
    const object = new THREE.Object3D();
    const before = captureTransform(object);
    object.position.set(1, 1, 1);
    const after = captureTransform(object);
    const command = transformCommand("Move", object, before, after);

    command.undo();
    expect(object.position.toArray()).toEqual([0, 0, 0]);
    command.redo();
    expect(object.position.toArray()).toEqual([1, 1, 1]);
  });
});
