import { createExecutor, createGPUContextFromDevice, createLabeledTexture,
  sourcesSolidV1, colorInvertV1, ALL_CATALOG, moduleKey } from "@nodetool-ai/gpu/pool";

export const catalogKeys = ALL_CATALOG.map((module) => moduleKey(module.id, module.version)).sort();

// A fixture-only host for the existing TypeScript Executor, not a plan runtime.
export async function renderFixture(plan, benchmark = false) {
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
        pass.retention !== (benchmark ? "volatile" : "retained")) {
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
    const prepared = [];
    for (const pass of plan.render.passes) {
      const solid = pass.module === "sources.solid@1";
      // These two fixture shaders operate on stored channel values. Their pool
      // contracts use encoded-sdr labels; no transfer-function conversion is added.
      const output = createLabeledTexture(device, { width, height, format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
        meta: { colorSpace: "encoded-sdr", alpha: "premultiplied" } });
      textures.set(pass.node, output);
      const data = values.get(pass.uniforms[0]);
      prepared.push({ ctx, module: solid ? sourcesSolidV1 : colorInvertV1,
        inputs: solid ? {} : { source: textures.get(pass.inputs.source) }, output,
        params: solid ? { color: data } : { amount: data[0] }, dispatch: { kind: "fragment" },
        workingFormat: "rgba8unorm" });
    }
    const presentation = createLabeledTexture(device, { width, height, format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const source = textures.get(plan.render.present.source);
    textures.set("$presentation", presentation);
    // Match the native present pass, including linear-to-sRGB conversion.
    const shader = device.createShaderModule({ code: `
      @group(0) @binding(0) var source: texture_2d<f32>;
      @vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
        let x = f32((index << 1u) & 2u); let y = f32(index & 2u);
        return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
      }
      @fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
        let c = textureLoad(source, vec2i(position.xy), 0);
        var rgb = select(vec3f(0), c.rgb / max(c.a, 1e-20), c.a > 0.0);
        rgb = select(1.055 * pow(max(rgb, vec3f(0)), vec3f(1.0/2.4)) - 0.055, 12.92 * rgb, rgb <= vec3f(0.0031308));
        return vec4f(rgb * c.a, c.a);
      }` });
    const pipeline = device.createRenderPipeline({ layout: "auto", vertex: { module: shader, entryPoint: "vertex" },
      fragment: { module: shader, entryPoint: "fragment", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
    const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: source.createView() }] });
    const view = presentation.createView();
    readback = device.createBuffer({ size: height * 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const packed = new Uint8Array(width * height * 4);
    const encodeMs = [], completeMs = [];
    for (let frame = 0; frame < (benchmark ? 150 : 1); frame++) {
      const start = performance.now();
      ctx.uniformRing.beginSubmission();
      const encoder = device.createCommandEncoder();
      for (const pass of prepared) { executor.encode({ ...pass, encoder }); }
      const present = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
      present.setPipeline(pipeline); present.setBindGroup(0, group); present.draw(3); present.end();
      encoder.copyTextureToBuffer({ texture: presentation.texture },
        { buffer: readback, bytesPerRow: 256 }, { width, height });
      device.queue.submit([encoder.finish()]);
      const mapped = readback.mapAsync(GPUMapMode.READ);
      const submitted = performance.now();
      await mapped;
      const padded = new Uint8Array(readback.getMappedRange());
      for (let y = 0; y < height; y++) { packed.set(padded.subarray(y * 256, y * 256 + width * 4), y * width * 4); }
      readback.unmap();
      if (benchmark && frame >= 30) {
        encodeMs.push(submitted - start);
        completeMs.push(performance.now() - start);
      }
    }
    const error = await device.popErrorScope();
    if (error) { throw new Error(error.message); }
    const pixels = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, alpha = packed[i + 3];
        for (let c = 0; c < 3; c++) {
          pixels.push(benchmark ? packed[i + c] : alpha === 0 ? 0 : Math.min(255, Math.floor((packed[i + c] * 255 + Math.floor(alpha / 2)) / alpha)));
        }
        pixels.push(alpha);
      }
    }
    return benchmark ? { encodeMs, completeMs, pixels } : pixels;
  } finally {
    readback?.destroy();
    for (const texture of textures.values()) { texture.destroy(); }
    ctx?.uniformRing.dispose();
    ctx?.scratch.dispose();
    device.destroy();
  }
}
