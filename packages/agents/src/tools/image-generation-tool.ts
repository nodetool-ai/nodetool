/**
 * `image_generation` — the cross-provider image tool.
 *
 * Providers that expose a native server-side image generator
 * (`supportsNativeImageGeneration`, e.g. OpenAI's Responses API) render a tool
 * of this name as their own built-in and never call `process()` — the image
 * arrives directly on the assistant message. Providers without one fall back to
 * this implementation, which generates via a default provider+model and saves
 * the result as an asset, mirroring `GenerateImageTool`.
 */

import { IMAGE_GENERATION_TOOL_NAME } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import { GenerateImageTool } from "./media-tools.js";

// Fallback target when the active provider has no native image tool.
const FALLBACK_PROVIDER = "openai";
const FALLBACK_MODEL = "gpt-image-1";

export class ImageGenerationTool extends Tool {
  readonly name = IMAGE_GENERATION_TOOL_NAME;
  readonly description =
    "Generate or edit an image from a text prompt. On providers with a native " +
    "image tool this runs server-side; elsewhere it falls back to a default " +
    "image model and returns the result as an asset.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string" as const,
        description: "A text description of the desired image."
      }
    },
    required: ["prompt"]
  };

  private readonly delegate = new GenerateImageTool();

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const prompt = params["prompt"];
    if (typeof prompt !== "string" || !prompt)
      return { error: "prompt is required" };

    return this.delegate.process(context, {
      provider: FALLBACK_PROVIDER,
      model: FALLBACK_MODEL,
      prompt
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const prompt = String(params["prompt"] ?? "an image");
    const msg = `Generating ${prompt}`;
    return msg.length > 80 ? "Generating an image" : msg;
  }
}
