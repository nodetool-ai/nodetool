import * as THREE from "three";
import { createCanvas } from "@napi-rs/canvas";
import { expect, it } from "vitest";
import { GameDecals3D } from "../src/renderer3d/decals/index.js";
import { prepareGameImage3D } from "../src/renderer3d/assets/image-preparation.js";
import type { RenderInstance } from "../src/renderer3d/types.js";
import { blockoutFrame } from "./fixtures/game3d.js";

async function fixture() {
  const bytes = new Uint8Array(createCanvas(2, 2).toBuffer("image/png"));
  const prepared = await prepareGameImage3D(bytes, { assetId: "paint" });
  if (!prepared.ok) { throw new Error("Image preparation failed"); }
  const scene = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshStandardMaterial();
  const wall = new THREE.Mesh(geometry, material);
  const projector = new THREE.Group();
  scene.add(wall, projector);
  const instances = new Map<string, RenderInstance>([
    ["box", { descriptor: "wall", object: wall, materials: [material] }],
    ["projector", { descriptor: "projector", object: projector, materials: [] }]
  ]);
  const frame = blockoutFrame();
  const transform = frame.entities[0]?.transform;
  if (!transform) { throw new Error("Fixture transform is missing"); }
  frame.entities.push({ entityId: "projector", transform, previousTransform: transform,
    decal3d: { assetId: "paint", receiverId: "box", size: { x: 1, y: 1, z: 0.2 }, opacity: 1, renderOrder: 0 } });
  const canonical: THREE.Texture[] = [];
  const diagnostics: string[] = [];
  const manager = new GameDecals3D(scene, { resolveImage: async () => prepared.image,
    decodeImage: async () => {
      const texture = new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2);
      canonical.push(texture);
      return texture;
    } }, new AbortController().signal, diagnostics);
  const dispose = (): void => { manager.dispose(); geometry.dispose(); material.dispose(); };
  return { scene, wall, projector, instances, frame, manager, canonical, diagnostics, dispose };
}

function decalMesh(scene: THREE.Scene): THREE.Mesh {
  const group = scene.children.find((object) => object.name === "game-decal");
  const mesh = group?.children[0];
  if (!(mesh instanceof THREE.Mesh)) { throw new Error("Expected a projected decal mesh"); }
  return mesh;
}

it("reuses unchanged geometry but follows the paired world motion of receiver and projector", async () => {
  const test = await fixture();
  try {
    await test.manager.sync(test.frame, test.instances);
    const initial = decalMesh(test.scene).geometry;
    const before = initial.getAttribute("position").getX(0);
    let disposed = false;
    initial.addEventListener("dispose", () => { disposed = true; });
    await test.manager.sync(test.frame, test.instances);
    expect(decalMesh(test.scene).geometry).toBe(initial);
    test.wall.position.x = 10; test.projector.position.x = 10;
    await test.manager.sync(test.frame, test.instances);
    const current = decalMesh(test.scene).geometry;
    expect(current.getAttribute("position").getX(0)).toBeCloseTo(before + 10, 6);
    expect(disposed).toBe(true);
    expect(test.canonical).toHaveLength(1);
  } finally { test.dispose(); }
});

it("projects only selected visible nested receiver meshes and rebuilds when selection changes", async () => {
  const test = await fixture();
  const parent = new THREE.Group();
  const hidden = new THREE.Mesh(test.wall.geometry, test.wall.material);
  hidden.position.z = 0.05; hidden.visible = false;
  parent.add(test.wall, hidden); test.scene.add(parent);
  test.instances.set("box", { descriptor: "nested-model", object: parent, materials: [test.wall.material] });
  try {
    await test.manager.sync(test.frame, test.instances);
    expect(decalMesh(test.scene).geometry.getAttribute("position").getZ(0)).toBe(0);
    hidden.visible = true;
    await test.manager.sync(test.frame, test.instances);
    const group = test.scene.children.find((object) => object.name === "game-decal");
    expect(group?.children).toHaveLength(2);
    test.instances.delete("box");
    await test.manager.sync(test.frame, test.instances);
    expect(test.scene.children.filter((object) => object.name === "game-decal")).toHaveLength(0);
    expect(test.diagnostics).toContain("Decal projector receiver or projector is unavailable");
  } finally { test.dispose(); }
});

it("owns decal resources separately from the canonical texture and evicts unused images", async () => {
  const test = await fixture();
  try {
    await test.manager.sync(test.frame, test.instances);
    const mesh = decalMesh(test.scene);
    if (!(mesh.material instanceof THREE.MeshStandardMaterial) || !mesh.material.map) { throw new Error("Decal texture is missing"); }
    expect(mesh.material.depthTest).toBe(true);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.material.transparent).toBe(true);
    expect(mesh.material.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(mesh.material.map).not.toBe(test.canonical[0]);
    let geometryDisposed = false;
    let cloneDisposed = false;
    let canonicalDisposed = false;
    mesh.geometry.addEventListener("dispose", () => { geometryDisposed = true; });
    mesh.material.map.addEventListener("dispose", () => { cloneDisposed = true; });
    test.canonical[0]?.addEventListener("dispose", () => { canonicalDisposed = true; });
    expect(test.manager.geometryBytes).toBeGreaterThan(0);
    expect(test.manager.textureBytes).toBe(16);
    test.frame.entities = test.frame.entities.filter((entity) => entity.entityId !== "projector");
    await test.manager.sync(test.frame, test.instances);
    expect([geometryDisposed, cloneDisposed, canonicalDisposed]).toEqual([true, true, true]);
    expect(test.manager.geometryBytes).toBe(0);
    expect(test.manager.textureBytes).toBe(0);
  } finally { test.dispose(); }
});

it("invalidates shared image slots and rebuilds with fresh canonical bytes", async () => {
  const test = await fixture();
  try {
    await test.manager.sync(test.frame, test.instances);
    const before = decalMesh(test.scene).geometry;
    await test.manager.invalidate("paint");
    await test.manager.sync(test.frame, test.instances);
    expect(decalMesh(test.scene).geometry).not.toBe(before);
    expect(test.canonical).toHaveLength(2);
    expect(test.canonical[1]).not.toBe(test.canonical[0]);
  } finally { test.dispose(); }
});

it("bounds live projectors and retains deterministic overlap order when entities reorder", async () => {
  const test = await fixture();
  const original = test.frame.entities.find((entity) => entity.entityId === "projector");
  if (!original) { throw new Error("Projector missing"); }
  for (let index = 1; index < 33; index++) {
    const id = `projector-${index}`;
    const object = new THREE.Group(); test.scene.add(object);
    test.instances.set(id, { descriptor: "projector", object, materials: [] });
    test.frame.entities.push({ ...original, entityId: id });
  }
  try {
    await test.manager.sync(test.frame, test.instances);
    const groups = test.scene.children.filter((object) => object.name === "game-decal");
    expect(groups).toHaveLength(32);
    expect(test.diagnostics).toEqual(["Scene decal count limit exceeded"]);
    expect(groups.map((group) => group.children[0]?.renderOrder)).toEqual(Array.from({ length: 32 }, (_, index) => index));
    test.frame.entities = test.frame.entities.filter((entity) => entity.entityId !== "projector-32").reverse();
    await test.manager.sync(test.frame, test.instances);
    const orders = new Map(test.scene.children.filter((object) => object.name === "game-decal")
      .map((group) => [group.userData.gameEntityId, group.children[0]?.renderOrder]));
    expect(orders.get("projector-31")).toBe(0);
    expect(orders.get("projector")).toBe(31);
  } finally { test.dispose(); }
});


it("rejects deformed or alpha-masked receivers with explicit diagnostics", async () => {
  const test = await fixture();
  try {
    test.wall.geometry.morphAttributes.position = [test.wall.geometry.getAttribute("position").clone()];
    await test.manager.sync(test.frame, test.instances);
    expect(test.diagnostics).toContain("Decal projector: Receivers must be rigid meshes without skinning, morph targets or instancing");
    expect(test.scene.children.some((object) => object.name === "game-decal")).toBe(false);
    delete test.wall.geometry.morphAttributes.position;
    test.wall.material.alphaTest = 0.5;
    await test.manager.sync(test.frame, test.instances);
    expect(test.diagnostics).toContain("Decal projector: Receivers must use visible opaque materials without alpha masking");
  } finally { test.dispose(); }
});

it("resets all owned resources before a new scene and can render again", async () => {
  const test = await fixture();
  try {
    await test.manager.sync(test.frame, test.instances);
    const first = decalMesh(test.scene).geometry;
    let disposed = false;
    first.addEventListener("dispose", () => { disposed = true; });
    await test.manager.reset();
    expect(disposed).toBe(true);
    expect(test.manager.geometryBytes).toBe(0);
    expect(test.manager.textureBytes).toBe(0);
    await test.manager.sync(test.frame, test.instances);
    expect(decalMesh(test.scene).geometry).not.toBe(first);
    expect(test.canonical).toHaveLength(2);
  } finally { test.dispose(); }
});


it("rebuilds when receiver material grouping changes its rendered faces", async () => {
  const test = await fixture();
  const original = test.wall.material;
  const wall: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]> = test.wall;
  try {
    await test.manager.sync(test.frame, test.instances);
    expect(test.manager.geometryBytes).toBeGreaterThan(0);
    wall.material = [original];
    await test.manager.sync(test.frame, test.instances);
    expect(test.manager.geometryBytes).toBe(0);
    wall.geometry.addGroup(0, wall.geometry.getIndex()?.count ?? 0, 0);
    await test.manager.sync(test.frame, test.instances);
    expect(test.manager.geometryBytes).toBeGreaterThan(0);
    expect(test.canonical).toHaveLength(1);
  } finally { wall.material = original; test.dispose(); }
});


it("detects replacement positions and refreshes stale receiver bounds", async () => {
  const test = await fixture();
  const position = test.wall.geometry.getAttribute("position");
  const inside = new Float32Array(position.array);
  const outside = inside.slice();
  for (let index = 0; index < outside.length; index += 3) { outside[index] = (outside[index] ?? 0) + 10; }
  test.wall.geometry.setAttribute("position", new THREE.BufferAttribute(outside, 3));
  try {
    await test.manager.sync(test.frame, test.instances);
    expect(test.manager.geometryBytes).toBe(0);
    expect(test.wall.geometry.boundingBox?.min.x).toBeGreaterThan(5);
    test.wall.geometry.setAttribute("position", new THREE.BufferAttribute(inside, 3));
    await test.manager.sync(test.frame, test.instances);
    expect(test.manager.geometryBytes).toBeGreaterThan(0);
    expect(test.wall.geometry.boundingBox?.min.x).toBeLessThan(0);
    const beforeIndex = decalMesh(test.scene).geometry;
    const index = test.wall.geometry.getIndex();
    if (!index) { throw new Error("Fixture index is missing"); }
    test.wall.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.array.slice(0, 3)), 1));
    await test.manager.sync(test.frame, test.instances);
    expect(decalMesh(test.scene).geometry).not.toBe(beforeIndex);
    const clipped = decalMesh(test.scene).geometry.getAttribute("position");
    let area = 0;
    for (let offset = 0; offset + 2 < clipped.count; offset += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(clipped, offset);
      const b = new THREE.Vector3().fromBufferAttribute(clipped, offset + 1);
      const c = new THREE.Vector3().fromBufferAttribute(clipped, offset + 2);
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    expect(area).toBe(0.5);
  } finally { test.dispose(); }
});
