// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput } from "../core.js";
import type { ImageRef } from "../types.js";

// Flux 2 Pro Text To Image — kie.image.Flux2ProTextToImage
export interface Flux2ProTextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function flux2ProTextToImage(inputs: Flux2ProTextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Flux2ProTextToImage", inputs as Record<string, unknown>);
}

// Flux 2 Pro Image To Image — kie.image.Flux2ProImageToImage
export interface Flux2ProImageToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function flux2ProImageToImage(inputs: Flux2ProImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Flux2ProImageToImage", inputs as Record<string, unknown>);
}

// Flux 2 Flex Text To Image — kie.image.Flux2FlexTextToImage
export interface Flux2FlexTextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function flux2FlexTextToImage(inputs: Flux2FlexTextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Flux2FlexTextToImage", inputs as Record<string, unknown>);
}

// Flux 2 Flex Image To Image — kie.image.Flux2FlexImageToImage
export interface Flux2FlexImageToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function flux2FlexImageToImage(inputs: Flux2FlexImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Flux2FlexImageToImage", inputs as Record<string, unknown>);
}

// Seedream 4.5 Text To Image — kie.image.Seedream45TextToImage
export interface Seedream45TextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function seedream45TextToImage(inputs: Seedream45TextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Seedream45TextToImage", inputs as Record<string, unknown>);
}

// Seedream 4.5 Edit — kie.image.Seedream45Edit
export interface Seedream45EditInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image_input?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function seedream45Edit(inputs: Seedream45EditInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Seedream45Edit", inputs as Record<string, unknown>);
}

// Z-Image Turbo — kie.image.ZImage
export interface ZImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export function zImage(inputs: ZImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.ZImage", inputs as Record<string, unknown>);
}

// Nano Banana — kie.image.NanoBanana
export interface NanoBananaInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image_size?: Connectable<unknown>;
}

export function nanoBanana(inputs: NanoBananaInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.NanoBanana", inputs as Record<string, unknown>);
}

// Nano Banana Pro — kie.image.NanoBananaPro
export interface NanoBananaProInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image_input?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  resolution?: Connectable<unknown>;
}

export function nanoBananaPro(inputs: NanoBananaProInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.NanoBananaPro", inputs as Record<string, unknown>);
}

// Flux Kontext — kie.image.FluxKontext
export interface FluxKontextInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  mode?: Connectable<unknown>;
}

export function fluxKontext(inputs: FluxKontextInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.FluxKontext", inputs as Record<string, unknown>);
}

// Grok Imagine Text To Image — kie.image.GrokImagineTextToImage
export interface GrokImagineTextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export function grokImagineTextToImage(inputs: GrokImagineTextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.GrokImagineTextToImage", inputs as Record<string, unknown>);
}

// Grok Imagine Upscale — kie.image.GrokImagineUpscale
export interface GrokImagineUpscaleInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
}

export function grokImagineUpscale(inputs: GrokImagineUpscaleInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.GrokImagineUpscale", inputs as Record<string, unknown>);
}

// Qwen Text To Image — kie.image.QwenTextToImage
export interface QwenTextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export function qwenTextToImage(inputs: QwenTextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.QwenTextToImage", inputs as Record<string, unknown>);
}

// Qwen Image To Image — kie.image.QwenImageToImage
export interface QwenImageToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  aspect_ratio?: Connectable<unknown>;
}

export function qwenImageToImage(inputs: QwenImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.QwenImageToImage", inputs as Record<string, unknown>);
}

// Topaz Image Upscale — kie.image.TopazImageUpscale
export interface TopazImageUpscaleInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  upscale_factor?: Connectable<unknown>;
}

export function topazImageUpscale(inputs: TopazImageUpscaleInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.TopazImageUpscale", inputs as Record<string, unknown>);
}

// Recraft Remove Background — kie.image.RecraftRemoveBackground
export interface RecraftRemoveBackgroundInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
}

export function recraftRemoveBackground(inputs: RecraftRemoveBackgroundInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.RecraftRemoveBackground", inputs as Record<string, unknown>);
}

// Ideogram Character — kie.image.IdeogramCharacter
export interface IdeogramCharacterInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  reference_images?: Connectable<ImageRef[]>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  image_size?: Connectable<unknown>;
  negative_prompt?: Connectable<string>;
  seed?: Connectable<number>;
}

export function ideogramCharacter(inputs: IdeogramCharacterInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.IdeogramCharacter", inputs as Record<string, unknown>);
}

// Ideogram Character Edit — kie.image.IdeogramCharacterEdit
export interface IdeogramCharacterEditInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  mask?: Connectable<ImageRef>;
  reference_images?: Connectable<ImageRef[]>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  seed?: Connectable<number>;
}

export function ideogramCharacterEdit(inputs: IdeogramCharacterEditInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.IdeogramCharacterEdit", inputs as Record<string, unknown>);
}

// Ideogram Character Remix — kie.image.IdeogramCharacterRemix
export interface IdeogramCharacterRemixInputs {
  timeout_seconds?: Connectable<number>;
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

export function ideogramCharacterRemix(inputs: IdeogramCharacterRemixInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.IdeogramCharacterRemix", inputs as Record<string, unknown>);
}

// Ideogram V3 Reframe — kie.image.IdeogramV3Reframe
export interface IdeogramV3ReframeInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
  image_size?: Connectable<unknown>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export function ideogramV3Reframe(inputs: IdeogramV3ReframeInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.IdeogramV3Reframe", inputs as Record<string, unknown>);
}

// Recraft Crisp Upscale — kie.image.RecraftCrispUpscale
export interface RecraftCrispUpscaleInputs {
  timeout_seconds?: Connectable<number>;
  image?: Connectable<ImageRef>;
}

export function recraftCrispUpscale(inputs: RecraftCrispUpscaleInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.RecraftCrispUpscale", inputs as Record<string, unknown>);
}

// Imagen 4 Fast — kie.image.Imagen4Fast
export interface Imagen4FastInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
}

export function imagen4Fast(inputs: Imagen4FastInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Imagen4Fast", inputs as Record<string, unknown>);
}

// Imagen 4 Ultra — kie.image.Imagen4Ultra
export interface Imagen4UltraInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export function imagen4Ultra(inputs: Imagen4UltraInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Imagen4Ultra", inputs as Record<string, unknown>);
}

// Imagen 4 — kie.image.Imagen4
export interface Imagen4Inputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  seed?: Connectable<number>;
}

export function imagen4(inputs: Imagen4Inputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Imagen4", inputs as Record<string, unknown>);
}

// Nano Banana Edit — kie.image.NanoBananaEdit
export interface NanoBananaEditInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image_input?: Connectable<ImageRef[]>;
  image_size?: Connectable<unknown>;
}

export function nanoBananaEdit(inputs: NanoBananaEditInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.NanoBananaEdit", inputs as Record<string, unknown>);
}

// GPT 4o Image Text To Image — kie.image.GPTImage4oTextToImage
export interface GPTImage4oTextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  size?: Connectable<unknown>;
  n_variants?: Connectable<number>;
  is_enhance?: Connectable<boolean>;
}

export function gptImage4oTextToImage(inputs: GPTImage4oTextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.GPTImage4oTextToImage", inputs as Record<string, unknown>);
}

// GPT 4o Image Edit — kie.image.GPTImage4oImageToImage
export interface GPTImage4oImageToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  size?: Connectable<unknown>;
  n_variants?: Connectable<number>;
}

export function gptImage4oImageToImage(inputs: GPTImage4oImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.GPTImage4oImageToImage", inputs as Record<string, unknown>);
}

// GPT Image 1.5 Text To Image — kie.image.GPTImage15TextToImage
export interface GPTImage15TextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function gptImage15TextToImage(inputs: GPTImage15TextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.GPTImage15TextToImage", inputs as Record<string, unknown>);
}

// GPT Image 1.5 Edit — kie.image.GPTImage15ImageToImage
export interface GPTImage15ImageToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  images?: Connectable<ImageRef[]>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function gptImage15ImageToImage(inputs: GPTImage15ImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.GPTImage15ImageToImage", inputs as Record<string, unknown>);
}

// Ideogram V3 Text To Image — kie.image.IdeogramV3TextToImage
export interface IdeogramV3TextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  rendering_speed?: Connectable<unknown>;
  style?: Connectable<unknown>;
  image_size?: Connectable<unknown>;
  expand_prompt?: Connectable<boolean>;
  seed?: Connectable<number>;
}

export function ideogramV3TextToImage(inputs: IdeogramV3TextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.IdeogramV3TextToImage", inputs as Record<string, unknown>);
}

// Ideogram V3 Image To Image — kie.image.IdeogramV3ImageToImage
export interface IdeogramV3ImageToImageInputs {
  timeout_seconds?: Connectable<number>;
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

export function ideogramV3ImageToImage(inputs: IdeogramV3ImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.IdeogramV3ImageToImage", inputs as Record<string, unknown>);
}

// Seedream 4.0 Text To Image — kie.image.Seedream40TextToImage
export interface Seedream40TextToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function seedream40TextToImage(inputs: Seedream40TextToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Seedream40TextToImage", inputs as Record<string, unknown>);
}

// Seedream 4.0 Edit — kie.image.Seedream40ImageToImage
export interface Seedream40ImageToImageInputs {
  timeout_seconds?: Connectable<number>;
  prompt?: Connectable<string>;
  image?: Connectable<ImageRef>;
  aspect_ratio?: Connectable<unknown>;
  quality?: Connectable<unknown>;
}

export function seedream40ImageToImage(inputs: Seedream40ImageToImageInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("kie.image.Seedream40ImageToImage", inputs as Record<string, unknown>);
}
