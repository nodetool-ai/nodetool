import { BaseNode, prop } from "@nodetool/node-sdk";

import { DEFAULT_IMAGE, DEFAULT_IMAGE_TO_3D_MODEL, DEFAULT_TEXT_TO_3D_MODEL } from "./defaults.js";

export class TextTo3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.TextTo3D";
  static readonly title = "Text To 3D";
  static readonly description =
    "Generate 3D models from text prompts using AI providers (Meshy, Rodin).\n    3d, generation, AI, text-to-3d, t3d, mesh, create\n\n    Use cases:\n    - Create 3D models from text descriptions\n    - Generate game assets from prompts\n    - Prototype 3D concepts quickly\n    - Create 3D content for AR/VR";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly basicFields = ["model", "prompt", "output_format", "seed"];
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

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Output format for the 3D model", values: ["glb", "gltf", "obj", "stl", "ply"] })
  declare output_format: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducibility (-1 for random)", min: -1 })
  declare seed: any;

  @prop({ type: "int", default: 600, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    throw new Error(
      "Not implemented: configure a Meshy or Rodin provider to use TextTo3D."
    );
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

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Output format for the 3D model", values: ["glb", "gltf", "obj", "stl", "ply"] })
  declare output_format: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducibility (-1 for random)", min: -1 })
  declare seed: any;

  @prop({ type: "int", default: 600, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    throw new Error(
      "Not implemented: configure a Meshy or Rodin provider to use ImageTo3D."
    );
  }
}
