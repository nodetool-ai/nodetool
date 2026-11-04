import { WGSL_PREMUL_HELPERS } from "../../src/shared/premulWgsl.js";

// I0 only. Encoded SDR values, no transfer conversion or fixed-function blending.
export const shader = `${WGSL_PREMUL_HELPERS}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var destination: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) p: vec3u) {
  let size = textureDimensions(source);
  if (any(p.xy >= size)) { return; }
  let xy = vec2i(p.xy);
  let d = Premul(textureLoad(source, xy, 0));
  // Flat interior of one round white brush dab, opacity 0.001.
  let inside = distance(vec2f(p.xy), vec2f(size) * 0.5) < f32(size.x) * 0.45;
  let a = select(0.0, 0.001, inside);
  textureStore(destination, xy, premulOver(Premul(vec4f(a)), d).v);
}`;

/** Serialized into headless Chromium as well as run on Dawn. No host imports. */
export async function runBrush(device: GPUDevice, code: string, initial: Float32Array, width: number, height: number, strokes: number) {
  const bytes = width * height * 16;
  const pitch = Math.ceil(width * 16 / 256) * 256;
  const textures = Array.from({ length: 2 }, () => device.createTexture({
    size: [width, height], format: "rgba32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
  }));
  const stage = device.createBuffer({ size: pitch * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const start = performance.now();
  const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ code }), entryPoint: "main" } });
  const compileMs = performance.now() - start;
  const groups = textures.map((texture, i) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
    { binding: 0, resource: texture.createView() }, { binding: 1, resource: textures[1 - i]!.createView() }
  ] }));
  let current = 0;
  let uploads = 0;
  let readbacks = 0;
  async function upload(data: Float32Array) {
    device.queue.writeTexture({ texture: textures[current]! }, data, { bytesPerRow: width * 16 }, [width, height]);
    await device.queue.onSubmittedWorkDone();
    uploads++;
  }
  async function capture() {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: textures[current]! }, { buffer: stage, bytesPerRow: pitch }, [width, height]);
    device.queue.submit([encoder.finish()]);
    await stage.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(stage.getMappedRange());
    const result = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      new Uint8Array(result.buffer, y * width * 16, width * 16).set(mapped.subarray(y * pitch, y * pitch + width * 16));
    }
    stage.unmap();
    readbacks++;
    return result;
  }
  try {
    let t = performance.now();
    await upload(initial);
    const uploadMs = performance.now() - t;
    const times: number[] = [];
    for (let i = 0; i < strokes; i++) {
      t = performance.now();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, groups[current]!);
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8)); pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      current = 1 - current;
      times.push(performance.now() - t);
    }
    t = performance.now();
    const edited = await capture();
    const readbackMs = performance.now() - t;
    t = performance.now();
    await upload(initial); // Undo from the completed pre-stroke snapshot.
    const undo = await capture();
    await upload(edited); // Redo from the completed post-stroke snapshot.
    const redo = await capture();
    const historyMs = performance.now() - t;
    return { edited, undo, redo,
      compileMs, uploadMs, readbackMs, historyMs, times, uploads, readbacks,
      gpuBytes: 2 * bytes + pitch * height, cpuSnapshotBytes: bytes * 2 };
  } finally {
    for (const texture of textures) { texture.destroy(); }
    stage.destroy();
  }
}
