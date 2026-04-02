/**
 * FalProvider — TypeScript port of nodetool-fal fal_provider.py.
 *
 * Provides textToImage, imageToImage, textToSpeech methods and the full list
 * of available image models (ported from get_available_image_models).
 */

import {
  getFalApiKey,
  falSubmit,
  falUpload,
  imageToDataUrl
} from "./fal-base.js";

// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

export interface FalImageModel {
  id: string;
  name: string;
}

/** All FAL AI image models available through the provider. */
export const FAL_IMAGE_MODELS: readonly FalImageModel[] = [
  // FLUX Models
  { id: "fal-ai/flux/dev", name: "FLUX.1 Dev" },
  { id: "fal-ai/flux/schnell", name: "FLUX.1 Schnell" },
  { id: "fal-ai/flux-pro/v1.1", name: "FLUX.1 Pro v1.1" },
  { id: "fal-ai/flux-pro/v1.1-ultra", name: "FLUX.1 Pro Ultra" },
  { id: "fal-ai/flux-pro/new", name: "FLUX.1 Pro (New)" },
  { id: "fal-ai/flux-lora", name: "FLUX.1 Dev with LoRA" },
  { id: "fal-ai/flux-subject", name: "FLUX.1 Subject" },
  { id: "fal-ai/flux-general", name: "FLUX.1 General" },
  // Ideogram Models
  { id: "fal-ai/ideogram/v2", name: "Ideogram v2" },
  { id: "fal-ai/ideogram/v2/turbo", name: "Ideogram v2 Turbo" },
  // Recraft Models
  { id: "fal-ai/recraft-v3", name: "Recraft v3" },
  { id: "fal-ai/recraft-20b", name: "Recraft 20B" },
  // Stable Diffusion Models
  {
    id: "fal-ai/stable-diffusion-v3-medium",
    name: "Stable Diffusion v3 Medium"
  },
  {
    id: "fal-ai/stable-diffusion-v35-large",
    name: "Stable Diffusion v3.5 Large"
  },
  { id: "fal-ai/fast-sdxl", name: "Fast SDXL" },
  { id: "fal-ai/stable-cascade", name: "Stable Cascade" },
  { id: "fal-ai/fast-lightning-sdxl", name: "Fast Lightning SDXL" },
  { id: "fal-ai/hyper-sdxl", name: "Hyper SDXL" },
  { id: "fal-ai/fast-turbo-diffusion", name: "Fast Turbo Diffusion" },
  { id: "fal-ai/fast-lcm-diffusion", name: "Fast LCM Diffusion" },
  { id: "fal-ai/lcm", name: "LCM Diffusion" },
  // Bria Models (Licensed Data)
  { id: "fal-ai/bria/text-to-image/base", name: "Bria v1" },
  { id: "fal-ai/bria/text-to-image/fast", name: "Bria v1 Fast" },
  { id: "fal-ai/bria/text-to-image/hd", name: "Bria v1 HD" },
  // Other Models
  { id: "fal-ai/aura-flow", name: "AuraFlow v0.3" },
  { id: "fal-ai/switti/1024", name: "Switti" },
  { id: "fal-ai/sana", name: "Sana v1" },
  { id: "fal-ai/omnigen-v1", name: "OmniGen v1" },
  { id: "fal-ai/luma-photon", name: "Luma Photon" },
  { id: "fal-ai/luma-photon/flash", name: "Luma Photon Flash" },
  { id: "fal-ai/playground-v25", name: "Playground v2.5" },
  { id: "fal-ai/fooocus", name: "Fooocus" },
  { id: "fal-ai/illusion-diffusion", name: "Illusion Diffusion" },
  { id: "fal-ai/imagen4/preview", name: "Imagen 4 Preview" },
  { id: "fal-ai/lora", name: "LoRA Text-to-Image" }
];

// ---------------------------------------------------------------------------
// Parameter types
// ---------------------------------------------------------------------------

export interface TextToImageParams {
  /** Text description of the desired image. */
  prompt: string;
  /** FAL endpoint ID (e.g. "fal-ai/flux/dev"). */
  model: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
  safetyCheck?: boolean;
}

export interface ImageToImageParams {
  /** Input image as raw bytes (PNG or JPEG). */
  imageBytes: Uint8Array;
  /** Text prompt describing the desired transformation. */
  prompt: string;
  /** FAL endpoint ID. */
  model: string;
  negativePrompt?: string;
  strength?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
  targetWidth?: number;
  targetHeight?: number;
  seed?: number;
}

export interface TextToSpeechParams {
  text: string;
  /** FAL TTS endpoint ID (e.g. "fal-ai/mmaudio-v2/text-to-audio"). */
  model: string;
  numSteps?: number;
  duration?: number;
  cfgStrength?: number;
  negativePrompt?: string;
  seed?: number;
}

// ---------------------------------------------------------------------------
// Validation error formatter (ported from Python _format_validation_error)
// ---------------------------------------------------------------------------

function formatValidationError(errorStr: string): string {
  try {
    const match = /\[{.*}\]/s.exec(errorStr);
    if (match) {
      const errors = JSON.parse(match[0]) as Array<Record<string, unknown>>;
      if (Array.isArray(errors) && errors.length > 0) {
        const formatted: string[] = [];
        for (const error of errors) {
          if (typeof error !== "object" || error === null) continue;
          const loc = error.loc as string[] | undefined;
          const fieldName = loc ? loc[loc.length - 1] : "unknown field";
          const msg = (error.msg as string) ?? "";
          const inputValue = error.input;
          const ctx = (error.ctx as Record<string, unknown>) ?? {};
          const errorType = (error.type as string) ?? "";

          if (errorType === "less_than_equal" && "le" in ctx) {
            formatted.push(
              `Parameter '${fieldName}' must be ${ctx.le} or less (you provided ${inputValue})`
            );
          } else if (errorType === "greater_than_equal" && "ge" in ctx) {
            formatted.push(
              `Parameter '${fieldName}' must be ${ctx.ge} or greater (you provided ${inputValue})`
            );
          } else if (errorType === "missing") {
            formatted.push(`Required parameter '${fieldName}' is missing`);
          } else if (errorType === "value_error") {
            formatted.push(`Parameter '${fieldName}': ${msg}`);
          } else if (inputValue !== undefined) {
            formatted.push(
              `Parameter '${fieldName}': ${msg} (you provided ${inputValue})`
            );
          } else {
            formatted.push(`Parameter '${fieldName}': ${msg}`);
          }
        }
        if (formatted.length > 0) {
          return "Invalid parameters:\n  - " + formatted.join("\n  - ");
        }
      }
    }
  } catch {
    // Fall through to return original
  }
  return errorStr;
}

// ---------------------------------------------------------------------------
// FalProvider class
// ---------------------------------------------------------------------------

export class FalProvider {
  private readonly apiKey: string;
  totalRequests = 0;
  totalImages = 0;

  constructor(apiKeyOrSecrets: string | Record<string, string>) {
    if (typeof apiKeyOrSecrets === "string") {
      this.apiKey = apiKeyOrSecrets;
    } else {
      this.apiKey = getFalApiKey(apiKeyOrSecrets);
    }
  }

  // -------------------------------------------------------------------------
  // Text-to-Image
  // -------------------------------------------------------------------------

  /**
   * Generate an image from a text prompt.
   * Returns the raw image bytes (PNG).
   */
  async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const args: Record<string, unknown> = {
      prompt: params.prompt,
      output_format: "png"
    };

    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      args.num_inference_steps = params.numInferenceSteps;
    if (params.width && params.height) {
      args.image_size = { width: params.width, height: params.height };
    }
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;
    if (params.safetyCheck != null)
      args.enable_safety_checker = params.safetyCheck;

    try {
      this.totalRequests++;
      const result = await falSubmit(this.apiKey, params.model, args);
      this.totalImages++;
      const imageUrl = extractImageUrl(result);
      return downloadBytes(imageUrl);
    } catch (e) {
      const msg = formatValidationError(String(e));
      throw new Error(`FAL text-to-image generation failed: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Image-to-Image
  // -------------------------------------------------------------------------

  /**
   * Transform an existing image based on a text prompt.
   * Returns raw image bytes (PNG).
   */
  async imageToImage(params: ImageToImageParams): Promise<Uint8Array> {
    // FAL requires images as data URIs for image-to-image
    const b64 = Buffer.from(params.imageBytes).toString("base64");
    const imageDataUri = `data:image/png;base64,${b64}`;

    const args: Record<string, unknown> = {
      prompt: params.prompt,
      image_url: imageDataUri,
      output_format: "png"
    };

    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      args.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      args.num_inference_steps = params.numInferenceSteps;
    if (params.strength != null) args.strength = params.strength;
    if (params.targetWidth && params.targetHeight) {
      args.image_size = {
        width: params.targetWidth,
        height: params.targetHeight
      };
    }
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    try {
      this.totalRequests++;
      const result = await falSubmit(this.apiKey, params.model, args);
      this.totalImages++;
      const imageUrl = extractImageUrl(result);
      return downloadBytes(imageUrl);
    } catch (e) {
      const msg = formatValidationError(String(e));
      throw new Error(`FAL image-to-image generation failed: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Text-to-Speech
  // -------------------------------------------------------------------------

  /**
   * Generate audio from text using a FAL TTS endpoint.
   * Returns the raw audio bytes.
   */
  async textToSpeech(params: TextToSpeechParams): Promise<Uint8Array> {
    if (!params.text) throw new Error("text must not be empty");

    const args: Record<string, unknown> = { prompt: params.text };

    if (params.numSteps != null) args.num_steps = params.numSteps;
    if (params.duration != null) args.duration = params.duration;
    if (params.cfgStrength != null) args.cfg_strength = params.cfgStrength;
    if (params.negativePrompt) args.negative_prompt = params.negativePrompt;
    if (params.seed != null && params.seed !== -1) args.seed = params.seed;

    try {
      this.totalRequests++;
      const result = await falSubmit(this.apiKey, params.model, args);
      const audioField = result.audio as Record<string, unknown> | undefined;
      if (!audioField?.url) {
        throw new Error(
          `Unexpected FAL response format: ${JSON.stringify(result)}`
        );
      }
      return downloadBytes(audioField.url as string);
    } catch (e) {
      const msg = formatValidationError(String(e));
      throw new Error(`FAL text-to-speech generation failed: ${msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // Model catalogue
  // -------------------------------------------------------------------------

  /** Return all available FAL AI image models. */
  getAvailableImageModels(): readonly FalImageModel[] {
    return FAL_IMAGE_MODELS;
  }

  // -------------------------------------------------------------------------
  // Low-level helpers
  // -------------------------------------------------------------------------

  /**
   * Upload bytes to FAL CDN and return the CDN URL.
   * Thin wrapper around falUpload for callers that already have a FalProvider.
   */
  async upload(data: Uint8Array, contentType: string): Promise<string> {
    return falUpload(this.apiKey, data, contentType);
  }

  /**
   * Convert an image ref ({data, uri}) to a data: URI or FAL CDN URL
   * suitable for passing as image_url in API arguments.
   */
  async imageRefToUrl(
    imageRef: Record<string, unknown>
  ): Promise<string | null> {
    return imageToDataUrl(imageRef);
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function extractImageUrl(result: Record<string, unknown>): string {
  const images = result.images as Array<Record<string, unknown>> | undefined;
  if (images && images.length > 0) {
    const url = images[0].url as string | undefined;
    if (url) return url;
  }
  const image = result.image as Record<string, unknown> | undefined;
  if (image?.url) return image.url as string;
  throw new Error(`Unexpected FAL response format: ${JSON.stringify(result)}`);
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download FAL result: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
