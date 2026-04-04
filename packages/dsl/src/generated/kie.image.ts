// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Flux 2 Pro Text To Image — kie.image.Flux2ProTextToImage
export interface Flux2ProTextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Flux2ProTextToImageOutputs {
  output: ImageRef;
}

export function flux2ProTextToImage(
  inputs: Flux2ProTextToImageInputs
): DslNode<Flux2ProTextToImageOutputs, "output"> {
  return createNode(
    "kie.image.Flux2ProTextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Flux 2 Pro Image To Image — kie.image.Flux2ProImageToImage
export interface Flux2ProImageToImageInputs {
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Flux2ProImageToImageOutputs {
  output: ImageRef;
}

export function flux2ProImageToImage(
  inputs: Flux2ProImageToImageInputs
): DslNode<Flux2ProImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.Flux2ProImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Flux 2 Flex Text To Image — kie.image.Flux2FlexTextToImage
export interface Flux2FlexTextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Flux2FlexTextToImageOutputs {
  output: ImageRef;
}

export function flux2FlexTextToImage(
  inputs: Flux2FlexTextToImageInputs
): DslNode<Flux2FlexTextToImageOutputs, "output"> {
  return createNode(
    "kie.image.Flux2FlexTextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Flux 2 Flex Image To Image — kie.image.Flux2FlexImageToImage
export interface Flux2FlexImageToImageInputs {
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface Flux2FlexImageToImageOutputs {
  output: ImageRef;
}

export function flux2FlexImageToImage(
  inputs: Flux2FlexImageToImageInputs
): DslNode<Flux2FlexImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.Flux2FlexImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedream 4.5 Text To Image — kie.image.Seedream45TextToImage
export interface Seedream45TextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface Seedream45TextToImageOutputs {
  output: ImageRef;
}

export function seedream45TextToImage(
  inputs: Seedream45TextToImageInputs
): DslNode<Seedream45TextToImageOutputs, "output"> {
  return createNode(
    "kie.image.Seedream45TextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedream 4.5 Edit — kie.image.Seedream45Edit
export interface Seedream45EditInputs {
  prompt?: Connectable<string>;
  image_input?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface Seedream45EditOutputs {
  output: ImageRef;
}

export function seedream45Edit(
  inputs: Seedream45EditInputs
): DslNode<Seedream45EditOutputs, "output"> {
  return createNode(
    "kie.image.Seedream45Edit",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Z-Image Turbo — kie.image.ZImage
export interface ZImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export interface ZImageOutputs {
  output: ImageRef;
}

export function zImage(inputs: ZImageInputs): DslNode<ZImageOutputs, "output"> {
  return createNode("kie.image.ZImage", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Nano Banana — kie.image.NanoBanana
export interface NanoBananaInputs {
  prompt?: Connectable<string>;
  image_size?: Connectable<unknown>;
}

export interface NanoBananaOutputs {
  output: ImageRef;
}

export function nanoBanana(
  inputs: NanoBananaInputs
): DslNode<NanoBananaOutputs, "output"> {
  return createNode("kie.image.NanoBanana", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Nano Banana Pro — kie.image.NanoBananaPro
export interface NanoBananaProInputs {
  prompt?: Connectable<string>;
  image_input?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export interface NanoBananaProOutputs {
  output: ImageRef;
}

export function nanoBananaPro(
  inputs: NanoBananaProInputs
): DslNode<NanoBananaProOutputs, "output"> {
  return createNode(
    "kie.image.NanoBananaPro",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Flux Kontext — kie.image.FluxKontext
export interface FluxKontextInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  mode?: Connectable<unknown>;
}

export interface FluxKontextOutputs {
  output: ImageRef;
}

export function fluxKontext(
  inputs: FluxKontextInputs
): DslNode<FluxKontextOutputs, "output"> {
  return createNode(
    "kie.image.FluxKontext",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Grok Imagine Text To Image — kie.image.GrokImagineTextToImage
export interface GrokImagineTextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export interface GrokImagineTextToImageOutputs {
  output: ImageRef;
}

export function grokImagineTextToImage(
  inputs: GrokImagineTextToImageInputs
): DslNode<GrokImagineTextToImageOutputs, "output"> {
  return createNode(
    "kie.image.GrokImagineTextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Grok Imagine Upscale — kie.image.GrokImagineUpscale
export interface GrokImagineUpscaleInputs {
  image?: Connectable<ImageRef>;
}

export interface GrokImagineUpscaleOutputs {
  output: ImageRef;
}

export function grokImagineUpscale(
  inputs: GrokImagineUpscaleInputs
): DslNode<GrokImagineUpscaleOutputs, "output"> {
  return createNode(
    "kie.image.GrokImagineUpscale",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Qwen Text To Image — kie.image.QwenTextToImage
export interface QwenTextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export interface QwenTextToImageOutputs {
  output: ImageRef;
}

export function qwenTextToImage(
  inputs: QwenTextToImageInputs
): DslNode<QwenTextToImageOutputs, "output"> {
  return createNode(
    "kie.image.QwenTextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Qwen Image To Image — kie.image.QwenImageToImage
export interface QwenImageToImageInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  aspect_ratio?: Connectable<unknown>;
}

export interface QwenImageToImageOutputs {
  output: ImageRef;
}

export function qwenImageToImage(
  inputs: QwenImageToImageInputs
): DslNode<QwenImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.QwenImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Topaz Image Upscale — kie.image.TopazImageUpscale
export interface TopazImageUpscaleInputs {
  image?: Connectable<ImageRef>;
  upscale_factor?: Connectable<unknown>;
}

export interface TopazImageUpscaleOutputs {
  output: ImageRef;
}

export function topazImageUpscale(
  inputs: TopazImageUpscaleInputs
): DslNode<TopazImageUpscaleOutputs, "output"> {
  return createNode(
    "kie.image.TopazImageUpscale",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Recraft Remove Background — kie.image.RecraftRemoveBackground
export interface RecraftRemoveBackgroundInputs {
  image?: Connectable<ImageRef>;
}

export interface RecraftRemoveBackgroundOutputs {
  output: ImageRef;
}

export function recraftRemoveBackground(
  inputs: RecraftRemoveBackgroundInputs
): DslNode<RecraftRemoveBackgroundOutputs, "output"> {
  return createNode(
    "kie.image.RecraftRemoveBackground",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ideogram Character — kie.image.IdeogramCharacter
export interface IdeogramCharacterInputs {
  prompt?: Connectable<string>;
  reference_images?: Connectable<ImageRef[]>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  image_size?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
  seed?: Connectable<number>;
}

export interface IdeogramCharacterOutputs {
  output: ImageRef;
}

export function ideogramCharacter(
  inputs: IdeogramCharacterInputs
): DslNode<IdeogramCharacterOutputs, "output"> {
  return createNode(
    "kie.image.IdeogramCharacter",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ideogram Character Edit — kie.image.IdeogramCharacterEdit
export interface IdeogramCharacterEditInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  reference_images?: Connectable<ImageRef[]>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  seed?: Connectable<number>;
}

export interface IdeogramCharacterEditOutputs {
  output: ImageRef;
}

export function ideogramCharacterEdit(
  inputs: IdeogramCharacterEditInputs
): DslNode<IdeogramCharacterEditOutputs, "output"> {
  return createNode(
    "kie.image.IdeogramCharacterEdit",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ideogram Character Remix — kie.image.IdeogramCharacterRemix
export interface IdeogramCharacterRemixInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  reference_images?: Connectable<ImageRef[]>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  image_size?: Connectable<unknown>;
  strength?: Connectable<number>;
  negative_prompt?: Connectable<string>;
  additional_images?: Connectable<ImageRef[]>;
  reference_mask_urls?: Connectable<string>;
}

export interface IdeogramCharacterRemixOutputs {
  output: ImageRef;
}

export function ideogramCharacterRemix(
  inputs: IdeogramCharacterRemixInputs
): DslNode<IdeogramCharacterRemixOutputs, "output"> {
  return createNode(
    "kie.image.IdeogramCharacterRemix",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ideogram V3 Reframe — kie.image.IdeogramV3Reframe
export interface IdeogramV3ReframeInputs {
  image?: Connectable<ImageRef>;
  image_size?: Connectable<unknown>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export interface IdeogramV3ReframeOutputs {
  output: ImageRef;
}

export function ideogramV3Reframe(
  inputs: IdeogramV3ReframeInputs
): DslNode<IdeogramV3ReframeOutputs, "output"> {
  return createNode(
    "kie.image.IdeogramV3Reframe",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Recraft Crisp Upscale — kie.image.RecraftCrispUpscale
export interface RecraftCrispUpscaleInputs {
  image?: Connectable<ImageRef>;
}

export interface RecraftCrispUpscaleOutputs {
  output: ImageRef;
}

export function recraftCrispUpscale(
  inputs: RecraftCrispUpscaleInputs
): DslNode<RecraftCrispUpscaleOutputs, "output"> {
  return createNode(
    "kie.image.RecraftCrispUpscale",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Imagen 4 Fast — kie.image.Imagen4Fast
export interface Imagen4FastInputs {
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export interface Imagen4FastOutputs {
  output: ImageRef;
}

export function imagen4Fast(
  inputs: Imagen4FastInputs
): DslNode<Imagen4FastOutputs, "output"> {
  return createNode(
    "kie.image.Imagen4Fast",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Imagen 4 Ultra — kie.image.Imagen4Ultra
export interface Imagen4UltraInputs {
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export interface Imagen4UltraOutputs {
  output: ImageRef;
}

export function imagen4Ultra(
  inputs: Imagen4UltraInputs
): DslNode<Imagen4UltraOutputs, "output"> {
  return createNode(
    "kie.image.Imagen4Ultra",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Imagen 4 — kie.image.Imagen4
export interface Imagen4Inputs {
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export interface Imagen4Outputs {
  output: ImageRef;
}

export function imagen4(
  inputs: Imagen4Inputs
): DslNode<Imagen4Outputs, "output"> {
  return createNode("kie.image.Imagen4", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Nano Banana Edit — kie.image.NanoBananaEdit
export interface NanoBananaEditInputs {
  prompt?: Connectable<string>;
  image_input?: Connectable<ImageRef[]>;
  image_size?: Connectable<unknown>;
}

export interface NanoBananaEditOutputs {
  output: ImageRef;
}

export function nanoBananaEdit(
  inputs: NanoBananaEditInputs
): DslNode<NanoBananaEditOutputs, "output"> {
  return createNode(
    "kie.image.NanoBananaEdit",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// GPT 4o Image Text To Image — kie.image.GPTImage4oTextToImage
export interface GPTImage4oTextToImageInputs {
  prompt?: Connectable<string>;
  size?: Connectable<unknown>;
  n_variants?: Connectable<number>;
  is_enhance?: Connectable<boolean>;
}

export interface GPTImage4oTextToImageOutputs {
  output: ImageRef;
}

export function gptImage4oTextToImage(
  inputs: GPTImage4oTextToImageInputs
): DslNode<GPTImage4oTextToImageOutputs, "output"> {
  return createNode(
    "kie.image.GPTImage4oTextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// GPT 4o Image Edit — kie.image.GPTImage4oImageToImage
export interface GPTImage4oImageToImageInputs {
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  size?: Connectable<unknown>;
  n_variants?: Connectable<number>;
}

export interface GPTImage4oImageToImageOutputs {
  output: ImageRef;
}

export function gptImage4oImageToImage(
  inputs: GPTImage4oImageToImageInputs
): DslNode<GPTImage4oImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.GPTImage4oImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// GPT Image 1.5 Text To Image — kie.image.GPTImage15TextToImage
export interface GPTImage15TextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface GPTImage15TextToImageOutputs {
  output: ImageRef;
}

export function gptImage15TextToImage(
  inputs: GPTImage15TextToImageInputs
): DslNode<GPTImage15TextToImageOutputs, "output"> {
  return createNode(
    "kie.image.GPTImage15TextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// GPT Image 1.5 Edit — kie.image.GPTImage15ImageToImage
export interface GPTImage15ImageToImageInputs {
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface GPTImage15ImageToImageOutputs {
  output: ImageRef;
}

export function gptImage15ImageToImage(
  inputs: GPTImage15ImageToImageInputs
): DslNode<GPTImage15ImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.GPTImage15ImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ideogram V3 Text To Image — kie.image.IdeogramV3TextToImage
export interface IdeogramV3TextToImageInputs {
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  image_size?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  seed?: Connectable<number>;
}

export interface IdeogramV3TextToImageOutputs {
  output: ImageRef;
}

export function ideogramV3TextToImage(
  inputs: IdeogramV3TextToImageInputs
): DslNode<IdeogramV3TextToImageOutputs, "output"> {
  return createNode(
    "kie.image.IdeogramV3TextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Ideogram V3 Image To Image — kie.image.IdeogramV3ImageToImage
export interface IdeogramV3ImageToImageInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  negative_prompt?: Connectable<string>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  image_size?: Connectable<unknown>;
  strength?: Connectable<number>;
  expand_prompt?: Connectable<boolean>;
  seed?: Connectable<number>;
}

export interface IdeogramV3ImageToImageOutputs {
  output: ImageRef;
}

export function ideogramV3ImageToImage(
  inputs: IdeogramV3ImageToImageInputs
): DslNode<IdeogramV3ImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.IdeogramV3ImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedream 4.0 Text To Image — kie.image.Seedream40TextToImage
export interface Seedream40TextToImageInputs {
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface Seedream40TextToImageOutputs {
  output: ImageRef;
}

export function seedream40TextToImage(
  inputs: Seedream40TextToImageInputs
): DslNode<Seedream40TextToImageOutputs, "output"> {
  return createNode(
    "kie.image.Seedream40TextToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Seedream 4.0 Edit — kie.image.Seedream40ImageToImage
export interface Seedream40ImageToImageInputs {
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export interface Seedream40ImageToImageOutputs {
  output: ImageRef;
}

export function seedream40ImageToImage(
  inputs: Seedream40ImageToImageInputs
): DslNode<Seedream40ImageToImageOutputs, "output"> {
  return createNode(
    "kie.image.Seedream40ImageToImage",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
