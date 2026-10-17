import * as THREE from "three";
import { expect, it } from "vitest";
import { GAME_DECAL_LIMITS_3D, gameDecalProjector3D, projectGameDecalGeometry3D, type GameDecalWork3D } from "../src/renderer3d/decals/geometry.js";

function work(): GameDecalWork3D { return { nodes: 0, sourceTriangles: 0, candidateTriangles: 0, outputVertices: 0 }; }

it("clips actual receiver triangles to a rotated world-space projector", () => {
  const geometry = new THREE.PlaneGeometry(4, 4);
  const material = new THREE.MeshStandardMaterial();
  const receiver = new THREE.Mesh(geometry, material);
  const projectorObject = new THREE.Object3D();
  projectorObject.position.set(0.5, 0.2, 0);
  projectorObject.rotation.z = Math.PI / 5;
  projectorObject.scale.set(2, 0.5, 1);
  receiver.updateMatrixWorld(); projectorObject.updateMatrixWorld();
  const projector = gameDecalProjector3D(projectorObject, { x: 1, y: 1, z: 0.5 });
  const output = projectGameDecalGeometry3D(receiver, projector, work());
  if (!output) { throw new Error("Projection did not intersect the receiver"); }
  const inverse = new THREE.Matrix4().compose(projector.position, new THREE.Quaternion().setFromEuler(projector.orientation), new THREE.Vector3(1, 1, 1)).invert();
  const point = new THREE.Vector3();
  try {
    const position = output.getAttribute("position");
    expect(position.count).toBeGreaterThan(0);
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(inverse);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(projector.size.x / 2 + 1e-6);
      expect(Math.abs(point.y)).toBeLessThanOrEqual(projector.size.y / 2 + 1e-6);
      expect(Math.abs(point.z)).toBeLessThanOrEqual(projector.size.z / 2 + 1e-6);
    }
  } finally { output.dispose(); geometry.dispose(); material.dispose(); }
});

it("preserves front-facing triangles under a negative nonuniform receiver transform", () => {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshStandardMaterial();
  const receiver = new THREE.Mesh(geometry, material);
  receiver.scale.set(-2, 0.5, 1);
  receiver.updateMatrixWorld();
  const projectorObject = new THREE.Object3D(); projectorObject.updateMatrixWorld();
  const output = projectGameDecalGeometry3D(receiver, gameDecalProjector3D(projectorObject, { x: 1, y: 1, z: 1 }), work());
  if (!output) { throw new Error("Projection did not intersect the receiver"); }
  try {
    const indices = output.getIndex();
    if (!indices) { throw new Error("Mirrored world-space geometry must retain front-face winding"); }
    const position = output.getAttribute("position");
    const normal = output.getAttribute("normal");
    const a = new THREE.Vector3().fromBufferAttribute(position, indices.getX(0));
    const b = new THREE.Vector3().fromBufferAttribute(position, indices.getX(1));
    const c = new THREE.Vector3().fromBufferAttribute(position, indices.getX(2));
    const face = b.sub(a).cross(c.sub(a)).normalize();
    expect(face.dot(new THREE.Vector3().fromBufferAttribute(normal, indices.getX(0)))).toBeGreaterThan(0.999);
  } finally { output.dispose(); geometry.dispose(); material.dispose(); }
});

it("bounds scanning on a large receiver without shrinking its source geometry", () => {
  const count = GAME_DECAL_LIMITS_3D.sourceTriangles + 1;
  const positions = new Float32Array(count * 9).fill(10);
  positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], positions.length - 9);
  const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.MeshStandardMaterial();
  const receiver = new THREE.Mesh(geometry, material); receiver.updateMatrixWorld();
  const projectorObject = new THREE.Object3D(); projectorObject.updateMatrixWorld();
  const budget = work();
  try {
    expect(() => projectGameDecalGeometry3D(receiver, gameDecalProjector3D(projectorObject, { x: 1, y: 1, z: 1 }), budget))
      .toThrow("source triangle work limit exceeded");
    expect(geometry.getAttribute("position").count).toBe(count * 3);
  } finally { geometry.dispose(); material.dispose(); }
});

it("bounds candidate clipping and aggregate output instead of returning a partial projection", () => {
  const positions = new Float32Array((GAME_DECAL_LIMITS_3D.candidateTriangles + 1) * 9);
  const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.MeshStandardMaterial();
  const receiver = new THREE.Mesh(geometry, material); receiver.updateMatrixWorld();
  const projectorObject = new THREE.Object3D(); projectorObject.updateMatrixWorld();
  const projector = gameDecalProjector3D(projectorObject, { x: 1, y: 1, z: 1 });
  try {
    expect(() => projectGameDecalGeometry3D(receiver, projector, work())).toThrow("candidate triangle work limit exceeded");
    const plane = new THREE.PlaneGeometry();
    const other = new THREE.Mesh(plane, material); other.updateMatrixWorld();
    try {
      expect(() => projectGameDecalGeometry3D(other, projector, { ...work(), outputVertices: GAME_DECAL_LIMITS_3D.outputVertices }))
        .toThrow("output vertex limit exceeded");
    } finally { plane.dispose(); }
  } finally { geometry.dispose(); material.dispose(); }
});


it("matches Three draw groups for single and array materials", () => {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(geometry, material);
  const object = new THREE.Object3D();
  mesh.updateMatrixWorld(); object.updateMatrixWorld();
  const projector = gameDecalProjector3D(object, { x: 3, y: 3, z: 1 });
  const counts = (): number => {
    const output = projectGameDecalGeometry3D(mesh, projector, work());
    try { return output?.getAttribute("position").count ?? 0; }
    finally { output?.dispose(); }
  };
  try {
    geometry.clearGroups();
    const full = counts();
    expect(full).toBe(6);
    geometry.addGroup(0, 3, 0);
    expect(counts()).toBe(full);
    mesh.material = [material];
    geometry.clearGroups();
    expect(counts()).toBe(0);
    geometry.addGroup(0, 3, 1);
    expect(counts()).toBe(0);
    geometry.addGroup(3, 3, 0);
    expect(counts()).toBe(3);
    material.visible = false;
    expect(counts()).toBe(0);
  } finally { geometry.dispose(); material.dispose(); }
});
