/**
 * Tests for safetensors-inspector.ts — component and family detection from
 * tensor names (and, for a few UNet cases, tensor shapes).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { detectModel } from "../src/safetensors-inspector.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "safetensors-inspector-"));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

/** Write a .safetensors file whose header lists `keys`, all of shape [1] unless `shapes` names one. */
function writeModel(
  keys: string[],
  shapes: Record<string, number[]> = {},
  name = "model.safetensors"
): string {
  const tensors = Object.fromEntries(
    keys.map((key) => [
      key,
      { dtype: "F16", shape: shapes[key] ?? [1], data_offsets: [0, 2] }
    ])
  );
  const header = Buffer.from(
    JSON.stringify({ __metadata__: { format: "pt" }, ...tensors }),
    "utf-8"
  );
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(header.length), 0);
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, Buffer.concat([length, header, Buffer.alloc(16)]));
  return filePath;
}

const UNET_RESNET = "down_blocks.0.resnets.0.conv1.weight";
const UNET_CROSS_K =
  "down_blocks.1.attentions.0.transformer_blocks.0.attn2.to_k.weight";
const OPENCLIP_Q = "text_model.encoder.layers.0.self_attn.q_proj.weight";
const OPENAI_CLIP_Q =
  "cond.transformer.text_model.encoder.layers.0.self_attn.q_proj.weight";

describe("detectModel component inference", () => {
  it.each([
    {
      label: "a bare LoRA adapter",
      keys: ["unet.attn.lora_up.weight", "unet.attn.lora_down.weight"],
      component: "lora_adapter",
      family: "lora-adapter"
    },
    {
      label: "a CompVis single-file checkpoint",
      keys: ["model.diffusion_model.input_blocks.0.0.weight"],
      component: "unet",
      family: "sd1"
    },
    {
      label: "a VAE",
      keys: [
        "quant_conv.weight",
        "decoder.conv_out.weight",
        "encoder.conv_in.weight"
      ],
      component: "vae",
      family: "sd-vae"
    },
    {
      label: "an encoder without decoder.conv_out",
      keys: ["encoder.conv_in.weight"],
      component: "unknown",
      family: "unknown"
    },
    {
      label: "a Whisper checkpoint",
      keys: [
        "model.encoder.layers.0.self_attn.q_proj.weight",
        "model.decoder.layers.0.self_attn.q_proj.weight"
      ],
      component: "asr",
      family: "whisper"
    },
    {
      label: "a TTS model",
      keys: [
        "text_encoder.layers.0.weight",
        "decoder.layers.0.weight",
        "duration_predictor.conv.weight"
      ],
      component: "tts",
      family: "tts-generic"
    },
    {
      label: "a decoder-only LLM",
      keys: ["model.layers.0.self_attn.q_proj.weight"],
      component: "llm",
      family: "llama-family"
    },
    {
      label: "nothing recognizable",
      keys: ["foo.bar"],
      component: "unknown",
      family: "unknown"
    }
  ])("classifies $label", ({ keys, component, family }) => {
    const result = detectModel(writeModel(keys));
    expect(result).toMatchObject({ component, family });
  });

  it("keeps a LoRA that also carries structural keys out of the adapter bucket", () => {
    const result = detectModel(
      writeModel(["down_blocks.0.attn.lora_A.weight", UNET_RESNET])
    );
    expect(result.component).toBe("unet");
  });

  it("reports sample keys and file counts in details", () => {
    const result = detectModel(writeModel(["b.weight", "a.weight"]));
    expect(result.details).toMatchObject({
      num_files: 1,
      num_tensors: 2,
      sample_keys: ["a.weight", "b.weight"]
    });
  });

  it("reads every .safetensors file in a directory", () => {
    writeModel(["model.layers.0.mlp.weight"], {}, "a.safetensors");
    writeModel(["model.layers.1.mlp.weight"], {}, "b.safetensors");
    expect(detectModel(tmpDir).details).toMatchObject({
      num_files: 2,
      num_tensors: 2
    });
  });

  it("refuses an input with no .safetensors files", () => {
    expect(() => detectModel(tmpDir)).toThrow("No .safetensors files found.");
  });
});

describe("detectModel diffusion families", () => {
  it.each([
    {
      label: "a DiT transformer with embedder keys as flux",
      keys: ["transformer_blocks.0.attn.to_q.weight", "x_embedder.weight"],
      family: "flux",
      component: "transformer_denoiser"
    },
    {
      label: "a bare transformer denoiser as flux-like",
      keys: ["transformer_blocks.0.attn.to_q.weight"],
      family: "flux-like",
      component: "transformer_denoiser"
    },
    {
      label: "a CompVis checkpoint with conditioner embedders as sdxl-base",
      keys: [
        "model.diffusion_model.x.weight",
        "conditioner.embedders.0.weight"
      ],
      family: "sdxl-base",
      component: "unet"
    },
    {
      label: "a CompVis checkpoint with a CLIP transformer as sd1",
      keys: [
        "model.diffusion_model.x.weight",
        "cond_stage_model.transformer.x.weight"
      ],
      family: "sd1",
      component: "unet"
    },
    {
      label: "a CompVis checkpoint with an OpenCLIP model as sd2",
      keys: [
        "model.diffusion_model.x.weight",
        "cond_stage_model.model.x.weight"
      ],
      family: "sd2",
      component: "unet"
    },
    {
      label: "a UNet whose attentions hold transformer blocks as sdxl-base",
      keys: [
        "down_blocks.1.attentions.0.transformer_blocks.0.attn1.to_q.weight"
      ],
      family: "sdxl-base",
      component: "unet"
    },
    {
      label: "a UNet bundled with an OpenCLIP text encoder as sd2",
      keys: ["mid_block.resnets.0.conv1.weight", OPENCLIP_Q],
      family: "sd2",
      component: "unet"
    },
    {
      label: "a UNet bundled with an OpenAI CLIP text encoder as sd1",
      keys: ["mid_block.resnets.0.conv1.weight", OPENAI_CLIP_Q],
      family: "sd1",
      component: "unet"
    },
    {
      label: "a UNet with no deciding pattern as sd-or-sdxl-unknown",
      keys: ["up_blocks.0.resnets.0.conv1.weight"],
      family: "sd-or-sdxl-unknown",
      component: "unet"
    },
    {
      label: "an OpenCLIP text encoder",
      keys: [OPENCLIP_Q],
      family: "openclip-text-encoder",
      component: "text_encoder"
    },
    {
      label: "an OpenAI CLIP text encoder",
      keys: [OPENAI_CLIP_Q],
      family: "clip-text-encoder",
      component: "text_encoder"
    }
  ])("classifies $label", ({ keys, family, component }) => {
    expect(detectModel(writeModel(keys))).toMatchObject({ family, component });
  });

  it("reads the first resnet's input width to spot an SDXL refiner", () => {
    const result = detectModel(
      writeModel([UNET_RESNET], { [UNET_RESNET]: [384, 1280, 3, 3] })
    );
    expect(result).toMatchObject({ family: "sdxl-refiner", component: "unet" });
  });

  it.each([
    { crossDim: 768, family: "sd1" },
    { crossDim: 1024, family: "sd2" }
  ])(
    "maps a cross-attention width of $crossDim to $family",
    ({ crossDim, family }) => {
      const result = detectModel(
        writeModel(
          [UNET_RESNET, UNET_CROSS_K.replace("transformer_blocks.0.", "")],
          {
            [UNET_RESNET]: [320, 320, 3, 3],
            [UNET_CROSS_K.replace("transformer_blocks.0.", "")]: [320, crossDim]
          }
        )
      );
      expect(result).toMatchObject({ family, component: "unet" });
    }
  );

  it("skips shape reads once the budget is spent", () => {
    const result = detectModel(
      writeModel([UNET_RESNET], { [UNET_RESNET]: [384, 1280, 3, 3] }),
      0
    );
    expect(result.family).toBe("sd-or-sdxl-unknown");
  });
});
