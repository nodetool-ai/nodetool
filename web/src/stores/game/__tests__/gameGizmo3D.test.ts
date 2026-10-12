import { Box3, BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from "three";
import {
  gameAxisViewPosition3D, gameGizmoPivot3D, gameGizmoSnaps3D, gameGroundOffset3D, gameGroupTransform3D, gameLocalTransform3D,
  gameSelectionRoots3D, gameSelectionWithDescendants3D, gameSnapValue3D, gameSurfaceHit3D, gameTransformFromMatrix3D,
  type GameGizmoEntry3D
} from "../gameGizmo3D";

const QUARTER_Y = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

function at(x: number, y: number, z: number, rotation = new Quaternion()): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), rotation, new Vector3(1, 1, 1));
}
function position(matrix: Matrix4 | undefined): number[] {
  if (!matrix) { throw new Error("Matrix missing"); }
  return new Vector3().setFromMatrixPosition(matrix).toArray().map((value) => Number(value.toFixed(6)) + 0);
}
function box(x: number, y: number, z: number, size = 1): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("selection sets", () => {
  const parents = new Map<string, string | undefined>([["root", undefined], ["arm", "root"], ["hand", "arm"], ["other", undefined],
    ["loop-a", "loop-b"], ["loop-b", "loop-a"]]);

  it("keeps only the selected entities no selected ancestor already moves, in selection order", () => {
    expect(gameSelectionRoots3D(["hand", "other", "root", "hand"], parents)).toEqual(["other", "root"]);
    expect(gameSelectionRoots3D(["hand", "other"], parents)).toEqual(["hand", "other"]);
  });

  it("stops at a parent cycle instead of looping", () => {
    expect(gameSelectionRoots3D(["loop-a"], parents)).toEqual(["loop-a"]);
    expect([...gameSelectionWithDescendants3D(["loop-a"], parents)].sort()).toEqual(["loop-a", "loop-b"]);
  });

  it("adds every descendant of the selection", () => {
    expect([...gameSelectionWithDescendants3D(["root", "other"], parents)].sort()).toEqual(["arm", "hand", "other", "root"]);
  });
});

describe("snapping math", () => {
  it("rounds to the increment without floating-point residue", () => {
    expect(gameSnapValue3D(0.31, 0.1)).toBe(0.3);
    expect(gameSnapValue3D(-1.13, 0.25)).toBe(-1.25);
    expect(gameSnapValue3D(7.4, 0)).toBe(7.4);
  });

  it("passes rotation increments to the gizmo in radians and turns every snap off together", () => {
    expect(gameGizmoSnaps3D(true, { translate: 0.5, rotate: 45, scale: 0.1 })).toEqual({ translate: 0.5, rotate: Math.PI / 4, scale: 0.1 });
    expect(gameGizmoSnaps3D(false, { translate: 0.5, rotate: 45, scale: 0.1 })).toEqual({ translate: null, rotate: null, scale: null });
  });
});

describe("grouped transforms", () => {
  const entries: GameGizmoEntry3D[] = [{ id: "a", world: at(0, 0, 0) }, { id: "b", world: at(4, 0, 0, QUARTER_Y) }];

  it("places the gizmo at the selection centre or the active entity with the active entity's orientation", () => {
    const center = gameGizmoPivot3D(entries, entries[1].world, "center");
    expect(position(center)).toEqual([2, 0, 0]);
    expect(new Quaternion().setFromRotationMatrix(center).angleTo(QUARTER_Y)).toBeCloseTo(0);
    expect(position(gameGizmoPivot3D(entries, entries[0].world, "active"))).toEqual([0, 0, 0]);
  });

  it("moves every entity by the gizmo's translation", () => {
    const start = gameGizmoPivot3D(entries, entries[0].world, "center");
    const current = start.clone().premultiply(new Matrix4().makeTranslation(0, 3, 0));
    const result = gameGroupTransform3D(entries, start, current, "center", "world");
    expect(position(result.get("a"))).toEqual([0, 3, 0]);
    expect(position(result.get("b"))).toEqual([4, 3, 0]);
  });

  it("rotates around the selection centre for the centre pivot and in place for individual origins", () => {
    const start = gameGizmoPivot3D(entries, entries[0].world, "center");
    // The gizmo starts unrotated at x=2. A half turn about world Y swaps the two entities' positions.
    const current = new Matrix4().compose(new Vector3(2, 0, 0), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI),
      new Vector3(1, 1, 1));
    const turned = gameGroupTransform3D(entries, start, current, "center", "world");
    expect(position(turned.get("a"))).toEqual([4, 0, 0]);
    expect(position(turned.get("b"))).toEqual([0, 0, 0]);
    const inPlace = gameGroupTransform3D(entries, start, current, "individual", "world");
    expect(position(inPlace.get("a"))).toEqual([0, 0, 0]);
    expect(position(inPlace.get("b"))).toEqual([4, 0, 0]);
    const rotationB = new Quaternion();
    inPlace.get("b")?.decompose(new Vector3(), rotationB, new Vector3());
    expect(rotationB.angleTo(QUARTER_Y.clone().premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)))).toBeCloseTo(0);
  });

  it("moves each entity along its own axes for individual origins in local space", () => {
    const start = gameGizmoPivot3D(entries, entries[0].world, "individual");
    const current = start.clone().multiply(new Matrix4().makeTranslation(1, 0, 0));
    const result = gameGroupTransform3D(entries, start, current, "individual", "local");
    expect(position(result.get("a"))).toEqual([1, 0, 0]);
    // b is turned a quarter about Y, so its local +X points along world -Z.
    expect(position(result.get("b"))).toEqual([4, 0, -1]);
  });

  it("puts the active pivot on an active entity that is not a selection root", () => {
    // A selected child of a selected parent is not an entry, but it is still the active entity the gizmo sits on.
    const child = at(4, 2, 1, QUARTER_Y);
    const pivot = gameGizmoPivot3D(entries, child, "active");
    expect(position(pivot)).toEqual([4, 2, 1]);
    expect(new Quaternion().setFromRotationMatrix(pivot).angleTo(QUARTER_Y)).toBeCloseTo(0);
    expect(position(gameGizmoPivot3D(entries, undefined, "active"))).toEqual([4, 0, 0]);
  });

  it("turns each entity about its own local axis for individual origins in local space", () => {
    const start = gameGizmoPivot3D(entries, entries[0].world, "individual");
    const turn = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const current = start.clone().multiply(new Matrix4().makeRotationFromQuaternion(turn));
    const result = gameGroupTransform3D(entries, start, current, "individual", "local");
    for (const entry of entries) {
      const before = new Quaternion();
      const origin = new Vector3();
      entry.world.decompose(origin, before, new Vector3());
      const after = new Quaternion();
      result.get(entry.id)?.decompose(new Vector3(), after, new Vector3());
      expect(position(result.get(entry.id))).toEqual(origin.toArray());
      // A local turn multiplies on the right of the entity's own rotation.
      expect(after.angleTo(before.clone().multiply(turn))).toBeCloseTo(0);
    }
  });

  it("scales around the pivot", () => {
    const start = gameGizmoPivot3D(entries, entries[0].world, "center");
    const current = start.clone().multiply(new Matrix4().makeScale(2, 2, 2));
    const result = gameGroupTransform3D(entries, start, current, "center", "world");
    expect(position(result.get("a"))).toEqual([-2, 0, 0]);
    expect(gameTransformFromMatrix3D(result.get("a") ?? new Matrix4()).scale).toEqual({ x: 2, y: 2, z: 2 });
  });

  it("stores a moved child relative to its parent", () => {
    const local = gameLocalTransform3D(at(5, 1, 0), at(2, 1, 0));
    expect(local.position).toEqual({ x: 3, y: 0, z: 0 });
    expect(gameLocalTransform3D(at(5, 1, 0), null).position).toEqual({ x: 5, y: 1, z: 0 });
  });
});

describe("surface snap and align to ground", () => {
  it("hits the nearest surface, then the ground plane", () => {
    const table = box(0, 1, 0, 2);
    const ray = new Raycaster(new Vector3(0, 10, 0), new Vector3(0, -1, 0));
    expect(gameSurfaceHit3D(ray, [table])?.toArray()).toEqual([0, 2, 0]);
    expect(gameSurfaceHit3D(new Raycaster(new Vector3(5, 10, 0), new Vector3(0, -1, 0)), [table])?.toArray()).toEqual([5, 0, 0]);
    expect(gameSurfaceHit3D(new Raycaster(new Vector3(5, 10, 0), new Vector3(0, 1, 0)), [table])).toBeNull();
  });

  it("drops a floating selection onto the surface below and lifts a sunken one onto it", () => {
    const table = box(0, 1, 0, 2);
    expect(gameGroundOffset3D(new Box3(new Vector3(-0.5, 5, -0.5), new Vector3(0.5, 6, 0.5)), [table])).toBeCloseTo(-3);
    expect(gameGroundOffset3D(new Box3(new Vector3(-0.5, 1.5, -0.5), new Vector3(0.5, 2.5, 0.5)), [table])).toBeCloseTo(0.5);
    expect(gameGroundOffset3D(new Box3(new Vector3(9, -1, 9), new Vector3(10, 0.5, 10)), [table])).toBeCloseTo(1);
    expect(gameGroundOffset3D(new Box3(), [table])).toBe(0);
  });
});

it("places axis views along each axis and leans top and bottom views toward +Z", () => {
  const target = new Vector3(1, 0, 0);
  expect(gameAxisViewPosition3D("right", target, 5).toArray()).toEqual([6, 0, 0]);
  expect(gameAxisViewPosition3D("back", target, 5).toArray()).toEqual([1, 0, -5]);
  const top = gameAxisViewPosition3D("top", target, 5);
  expect(top.y).toBeCloseTo(5);
  expect(top.z).toBeGreaterThan(0);
  expect(gameAxisViewPosition3D("bottom", target, 5).y).toBeCloseTo(-5);
});
