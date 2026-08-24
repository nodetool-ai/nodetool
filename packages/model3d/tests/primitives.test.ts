/**
 * Every primitive's triangles must be wound counter-clockwise seen from
 * outside, which is what glTF and three.js treat as front-facing. A surface
 * wound the other way renders inside-out: its near faces are culled and its
 * far ones are lit from behind.
 *
 * The check is per triangle: the normal implied by the vertex order has to
 * agree with the normals the geometry actually stores. Nothing else catches
 * this — the mesh has the right vertices either way, so a shape test passes
 * on a box you can see straight through.
 */
import { describe, expect, it } from "vitest";

import { MESH_KINDS, buildPrimitiveGeometry } from "../src/primitives.js";
import type { Geometry } from "../src/primitives.js";

/** Triangles whose winding disagrees with their own stored normals. */
function inverted(geometry: Geometry): number {
  const { positions, normals, indices } = geometry;
  const at = (index: number, array: Float32Array): [number, number, number] => [
    array[index * 3],
    array[index * 3 + 1],
    array[index * 3 + 2]
  ];

  let count = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [ia, ib, ic] = [indices[i], indices[i + 1], indices[i + 2]];
    const a = at(ia, positions);
    const b = at(ib, positions);
    const c = at(ic, positions);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const face = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ];
    if (Math.hypot(face[0], face[1], face[2]) < 1e-9) {
      continue; // Degenerate (a pole fan): no winding to judge.
    }
    const na = at(ia, normals);
    const nb = at(ib, normals);
    const nc = at(ic, normals);
    const vertex = [
      (na[0] + nb[0] + nc[0]) / 3,
      (na[1] + nb[1] + nc[1]) / 3,
      (na[2] + nb[2] + nc[2]) / 3
    ];
    const dot =
      face[0] * vertex[0] + face[1] * vertex[1] + face[2] * vertex[2];
    if (dot <= 0) {
      count += 1;
    }
  }
  return count;
}

describe("primitive geometry", () => {
  it.each(MESH_KINDS)("winds %s outward", (kind) => {
    const geometry = buildPrimitiveGeometry(kind);
    expect(geometry.indices.length).toBeGreaterThan(0);
    expect(inverted(geometry)).toBe(0);
  });

  it("reports a deliberately reversed mesh", () => {
    // Proves the check can fail: reverse each triangle of a known-good mesh
    // and every one of them must be reported.
    const geometry = buildPrimitiveGeometry("box");
    const flipped = new Uint32Array(geometry.indices);
    for (let i = 0; i < flipped.length; i += 3) {
      const swap = flipped[i + 1];
      flipped[i + 1] = flipped[i + 2];
      flipped[i + 2] = swap;
    }
    expect(inverted({ ...geometry, indices: flipped })).toBe(
      geometry.indices.length / 3
    );
  });
});
