import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import type { GameDecal3D } from "@nodetool-ai/protocol";

export const GAME_DECAL_LIMITS_3D = {
  sceneNodes: 4096, sourceTriangles: 200000, candidateTriangles: 4096, outputVertices: 196608
} as const;

export interface GameDecalWork3D {
  nodes: number;
  sourceTriangles: number;
  candidateTriangles: number;
  outputVertices: number;
}

export interface GameDecalProjector3D {
  readonly position: THREE.Vector3;
  readonly orientation: THREE.Euler;
  readonly size: THREE.Vector3;
  readonly bounds: THREE.Box3;
}

export class GameDecalProjectionError3D extends Error {}

const BOUNDS_POSITION_KEYS = new WeakMap<THREE.BufferGeometry, string>();

export function gameDecalAttributeKey3D(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): string {
  if (!attribute) { return "none"; }
  return attribute instanceof THREE.InterleavedBufferAttribute
    ? `${attribute.data.uuid}:${attribute.data.version}:${attribute.offset}:${attribute.itemSize}:${attribute.normalized}`
    : `${attribute.id}:${attribute.version}:${attribute.normalized}`;
}

function drawRanges(geometry: THREE.BufferGeometry, count: number, materials: THREE.Material | THREE.Material[]): { start: number; end: number }[] {
  const first = Math.max(0, geometry.drawRange.start);
  const last = Math.min(count, first + geometry.drawRange.count);
  if (!Array.isArray(materials)) { return [{ start: first, end: last }]; }
  const ranges = geometry.groups.filter(group => group.materialIndex !== undefined && materials[group.materialIndex]?.visible === true).map((group) => ({ start: Math.max(first, group.start), end: Math.min(last, group.start + group.count) }))
    .filter((range) => range.end > range.start).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) { previous.end = Math.max(previous.end, range.end); }
    else { merged.push(range); }
  }
  return merged;
}

export function gameDecalProjector3D(object: THREE.Object3D, size: GameDecal3D["size"]): GameDecalProjector3D {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  const extent = new THREE.Vector3(size.x * Math.abs(scale.x), size.y * Math.abs(scale.y), size.z * Math.abs(scale.z));
  if (![extent.x, extent.y, extent.z].every((value) => Number.isFinite(value) && value > 0 && value <= 1000000)) {
    throw new GameDecalProjectionError3D("Projector world extents must be positive and at most 1000000 units");
  }
  const half = extent.clone().multiplyScalar(0.5);
  const bounds = new THREE.Box3(half.clone().negate(), half.clone())
    .applyMatrix4(new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)));
  return { position, orientation: new THREE.Euler().setFromQuaternion(quaternion), size: extent, bounds };
}

/** Clips only candidate triangles. The temporary source keeps local coordinates for Three's normal transform. */
export function projectGameDecalGeometry3D(receiver: THREE.Mesh, projector: GameDecalProjector3D,
  work: GameDecalWork3D): THREE.BufferGeometry | null {
  const source = receiver.geometry;
  const position = source.getAttribute("position");
  const positionKey = gameDecalAttributeKey3D(position);
  if (!source.boundingBox || BOUNDS_POSITION_KEYS.get(source) !== positionKey) {
    source.computeBoundingBox();
    BOUNDS_POSITION_KEYS.set(source, positionKey);
  }
  if (!source.boundingBox || !source.boundingBox.clone().applyMatrix4(receiver.matrixWorld).intersectsBox(projector.bounds)) { return null; }
  const normal = source.getAttribute("normal");
  const index = source.getIndex();
  const vertexCount = index?.count ?? position.count;
  const positions: number[] = [];
  const normals: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triangleBounds = new THREE.Box3();
  for (const range of drawRanges(source, vertexCount, receiver.material)) {
    for (let cursor = range.start; cursor + 2 < range.end; cursor += 3) {
      work.sourceTriangles += 1;
      if (work.sourceTriangles > GAME_DECAL_LIMITS_3D.sourceTriangles) {
        throw new GameDecalProjectionError3D("Scene decal source triangle work limit exceeded");
      }
      const firstIndex = index ? index.getX(cursor) : cursor;
      const secondIndex = index ? index.getX(cursor + 1) : cursor + 1;
      const thirdIndex = index ? index.getX(cursor + 2) : cursor + 2;
      a.fromBufferAttribute(position, firstIndex).applyMatrix4(receiver.matrixWorld);
      b.fromBufferAttribute(position, secondIndex).applyMatrix4(receiver.matrixWorld);
      c.fromBufferAttribute(position, thirdIndex).applyMatrix4(receiver.matrixWorld);
      triangleBounds.makeEmpty().expandByPoint(a).expandByPoint(b).expandByPoint(c);
      if (!triangleBounds.intersectsBox(projector.bounds)) { continue; }
      work.candidateTriangles += 1;
      if (work.candidateTriangles > GAME_DECAL_LIMITS_3D.candidateTriangles) {
        throw new GameDecalProjectionError3D("Scene decal candidate triangle work limit exceeded");
      }
      for (const id of [firstIndex, secondIndex, thirdIndex]) {
        positions.push(position.getX(id), position.getY(id), position.getZ(id));
        if (normal) { normals.push(normal.getX(id), normal.getY(id), normal.getZ(id)); }
      }
    }
  }
  if (positions.length === 0) { return null; }
  const subset = new THREE.BufferGeometry();
  subset.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normal) { subset.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3)); }
  else { subset.computeVertexNormals(); }
  const mesh = new THREE.Mesh(subset, receiver.material);
  mesh.matrixWorld.copy(receiver.matrixWorld);
  let output: THREE.BufferGeometry | undefined;
  try {
    output = new DecalGeometry(mesh, projector.position, projector.orientation, projector.size);
    const count = output.getAttribute("position").count;
    if (count === 0) { return null; }
    work.outputVertices += count;
    if (work.outputVertices > GAME_DECAL_LIMITS_3D.outputVertices) {
      throw new GameDecalProjectionError3D("Scene decal output vertex limit exceeded");
    }
    if (receiver.matrixWorld.determinant() < 0) {
      const reversed = new Uint32Array(count);
      for (let cursor = 0; cursor < count; cursor += 3) {
        reversed[cursor] = cursor; reversed[cursor + 1] = cursor + 2; reversed[cursor + 2] = cursor + 1;
      }
      output.setIndex(new THREE.BufferAttribute(reversed, 1));
    }
    const result = output;
    output = undefined;
    return result;
  } finally { subset.dispose(); output?.dispose(); }
}
