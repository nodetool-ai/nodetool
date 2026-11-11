import { expect, it } from "vitest";
import { createNodeGPUDevice } from "../src/node.js";
import { createGPUContextFromDevice } from "../src/context.js";
import { createLabeledTexture } from "../src/texture.js";
import { createExecutor } from "../src/executor.js";
import { createRecipeRunner } from "../src/recipe.js";
import { createDefaultRegistry, filtersGlowV1, mixerDropShadowV1 } from "../src/pool.js";

it("keeps colour and coverage metadata on recipe intermediates across scratch reuse", async () => {
  const device = await createNodeGPUDevice();
  const ctx = createGPUContextFromDevice(device);
  const usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;
  const source = createLabeledTexture(device, { width: 4, height: 4, format: "rgba8unorm", usage });
  const output = createLabeledTexture(device, { width: 4, height: 4, format: "rgba8unorm", usage });
  const executor = createExecutor();
  try {
    expect(source.meta.colorSpace).toBe("encoded-sdr");
    device.queue.writeTexture({ texture: source.texture }, new Uint8Array(64).fill(255), { bytesPerRow: 16 }, [4, 4]);
    for (const recipe of [mixerDropShadowV1, filtersGlowV1, mixerDropShadowV1]) {
      const seen: string[] = [];
      const encoder = device.createCommandEncoder();
      ctx.uniformRing.beginSubmission();
      createRecipeRunner().encode({
        ctx, module: recipe, encoder, inputs: { source }, output,
        params: recipe.paramDefaults, registry: createDefaultRegistry(),
        executor: { encode(args) {
          if (args.module.id === "filters.blur.gaussian") {
            seen.push(args.inputs.source.meta.colorSpace, args.output.meta.colorSpace);
          }
          executor.encode(args);
        } }
      });
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      expect(seen).toEqual(Array(4).fill(recipe.id === "mixer.dropShadow" ? "data" : "encoded-sdr"));
    }
  } finally {
    source.destroy();
    output.destroy();
    ctx.scratch.dispose();
    device.destroy();
  }
});
