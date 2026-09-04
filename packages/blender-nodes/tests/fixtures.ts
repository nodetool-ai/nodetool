/**
 * Minimal GLB fixtures for the Blender node tests.
 *
 * Single-triangle scene (embedded buffer, no indices) in four variants:
 * plain (mesh only), with a scene camera, with a scene camera and a
 * `KHR_lights_punctual` sun, and meshless (camera only, for `no_geometry`).
 * Mirrors `model3d-render.test.ts` in video-nodes, extended with the camera
 * and light nodes the camera-mode tests need.
 */

export interface TriangleFixtureOptions {
  withCamera?: boolean;
  /**
   * Named scene cameras, in document order. When set, one camera and one
   * named node are appended per entry instead of the single `withCamera`
   * camera, so glTF order and alphabetical order can disagree.
   */
  cameraNames?: string[];
  /** KHR_lights_punctual sun intensity; omitted means no scene light. */
  lightIntensity?: number;
  withMesh?: boolean;
}

function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

export function createTriangleGlb(
  options: TriangleFixtureOptions = {}
): Uint8Array {
  const { withCamera = false, cameraNames, lightIntensity, withMesh = true } = options;
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(positions.buffer);
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [] as number[] }],
    nodes: [] as Array<Record<string, unknown>>,
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 } }] }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0]
      }
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    buffers: [{ byteLength: bin.byteLength }]
  };
  const nodes: Array<Record<string, unknown>> = [];
  const sceneNodes: number[] = [];
  (gltf["scenes"] as Array<{ nodes: number[] }>)[0]!.nodes = sceneNodes;
  gltf["nodes"] = nodes;

  if (withMesh) {
    nodes.push({ mesh: 0 });
    sceneNodes.push(nodes.length - 1);
  } else {
    delete gltf["meshes"];
    delete gltf["accessors"];
    delete gltf["bufferViews"];
    delete gltf["buffers"];
  }
  const namedCameras = cameraNames ?? (withCamera ? ["Camera"] : []);
  if (namedCameras.length > 0) {
    gltf["cameras"] = namedCameras.map(() => ({
      type: "perspective",
      perspective: { yfov: 0.6, znear: 0.01, zfar: 100.0 }
    }));
    namedCameras.forEach((name, index) => {
      nodes.push({ name, camera: index });
      sceneNodes.push(nodes.length - 1);
    });
  }
  if (lightIntensity !== undefined) {
    (gltf["extensions"] as Record<string, unknown>) ??= {};
    (gltf["extensions"] as Record<string, unknown>)["KHR_lights_punctual"] = {
      lights: [{ type: "directional", color: [1, 1, 1], intensity: lightIntensity }]
    };
    (gltf["extensionsUsed"] as string[]) ??= [];
    (gltf["extensionsUsed"] as string[]).push("KHR_lights_punctual");
    nodes.push({ extensions: { KHR_lights_punctual: { light: 0 } } });
    sceneNodes.push(nodes.length - 1);
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = pad4(jsonBytes.byteLength);
  const hasBin = withMesh;
  const binPad = hasBin ? pad4(bin.byteLength) : 0;
  const total =
    12 +
    8 +
    jsonBytes.byteLength +
    jsonPad +
    (hasBin ? 8 + bin.byteLength + binPad : 0);

  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  let offset = 0;
  view.setUint32(offset, 0x46546c67, true); // "glTF"
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, total, true);
  offset += 12;
  view.setUint32(offset, jsonBytes.byteLength + jsonPad, true);
  view.setUint32(offset + 4, 0x4e4f534a, true); // "JSON"
  offset += 8;
  glb.set(jsonBytes, offset);
  glb.fill(
    0x20,
    offset + jsonBytes.byteLength,
    offset + jsonBytes.byteLength + jsonPad
  );
  offset += jsonBytes.byteLength + jsonPad;
  if (hasBin) {
    view.setUint32(offset, bin.byteLength + binPad, true);
    view.setUint32(offset + 4, 0x004e4942, true); // "BIN"
    offset += 8;
    glb.set(bin, offset);
  }
  return glb;
}

/** Default `render_image` params; tests override per case. */
export function baseRenderImageParams(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    camera_mode: "orbit",
    azimuth: 45,
    elevation: 25,
    fov: 35,
    zoom: 1,
    lighting: "studio",
    light_intensity: 1,
    background_color: "#102030",
    transparent: false,
    engine: "eevee",
    samples: 16,
    denoise: true,
    resolution_percentage: 100,
    width: 64,
    height: 64,
    ...overrides
  };
}

/** Base64 model prop for `node run --props` and node tests. */
export function triangleModelProp(
  options: TriangleFixtureOptions = {}
): { type: string; format: string; data: string } {
  return {
    type: "model_3d",
    format: "glb",
    data: Buffer.from(createTriangleGlb(options)).toString("base64")
  };
}

export interface QuadSpec {
  /** Corner offsets (x, y) from the quad origin, in glTF units. */
  size: number;
  origin: [number, number];
  /** Constant glTF z of the plane. */
  z: number;
}

function buildGlb(
  quads: QuadSpec[],
  animations?: Record<string, unknown>[],
  materialCount = 1
): Uint8Array {
  const positions: number[] = [];
  const perMaterial: number[][] = Array.from({ length: materialCount }, () => []);
  for (const [qi, quad] of quads.entries()) {
    const [ox, oy] = quad.origin;
    const s = quad.size;
    const base = positions.length / 3;
    positions.push(
      ox, oy, quad.z,
      ox + s, oy, quad.z,
      ox + s, oy + s, quad.z,
      ox, oy + s, quad.z
    );
    // Counter-clockwise from +Z: the face normal is +glTF-Z, which the
    // importer maps onto Blender -Y — toward an azimuth-0 orbit camera.
    // Quads spread across materials round-robin, so two quads with two
    // materials land on two slots of one mesh.
    perMaterial[qi % materialCount]!.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const xs = positions.filter((_, i) => i % 3 === 0);
  const ys = positions.filter((_, i) => i % 3 === 1);
  const zs = positions.filter((_, i) => i % 3 === 2);
  const posBytes = new Float32Array(positions);
  // One index range per material, each with its own view and accessor, so
  // the mesh carries one primitive (and later one material slot) per
  // material. Empty ranges (more materials than quads) are dropped.
  const ranges = perMaterial.map((range) => new Uint16Array(range));
  const indexBytesLength = ranges.reduce((sum, range) => sum + range.byteLength, 0);
  const animOffset = posBytes.byteLength + indexBytesLength;
  const bin = new Uint8Array(animOffset + (animations ? 32 : 0));
  bin.set(new Uint8Array(posBytes.buffer), 0);
  const bufferViews: Record<string, unknown>[] = [
    { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength }
  ];
  const accessors: Record<string, unknown>[] = [
    {
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
      max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)]
    }
  ];
  const primitives: Record<string, unknown>[] = [];
  let indexOffset = posBytes.byteLength;
  for (const [mi, range] of ranges.entries()) {
    if (range.length === 0) continue;
    bin.set(new Uint8Array(range.buffer), indexOffset);
    bufferViews.push({
      buffer: 0,
      byteOffset: indexOffset,
      byteLength: range.byteLength
    });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: 5123,
      count: range.length,
      type: "SCALAR"
    });
    const primitive: Record<string, unknown> = {
      attributes: { POSITION: 0 },
      indices: accessors.length - 1
    };
    if (materialCount > 1) primitive["material"] = mi;
    primitives.push(primitive);
    indexOffset += range.byteLength;
  }
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.byteLength }]
  };
  if (materialCount > 1) {
    gltf["materials"] = Array.from({ length: materialCount }, (_, mi) => ({
      name: `Material${mi}`
    }));
  }
  if (animations) {
    const times = new Float32Array([0, 1]);
    const moved = new Float32Array([0, 0, 0, 2, 0, 0]);
    bin.set(new Uint8Array(times.buffer), animOffset);
    bin.set(new Uint8Array(moved.buffer), animOffset + 8);
    bufferViews.push(
      { buffer: 0, byteOffset: animOffset, byteLength: 8 },
      { buffer: 0, byteOffset: animOffset + 8, byteLength: 24 }
    );
    accessors.push(
      {
        bufferView: 2,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [1]
      },
      {
        bufferView: 3,
        componentType: 5126,
        count: 2,
        type: "VEC3",
        min: [0, 0, 0],
        max: [2, 0, 0]
      }
    );
    gltf["animations"] = animations;
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = pad4(jsonBytes.byteLength);
  const binPad = pad4(bin.byteLength);
  const total = 12 + 8 + jsonBytes.byteLength + jsonPad + 8 + bin.byteLength + binPad;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  let offset = 0;
  view.setUint32(offset, 0x46546c67, true);
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, total, true);
  offset += 12;
  view.setUint32(offset, jsonBytes.byteLength + jsonPad, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  offset += 8;
  glb.set(jsonBytes, offset);
  glb.fill(0x20, offset + jsonBytes.byteLength, offset + jsonBytes.byteLength + jsonPad);
  offset += jsonBytes.byteLength + jsonPad;
  view.setUint32(offset, bin.byteLength + binPad, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  offset += 8;
  glb.set(bin, offset);
  return glb;
}

/**
 * Grid fixture: `size` x `size` disjoint 1x1 quads on z=0, exactly
 * `2 * size * size` triangular faces. The prepare tests decimate it toward
 * a budget and assert the before/after face numbers.
 */
export function createGridGlb(size: number): Uint8Array {
  const quads: QuadSpec[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      quads.push({ size: 1, origin: [x, y], z: 0 });
    }
  }
  return buildGlb(quads);
}

/** Two separate mesh objects, each carrying a disjoint grid of faces. */
export function createTwoMeshGridGlb(width = 10, height = 5): Uint8Array {
  const positions: number[] = [];
  const accessors: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const sceneNodes: number[] = [];
  for (const meshIndex of [0, 1]) {
    const meshPositions: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ox = x + meshIndex * (width + 1);
        meshPositions.push(
          ox, y, 0,
          ox + 1, y, 0,
          ox + 1, y + 1, 0,
          ox, y + 1, 0,
          ox, y, 0,
          ox + 1, y + 1, 0
        );
        // Two triangles per quad, with no indices to keep the fixture compact.
      }
    }
    positions.push(...meshPositions);
    const xs = meshPositions.filter((_, i) => i % 3 === 0);
    const ys = meshPositions.filter((_, i) => i % 3 === 1);
    accessors.push({
      bufferView: meshIndex,
      componentType: 5126,
      count: meshPositions.length / 3,
      type: "VEC3",
      min: [Math.min(...xs), Math.min(...ys), 0],
      max: [Math.max(...xs), Math.max(...ys), 0]
    });
    meshes.push({
      primitives: [{ attributes: { POSITION: meshIndex } }]
    });
    nodes.push({ mesh: meshIndex });
    sceneNodes.push(meshIndex);
  }
  const posBytes = new Float32Array(positions);
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes,
    accessors,
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.byteLength / 2 },
      { buffer: 0, byteOffset: posBytes.byteLength / 2, byteLength: posBytes.byteLength / 2 }
    ],
    buffers: [{ byteLength: posBytes.byteLength }]
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = pad4(jsonBytes.byteLength);
  const binPad = pad4(posBytes.byteLength);
  const total = 12 + 8 + jsonBytes.byteLength + jsonPad + 8 + posBytes.byteLength + binPad;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonBytes, 20);
  glb.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonBytes.byteLength + jsonPad);
  const binOffset = 20 + jsonBytes.byteLength + jsonPad;
  view.setUint32(binOffset, posBytes.byteLength + binPad, true);
  view.setUint32(binOffset + 4, 0x004e4942, true);
  glb.set(new Uint8Array(posBytes.buffer), binOffset + 8);
  return glb;
}

/** Parse the JSON chunk of a GLB into a plain object. */
export function parseGlbJson(glb: Uint8Array): Record<string, unknown> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Not a GLB: bad magic.");
  }
  const jsonLength = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(
    glb.buffer,
    glb.byteOffset + 20,
    jsonLength
  );
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<string, unknown>;
}

export interface GlbImage {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Embedded images of a GLB in `images` order: the byte range each image's
 * buffer view names, sliced out of the BIN chunk. What the prepare tests
 * decode to prove a bake wrote light instead of packing a black default.
 */
export function extractGlbImages(glb: Uint8Array): GlbImage[] {
  const json = parseGlbJson(glb);
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const jsonPadded = jsonLength + ((4 - (jsonLength % 4)) % 4);
  // BIN chunk header (8 bytes) follows the JSON chunk; its bytes follow that.
  const bin = new Uint8Array(
    glb.buffer,
    glb.byteOffset + 20 + jsonPadded + 8,
    glb.byteLength - 20 - jsonPadded - 8
  );
  const bufferViews = (json["bufferViews"] ?? []) as Array<{
    byteOffset?: number;
    byteLength: number;
  }>;
  const images = (json["images"] ?? []) as Array<{
    bufferView?: number;
    mimeType?: string;
  }>;
  return images.map((image) => {
    if (image.bufferView === undefined) {
      throw new Error("GLB image has no bufferView.");
    }
    const bufferView = bufferViews[image.bufferView];
    if (!bufferView) throw new Error(`GLB image names missing bufferView ${image.bufferView}.`);
    const offset = bufferView.byteOffset ?? 0;
    return {
      bytes: bin.slice(offset, offset + bufferView.byteLength),
      mimeType: image.mimeType ?? ""
    };
  });
}

/**
 * Face count of a GLB: indices/3 per primitive, else POSITION/3. What the
 * prepare tests compare before and after decimation.
 */
export function countGlbFaces(glb: Uint8Array): number {
  const json = parseGlbJson(glb);
  const accessors = json["accessors"] as Array<{ count: number }>;
  const meshes = (json["meshes"] ?? []) as Array<{
    primitives: Array<{ indices?: number; attributes: { POSITION: number } }>;
  }>;
  let faces = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices !== undefined) {
        faces += accessors[primitive.indices]!.count / 3;
      } else {
        faces += accessors[primitive.attributes.POSITION]!.count / 3;
      }
    }
  }
  return faces;
}

/**
 * Depth fixture: a 1x1 front quad at glTF z=1 and a 2x2 back quad at z=0,
 * both centered on (0.5, 0.5). From an azimuth-0, elevation-0 orbit camera
 * every foreground pixel on one quad shares one view-axis depth, so with
 * `zoom: 1` the expected range is `(distance - 0.5, distance + 0.5)` where
 * `distance` is the documented framing distance for the bounds radius 1.5.
 * The back quad is larger so its border stays visible around the front one.
 */
export function createDepthGlb(): Uint8Array {
  return buildGlb([
    { size: 1, origin: [0, 0], z: 1 },
    { size: 2, origin: [-0.5, -0.5], z: 0 }
  ]);
}

/**
 * Two-material fixture: two side-by-side quads on z=0 (4 faces), one mesh,
 * one material slot per quad. A bake that wires only the active material
 * bakes half of this: one embedded image instead of two.
 */
export function createTwoMaterialGlb(): Uint8Array {
  return buildGlb(
    [
      { size: 1, origin: [0, 0], z: 0 },
      { size: 1, origin: [1.1, 0], z: 0 }
    ],
    undefined,
    2
  );
}

/**
 * Animation fixture: the depth scene with a linear translation channel
 * moving the node by +2 in x over t in [0, 1] seconds. At `fps: 2` the end
 * pose lands exactly on frame 2.
 */
export function createAnimatedGlb(): Uint8Array {
  const glb = buildGlb(
    [
      { size: 1, origin: [0, 0], z: 1 },
      { size: 2, origin: [-0.5, -0.5], z: 0 }
    ],
    [
      {
        samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }
    ]
  );
  return glb;
}
