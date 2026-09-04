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
  const { withCamera = false, lightIntensity, withMesh = true } = options;
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
  if (withCamera) {
    gltf["cameras"] = [
      {
        type: "perspective",
        perspective: { yfov: 0.6, znear: 0.01, zfar: 100.0 }
      }
    ];
    nodes.push({ camera: 0 });
    sceneNodes.push(nodes.length - 1);
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
