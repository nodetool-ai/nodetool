/**
 * Primitive geometry, generated to the same dimensions the browser editor's
 * `objectFactory.ts` gives three.js — a box added headlessly and a box added by
 * clicking in the editor are the same object.
 *
 * Meshes are indexed triangle lists with positions and normals; no UVs, since
 * nothing here assigns a texture. The plane keeps three.js's convention of
 * lying in XY and being rotated onto the ground by the node transform, so a
 * round trip through the editor does not move it.
 */

import type { Vec3 } from "./math.js";

export const PRIMITIVE_KINDS = [
  "box",
  "sphere",
  "plane",
  "cylinder",
  "torus",
  "directionalLight",
  "pointLight"
] as const;

export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

export const MESH_KINDS = [
  "box",
  "sphere",
  "plane",
  "cylinder",
  "torus"
] as const;

export type MeshKind = (typeof MESH_KINDS)[number];

export const isMeshKind = (kind: PrimitiveKind): kind is MeshKind =>
  (MESH_KINDS as readonly string[]).includes(kind);

export const PRIMITIVE_LABELS: Record<PrimitiveKind, string> = {
  box: "Box",
  sphere: "Sphere",
  plane: "Plane",
  cylinder: "Cylinder",
  torus: "Torus",
  directionalLight: "Directional Light",
  pointLight: "Point Light"
};

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** The node transform a freshly added primitive carries, in editor units. */
export interface PrimitiveDefaults {
  position: Vec3;
  /** Euler degrees, XYZ order. */
  rotation: Vec3;
  scale: Vec3;
}

const ORIGIN: PrimitiveDefaults = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1]
};

export const PRIMITIVE_DEFAULTS: Record<PrimitiveKind, PrimitiveDefaults> = {
  box: ORIGIN,
  sphere: ORIGIN,
  // three.js PlaneGeometry lies in XY; the editor tips it onto the ground.
  plane: { ...ORIGIN, rotation: [-90, 0, 0] },
  cylinder: ORIGIN,
  torus: ORIGIN,
  directionalLight: { ...ORIGIN, position: [2, 3, 2] },
  pointLight: { ...ORIGIN, position: [0, 2, 0] }
};

interface Builder {
  positions: number[];
  normals: number[];
  indices: number[];
}

const emptyBuilder = (): Builder => ({
  positions: [],
  normals: [],
  indices: []
});

const finish = (builder: Builder): Geometry => ({
  positions: new Float32Array(builder.positions),
  normals: new Float32Array(builder.normals),
  indices: new Uint32Array(builder.indices)
});

/**
 * A quad grid over one face, given a point/normal function of (u, v).
 *
 * Triangles come out counter-clockwise seen from the outside — the winding
 * glTF and three.js treat as front-facing — **provided the surface's frame is
 * right-handed**: ∂position/∂u × ∂position/∂v must point along `normal`. A
 * caller whose parametrization runs the other way renders inside-out, with
 * its near faces culled and its far ones lit from behind.
 */
function grid(
  builder: Builder,
  uSegments: number,
  vSegments: number,
  point: (u: number, v: number) => { position: Vec3; normal: Vec3 }
): void {
  const base = builder.positions.length / 3;
  for (let iv = 0; iv <= vSegments; iv += 1) {
    for (let iu = 0; iu <= uSegments; iu += 1) {
      const { position, normal } = point(iu / uSegments, iv / vSegments);
      builder.positions.push(position[0], position[1], position[2]);
      builder.normals.push(normal[0], normal[1], normal[2]);
    }
  }
  const stride = uSegments + 1;
  for (let iv = 0; iv < vSegments; iv += 1) {
    for (let iu = 0; iu < uSegments; iu += 1) {
      const a = base + iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      builder.indices.push(a, b, d, a, d, c);
    }
  }
}

function box(width = 1, height = 1, depth = 1): Geometry {
  const builder = emptyBuilder();
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const faces: { normal: Vec3; origin: Vec3; du: Vec3; dv: Vec3 }[] = [
    { normal: [0, 0, 1], origin: [-hx, -hy, hz], du: [width, 0, 0], dv: [0, height, 0] },
    { normal: [0, 0, -1], origin: [hx, -hy, -hz], du: [-width, 0, 0], dv: [0, height, 0] },
    { normal: [1, 0, 0], origin: [hx, -hy, hz], du: [0, 0, -depth], dv: [0, height, 0] },
    { normal: [-1, 0, 0], origin: [-hx, -hy, -hz], du: [0, 0, depth], dv: [0, height, 0] },
    { normal: [0, 1, 0], origin: [-hx, hy, hz], du: [width, 0, 0], dv: [0, 0, -depth] },
    { normal: [0, -1, 0], origin: [-hx, -hy, -hz], du: [width, 0, 0], dv: [0, 0, depth] }
  ];
  for (const face of faces) {
    grid(builder, 1, 1, (u, v) => ({
      position: [
        face.origin[0] + face.du[0] * u + face.dv[0] * v,
        face.origin[1] + face.du[1] * u + face.dv[1] * v,
        face.origin[2] + face.du[2] * u + face.dv[2] * v
      ],
      normal: face.normal
    }));
  }
  return finish(builder);
}

function sphere(radius = 0.5, widthSegments = 32, heightSegments = 16): Geometry {
  const builder = emptyBuilder();
  grid(builder, widthSegments, heightSegments, (u, v) => {
    const theta = v * Math.PI;
    // Sweeping u the negative way around keeps (∂u, ∂v, normal) right-handed,
    // which is what `grid` winds for. The surface itself is unchanged.
    const phi = -u * Math.PI * 2;
    const normal: Vec3 = [
      -Math.sin(theta) * Math.cos(phi),
      Math.cos(theta),
      Math.sin(theta) * Math.sin(phi)
    ];
    return {
      position: [normal[0] * radius, normal[1] * radius, normal[2] * radius],
      normal
    };
  });
  return finish(builder);
}

function plane(width = 2, height = 2): Geometry {
  const builder = emptyBuilder();
  grid(builder, 1, 1, (u, v) => ({
    position: [(u - 0.5) * width, (v - 0.5) * height, 0],
    normal: [0, 0, 1]
  }));
  return finish(builder);
}

function cylinder(
  radiusTop = 0.5,
  radiusBottom = 0.5,
  height = 1,
  radialSegments = 32
): Geometry {
  const builder = emptyBuilder();
  const slope = (radiusBottom - radiusTop) / height;
  grid(builder, radialSegments, 1, (u, v) => {
    const phi = u * Math.PI * 2;
    const radius = radiusBottom + (radiusTop - radiusBottom) * v;
    const nx = Math.sin(phi);
    const nz = Math.cos(phi);
    const length = Math.hypot(1, slope);
    return {
      position: [radius * nx, (v - 0.5) * height, radius * nz],
      normal: [nx / length, slope / length, nz / length]
    };
  });
  for (const [y, normalY, flip] of [
    [height / 2, 1, false],
    [-height / 2, -1, true]
  ] as const) {
    const radius = normalY > 0 ? radiusTop : radiusBottom;
    if (radius <= 0) {
      continue;
    }
    const center = builder.positions.length / 3;
    builder.positions.push(0, y, 0);
    builder.normals.push(0, normalY, 0);
    for (let i = 0; i <= radialSegments; i += 1) {
      const phi = (i / radialSegments) * Math.PI * 2;
      builder.positions.push(radius * Math.sin(phi), y, radius * Math.cos(phi));
      builder.normals.push(0, normalY, 0);
    }
    for (let i = 0; i < radialSegments; i += 1) {
      const a = center + 1 + i;
      const b = center + 2 + i;
      builder.indices.push(...(flip ? [center, b, a] : [center, a, b]));
    }
  }
  return finish(builder);
}

function torus(
  radius = 0.5,
  tube = 0.2,
  radialSegments = 16,
  tubularSegments = 64
): Geometry {
  const builder = emptyBuilder();
  grid(builder, tubularSegments, radialSegments, (u, v) => {
    // Negative sweep, for the same handedness reason as the sphere.
    const phi = -u * Math.PI * 2;
    const theta = v * Math.PI * 2;
    const normal: Vec3 = [
      Math.cos(theta) * Math.cos(phi),
      Math.sin(theta),
      Math.cos(theta) * Math.sin(phi)
    ];
    return {
      position: [
        (radius + tube * Math.cos(theta)) * Math.cos(phi),
        tube * Math.sin(theta),
        (radius + tube * Math.cos(theta)) * Math.sin(phi)
      ],
      normal
    };
  });
  return finish(builder);
}

/** Build the mesh for a primitive kind, at the editor's default dimensions. */
export function buildPrimitiveGeometry(kind: MeshKind): Geometry {
  switch (kind) {
    case "box":
      return box();
    case "sphere":
      return sphere();
    case "plane":
      return plane();
    case "cylinder":
      return cylinder();
    case "torus":
      return torus();
  }
}
