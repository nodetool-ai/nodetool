import {getNodeGPUDevice} from "@nodetool-ai/gpu/node";
import {createGPUContextFromDevice, createExecutor, blurGaussianV1, createLabeledTexture} from "@nodetool-ai/gpu/pool";
import * as d from "typegpu/data";

// Run after building gpu. Measures warm encode, submit and completion for two passes.
async function main() {
  const gpu = await getNodeGPUDevice(), ctx = createGPUContextFromDevice(gpu), executor = createExecutor();
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING;
    const source = createLabeledTexture(gpu, {width, height, format: "rgba8unorm", usage});
    const middle = createLabeledTexture(gpu, {width, height, format: "rgba8unorm", usage});
    const output = createLabeledTexture(gpu, {width, height, format: "rgba8unorm", usage});
    gpu.queue.writeTexture({texture: source.texture}, new Uint8Array(width * height * 4).fill(255), {bytesPerRow: width * 4}, {width, height});
    for (const radius of [20, 128, 256]) {
      const times = [];
      for (let i = 0; i < 4; i++) {
        const start = performance.now(), encoder = gpu.createCommandEncoder();
        for (const [input, target, direction] of [[source, middle, d.vec2f(1, 0)], [middle, output, d.vec2f(0, 1)]]) {
          executor.encode({ctx, module: blurGaussianV1, encoder, inputs: {source: input}, output: target,
            params: {radius, sigma: 0, direction}, dispatch: {kind: "compute", x: Math.ceil(width / 16), y: Math.ceil(height / 16), z: 1}});
        }
        gpu.queue.submit([encoder.finish()]);
        await gpu.queue.onSubmittedWorkDone();
        if (i) { times.push(performance.now() - start); }
      }
      console.log(JSON.stringify({width, height, radius, medianMs: times.sort((a, b) => a - b)[1]}));
    }
    source.destroy(); middle.destroy(); output.destroy();
  }
  ctx.uniformRing.dispose(); ctx.scratch.dispose(); gpu.destroy();
  await new Promise(resolve => process.stdout.write("", resolve));
}
// The retained Dawn instance keeps its event runner alive in one-shot Node hosts.
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
