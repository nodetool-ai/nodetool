import { createExecutor, createGPUContextFromDevice, createLabeledTexture,
  sourcesSolidV1, colorInvertV1 } from "@nodetool-ai/gpu/pool";

// A fixture-only host for the existing TypeScript Executor, not a plan runtime.
export async function renderFixture(plan) {
  const { width, height } = plan.session;
  if (width !== 4 || height !== 4 || plan.slots.length !== 0) {
    throw new Error("Comparison supports only the 4x4 fixtures without slots");
  }
  const values = new Map();
  for (const op of plan.control.ops.filter((op) => op.domain === "render")) {
    if (op.op !== "constant" || op.in.length || values.has(op.out) ||
        !op.values.every(Number.isFinite)) {
      throw new Error("Unsupported render control operation");
    }
    values.set(op.out, op.values);
  }
  const nodes = new Set();
  for (const pass of plan.render.passes) {
    if (nodes.has(pass.node) || pass.uniforms.length !== 1 ||
        pass.output.format !== "rgba8unorm" || pass.output.size.kind !== "session" ||
        pass.output.alpha !== "premultiplied" || pass.output.colorSpace !== "linear" ||
        pass.retention !== "retained") {
      throw new Error("Unsupported render pass contract");
    }
    const data = values.get(pass.uniforms[0]);
    if (pass.module === "sources.solid@1") {
      if (Object.keys(pass.inputs).length || data?.length !== 4) {
        throw new Error("Unsupported solid binding");
      }
    } else if (pass.module === "color.invert@1") {
      if (Object.keys(pass.inputs).join() !== "source" || !nodes.has(pass.inputs.source) || data?.length !== 1) {
        throw new Error("Unsupported invert binding");
      }
    } else {
      throw new Error("Unsupported shader module");
    }
    nodes.add(pass.node);
  }
  if (!nodes.has(plan.render.present.source) || plan.render.present.colorSpace !== "srgb") {
    throw new Error("Unsupported presentation source");
  }
  const adapter = await navigator.gpu.requestAdapter({ forceFallbackAdapter: true });
  if (!adapter) { throw new Error("No software WebGPU adapter"); }
  const device = await adapter.requestDevice();
  const textures = new Map();
  let ctx, readback;
  try {
    ctx = createGPUContextFromDevice(device);
    const executor = createExecutor();
    device.pushErrorScope("validation");
    ctx.uniformRing.beginSubmission();
    const encoder = device.createCommandEncoder();
    for (const pass of plan.render.passes) {
      const solid = pass.module === "sources.solid@1";
      // These two fixture shaders operate on stored channel values. Their pool
      // contracts use encoded-sdr labels; no transfer-function conversion is added.
      const output = createLabeledTexture(device, { width, height, format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
        meta: { colorSpace: "encoded-sdr", alpha: "premultiplied" } });
      textures.set(pass.node, output);
      const data = values.get(pass.uniforms[0]);
      executor.encode({ ctx, encoder, module: solid ? sourcesSolidV1 : colorInvertV1,
        inputs: solid ? {} : { source: textures.get(pass.inputs.source) }, output,
        params: solid ? { color: data } : { amount: data[0] }, dispatch: { kind: "fragment" },
        workingFormat: "rgba8unorm" });
    }
    readback = device.createBuffer({ size: height * 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    encoder.copyTextureToBuffer({ texture: textures.get(plan.render.present.source).texture },
      { buffer: readback, bytesPerRow: 256 }, { width, height });
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const error = await device.popErrorScope();
    if (error) { throw new Error(error.message); }
    const padded = new Uint8Array(readback.getMappedRange());
    const pixels = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * 256 + x * 4, alpha = padded[i + 3];
        for (let c = 0; c < 3; c++) {
          pixels.push(alpha === 0 ? 0 : Math.min(255, Math.floor((padded[i + c] * 255 + Math.floor(alpha / 2)) / alpha)));
        }
        pixels.push(alpha);
      }
    }
    readback.unmap();
    return pixels;
  } finally {
    readback?.destroy();
    for (const texture of textures.values()) { texture.destroy(); }
    ctx?.uniformRing.dispose();
    ctx?.scratch.dispose();
    device.destroy();
  }
}
