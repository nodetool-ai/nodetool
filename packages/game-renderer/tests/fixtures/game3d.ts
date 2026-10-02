import { gameRenderFrame3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";

export function glb(json: object, binary = new Uint8Array()): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(text.length / 4) * 4;
  const binarySize = Math.ceil(binary.length / 4) * 4;
  const result = new Uint8Array(20 + jsonSize + (binary.length ? 8 + binarySize : 0));
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, result.length, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + jsonSize); result.set(text, 20);
  if (binary.length) { view.setUint32(20 + jsonSize, binarySize, true); view.setUint32(24 + jsonSize, 0x004e4942, true); result.set(binary, 28 + jsonSize); }
  return result;
}

export function triangleGlb(extra: object = {}): Uint8Array {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  return glb({ asset: { version: "2.0" }, buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0, ...extra }, new Uint8Array(positions.buffer));
}

export function blockoutFrame(): GameRenderFrame3D {
  const transform = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1], scale: { x: 1, y: 1, z: 1 } };
  return gameRenderFrame3D.parse({ dimension: "3d", gameId: "capture", sceneId: "scene", tick: 0,
    presentation: { aspectRatio: 1, hudWidth: 128, hudHeight: 128 },
    camera: { entityId: "camera", transform: { ...transform, position: { x: 0, y: 0, z: 5 } }, projection: { kind: "perspective", fov: 60, near: 0.1, far: 100 } },
    entities: [{ entityId: "box", transform, previousTransform: transform,
      primitive: { kind: "box", dimensions: { x: 2, y: 2, z: 2 }, material: { color: "#0088ff" } } }],
    lights: [], environment: { background: "#202838", ambient: { color: "#ffffff", intensity: 2 }, shadows: { enabled: false, mapSize: 512, extent: 20 } }, hud: [] });
}

export function skinnedGlb(texture?: Uint8Array): Uint8Array {
  const pieces: Array<Float32Array | Uint16Array | Uint8Array> = [new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]),
    new Uint16Array(12), new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    new Float32Array([0, 1]), new Float32Array([0, 0, 0, 1.5, 0, 0]),
    new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2])];
  if (texture) { pieces.push(new Float32Array([0, 0, 1, 0, 0.5, 1]), texture); }
  let offset = 0;
  const views = pieces.map((piece) => { const view = { buffer: 0, byteOffset: offset, byteLength: piece.byteLength }; offset += piece.byteLength; return view; });
  const binary = new Uint8Array(offset);
  pieces.forEach((piece, index) => binary.set(new Uint8Array(piece.buffer), views[index]?.byteOffset ?? 0));
  return glb({ asset: { version: "2.0" }, buffers: [{ byteLength: binary.length }], bufferViews: views,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 1, type: "MAT4" }, { bufferView: 4, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 5, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 6, componentType: 5126, count: 2, type: "VEC3" }, { bufferView: 7, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 8, componentType: 5126, count: 2, type: "VEC4" },
      ...(texture ? [{ bufferView: 9, componentType: 5126, count: 3, type: "VEC2" }] : [])],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2, ...(texture ? { TEXCOORD_0: 9 } : {}) }, material: 0 }] }],
    materials: [{ doubleSided: true, ...(texture ? { pbrMetallicRoughness: { metallicFactor: 0, baseColorTexture: { index: 0 } } } : {}) }],
    ...(texture ? { images: [{ bufferView: 10, mimeType: "image/png" }], textures: [{ source: 0 }] } : {}),
    nodes: [{ mesh: 0, skin: 0 }, { name: "joint" }], skins: [{ joints: [1], inverseBindMatrices: 3 }], scenes: [{ nodes: [0, 1] }], scene: 0,
    animations: [6, 5, 7, 8].map((output, index) => ({ name: ["idle", "run", "jump", "turn"][index], samplers: [{ input: 4, output, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 1, path: index === 3 ? "rotation" : "translation" } }] }))
  }, binary);
}
