import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import type {
  ImageTo3DParams,
  Model3D,
  TextTo3DParams
} from "@nodetool/runtime";

import {
  DEFAULT_IMAGE,
  DEFAULT_IMAGE_TO_3D_MODEL,
  DEFAULT_TEXT_TO_3D_MODEL
} from "./defaults.js";
import { glbOutput } from "./base.js";
import { imageRefToBytes } from "./utils.js";

const SUPPORTED_OUTPUT_FORMATS = ["glb", "obj", "fbx", "usdz"] as const;

/**
 * Build the {@link Model3D} object expected by the runtime providers from the
 * `model_3d_model`-shaped value carried by the node prop. The node prop uses
 * snake_case (`supported_tasks`, `output_formats`) to match the persisted
 * workflow JSON; the provider layer uses camelCase.
 */
function nodeModelToProviderModel(raw: unknown): Model3D {
  const obj = (raw as Record<string, unknown> | null | undefined) ?? {};
  const provider = String(obj.provider ?? "").trim();
  const id = String(obj.id ?? "").trim();
  if (!provider) throw new Error("3D model is missing a provider id");
  if (!id) throw new Error("3D model is missing a model id");
  return {
    id,
    name: String(obj.name ?? id),
    provider,
    supportedTasks: Array.isArray(obj.supported_tasks)
      ? (obj.supported_tasks as string[])
      : undefined,
    outputFormats: Array.isArray(obj.output_formats)
      ? (obj.output_formats as string[])
      : undefined
  };
}

/** Treat 0 (the field's "use provider default" sentinel) as undefined. */
function normalizeTimeoutSeconds(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

/** -1 is the random-seed sentinel; convert to null so providers omit it. */
function normalizeSeed(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return v;
}

function normalizeOutputFormat(
  value: unknown,
  model: Model3D,
  nodeType: "TextTo3DNode" | "ImageTo3DNode"
): string {
  const format = String(value ?? "glb")
    .trim()
    .toLowerCase();
  if (!(SUPPORTED_OUTPUT_FORMATS as readonly string[]).includes(format)) {
    throw new Error(
      `${nodeType} output_format must be one of: ${SUPPORTED_OUTPUT_FORMATS.join(", ")}`
    );
  }
  const modelFormats = (model.outputFormats ?? [])
    .map((f) => String(f).trim().toLowerCase())
    .filter((f) => f.length > 0);
  if (modelFormats.length > 0 && !modelFormats.includes(format)) {
    throw new Error(
      `Model "${model.id}" does not support output format "${format}". Supported formats: ${modelFormats.join(", ")}`
    );
  }
  return format;
}

export class TextTo3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.TextTo3D";
  static readonly title = "Text To 3D";
  static readonly description =
    "Generate 3D models from text prompts using AI providers (Meshy, Rodin).\n    3d, generation, AI, text-to-3d, t3d, mesh, create\n\n    Use cases:\n    - Create 3D models from text descriptions\n    - Generate game assets from prompts\n    - Prototype 3D concepts quickly\n    - Create 3D content for AR/VR";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly basicFields = ["model", "prompt", "enable_textures", "output_format", "seed"];
  static readonly exposeAsTool = true;

  @prop({
    type: "model_3d_model",
    default: DEFAULT_TEXT_TO_3D_MODEL,
    title: "Model",
    description: "The 3D generation model to use"
  })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description of the 3D model to generate" })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Elements to avoid in the generated model" })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", title: "Art Style", description: "Art style for the model (e.g., 'realistic', 'cartoon', 'low-poly')" })
  declare art_style: any;

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Output format for the 3D model", values: [...SUPPORTED_OUTPUT_FORMATS] })
  declare output_format: any;

  @prop({ type: "bool", default: true, title: "Enable Textures", description: "Generate PBR textures after shape generation (Meshy only; adds a second API call)" })
  declare enable_textures: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducibility (-1 for random)", min: -1 })
  declare seed: any;

  @prop({ type: "int", default: 600, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    if (!context) {
      throw new Error(
        "TextTo3DNode requires a ProcessingContext to resolve the provider"
      );
    }
    if (!this.prompt || typeof this.prompt !== "string") {
      throw new Error("Prompt is required");
    }
    const model = nodeModelToProviderModel(this.model);
    const provider = await context.getProvider(model.provider);

    const params: TextTo3DParams = {
      model,
      prompt: this.prompt,
      negativePrompt: this.negative_prompt || null,
      artStyle: this.art_style || null,
      outputFormat: normalizeOutputFormat(this.output_format, model, "TextTo3DNode"),
      seed: normalizeSeed(this.seed),
      timeoutSeconds: normalizeTimeoutSeconds(this.timeout_seconds),
      enableTextures: this.enable_textures === true
    };

    const bytes = await provider.textTo3D(params);
    return glbOutput(bytes);
  }
}

export class ImageTo3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.ImageTo3D";
  static readonly title = "Image To 3D";
  static readonly description =
    "Generate 3D models from images using AI providers (Meshy, Rodin).\n    3d, generation, AI, image-to-3d, i3d, mesh, reconstruction\n\n    Use cases:\n    - Convert product photos to 3D models\n    - Create 3D assets from concept art\n    - Generate 3D characters from drawings\n    - Reconstruct objects from images";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly basicFields = ["model", "image", "output_format", "seed"];
  static readonly exposeAsTool = true;

  @prop({
    type: "model_3d_model",
    default: DEFAULT_IMAGE_TO_3D_MODEL,
    title: "Model",
    description: "The 3D generation model to use"
  })
  declare model: any;

  @prop({ type: "image", default: DEFAULT_IMAGE, title: "Image", description: "Input image to convert to 3D" })
  declare image: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Optional text prompt to guide the 3D generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Output format for the 3D model", values: [...SUPPORTED_OUTPUT_FORMATS] })
  declare output_format: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducibility (-1 for random)", min: -1 })
  declare seed: any;

  @prop({ type: "int", default: 600, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    if (!context) {
      throw new Error(
        "ImageTo3DNode requires a ProcessingContext to resolve the provider"
      );
    }
    const model = nodeModelToProviderModel(this.model);
    const provider = await context.getProvider(model.provider);
    const imageBytes = await imageRefToBytes(this.image, context);
    if (imageBytes.length === 0) {
      throw new Error("Image input is empty");
    }

    const params: ImageTo3DParams = {
      model,
      prompt: this.prompt ? String(this.prompt) : null,
      outputFormat: normalizeOutputFormat(this.output_format, model, "ImageTo3DNode"),
      seed: normalizeSeed(this.seed),
      timeoutSeconds: normalizeTimeoutSeconds(this.timeout_seconds)
    };

    const bytes = await provider.imageTo3D(imageBytes, params);
    return glbOutput(bytes);
  }
}
