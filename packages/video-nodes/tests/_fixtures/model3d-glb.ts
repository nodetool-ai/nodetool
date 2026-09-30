function pad4(length: number): number {
  return (4 - (length % 4)) % 4;
}

/** Wrap a glTF JSON chunk and its embedded binary buffer as a GLB. */
function packGlb(json: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = pad4(jsonBytes.byteLength);
  const binPad = pad4(bin.byteLength);
  const total =
    12 + 8 + jsonBytes.byteLength + jsonPad + 8 + bin.byteLength + binPad;

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
  view.setUint32(offset, bin.byteLength + binPad, true);
  view.setUint32(offset + 4, 0x004e4942, true); // "BIN"
  offset += 8;
  glb.set(bin, offset);
  return glb;
}

/** Minimal single-triangle GLB (embedded buffer, no indices). */
export function createTriangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bin = new Uint8Array(positions.buffer);
  return packGlb(
    {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
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
    },
    bin
  );
}

/**
 * A GLB with the same triangle and two named animations that translate it in
 * different directions over 2 s, so the same time renders differently under
 * each name. Built by hand because the repo ships no animated GLB fixture.
 */
export function createAnimatedGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const times = new Float32Array([0, 2]);
  const slide = new Float32Array([0, 0, 0, 0.4, 0, 0]);
  const rise = new Float32Array([0, 0, 0, 0, 0.4, 0]);

  const bin = new Uint8Array(
    positions.byteLength + times.byteLength + slide.byteLength + rise.byteLength
  );
  let at = 0;
  const offsets: number[] = [];
  for (const part of [positions, times, slide, rise]) {
    offsets.push(at);
    bin.set(new Uint8Array(part.buffer), at);
    at += part.byteLength;
  }

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "tri" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0]
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [2]
      },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: times.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: slide.byteLength },
      { buffer: 0, byteOffset: offsets[3], byteLength: rise.byteLength }
    ],
    buffers: [{ byteLength: bin.byteLength }],
    animations: [
      {
        name: "slide",
        samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      },
      {
        name: "rise",
        samplers: [{ input: 1, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }
    ]
  };

  return packGlb(json, bin);
}
