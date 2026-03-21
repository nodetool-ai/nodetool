import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class HunyuanMotionFast extends FalNode {
  static readonly nodeType = "fal.text_to_3d.HunyuanMotionFast";
  static readonly title = "Hunyuan Motion Fast";
  static readonly description = `Generate 3D human motions via text-to-generation interface of Hunyuan Motion!
3d, generation, text-to-3d, modeling, fast`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "", description: "Text prompt describing the motion to generate." })
  declare prompt: any;

  @prop({ type: "float", default: 5, description: "Motion duration in seconds (0.5-12.0)." })
  declare duration: any;

  @prop({ type: "float", default: 5, description: "Classifier-free guidance scale. Higher = more faithful to prompt." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducible generation." })
  declare seed: any;

  @prop({ type: "enum", default: "fbx", values: ["fbx", "dict"], description: "Output format: 'fbx' for animation files, 'dict' for raw JSON." })
  declare output_format: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const duration = Number(inputs.duration ?? this.duration ?? 5);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "fbx");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "duration": duration,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-motion/fast", args);
    return { output: res };
  }
}

export class HunyuanMotion extends FalNode {
  static readonly nodeType = "fal.text_to_3d.HunyuanMotion";
  static readonly title = "Hunyuan Motion";
  static readonly description = `Generate 3D human motions via text-to-generation interface of Hunyuan Motion!
3d, generation, text-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "", description: "Text prompt describing the motion to generate." })
  declare prompt: any;

  @prop({ type: "float", default: 5, description: "Motion duration in seconds (0.5-12.0)." })
  declare duration: any;

  @prop({ type: "float", default: 5, description: "Classifier-free guidance scale. Higher = more faithful to prompt." })
  declare guidance_scale: any;

  @prop({ type: "str", default: "", description: "Random seed for reproducible generation." })
  declare seed: any;

  @prop({ type: "enum", default: "fbx", values: ["fbx", "dict"], description: "Output format: 'fbx' for animation files, 'dict' for raw JSON." })
  declare output_format: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const duration = Number(inputs.duration ?? this.duration ?? 5);
    const guidanceScale = Number(inputs.guidance_scale ?? this.guidance_scale ?? 5);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "fbx");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "duration": duration,
      "guidance_scale": guidanceScale,
      "seed": seed,
      "output_format": outputFormat,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-motion", args);
    return { output: res };
  }
}

export class Hunyuan3dV3TextTo3d extends FalNode {
  static readonly nodeType = "fal.text_to_3d.Hunyuan3dV3TextTo3d";
  static readonly title = "Hunyuan3d V3 Text To3d";
  static readonly description = `Turn simple sketches into detailed, fully-textured 3D models. Instantly convert your concept designs into formats ready for Unity, Unreal, and Blender.
3d, generation, text-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "str", default: "", description: "Text description of the 3D content to generate. Supports up to 1024 UTF-8 characters." })
  declare prompt: any;

  @prop({ type: "enum", default: "triangle", values: ["triangle", "quadrilateral"], description: "Polygon type. Only takes effect when GenerateType is LowPoly." })
  declare polygon_type: any;

  @prop({ type: "int", default: 500000, description: "Target face count. Range: 40000-1500000" })
  declare face_count: any;

  @prop({ type: "bool", default: false, description: "Whether to enable PBR material generation" })
  declare enable_pbr: any;

  @prop({ type: "enum", default: "Normal", values: ["Normal", "LowPoly", "Geometry"], description: "Generation type. Normal: textured model. LowPoly: polygon reduction. Geometry: white model without texture." })
  declare generate_type: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const polygonType = String(inputs.polygon_type ?? this.polygon_type ?? "triangle");
    const faceCount = Number(inputs.face_count ?? this.face_count ?? 500000);
    const enablePbr = Boolean(inputs.enable_pbr ?? this.enable_pbr ?? false);
    const generateType = String(inputs.generate_type ?? this.generate_type ?? "Normal");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "polygon_type": polygonType,
      "face_count": faceCount,
      "enable_pbr": enablePbr,
      "generate_type": generateType,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan3d-v3/text-to-3d", args);
    return { output: res };
  }
}

export class MeshyV6PreviewTextTo3d extends FalNode {
  static readonly nodeType = "fal.text_to_3d.MeshyV6PreviewTextTo3d";
  static readonly title = "Meshy V6 Preview Text To3d";
  static readonly description = `Meshy-6-Preview is the latest model from Meshy. It generates realistic and production ready 3D models.
3d, generation, text-to-3d, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "bool", default: false, description: "Generate PBR Maps (metallic, roughness, normal) in addition to base color. Should be false for sculpture style." })
  declare enable_pbr: any;

  @prop({ type: "str", default: "", description: "Describe what kind of object the 3D model is. Maximum 600 characters." })
  declare prompt: any;

  @prop({ type: "enum", default: "realistic", values: ["realistic", "sculpture"], description: "Desired art style of the object. Note: enable_pbr should be false for sculpture style." })
  declare art_style: any;

  @prop({ type: "int", default: 30000, description: "Target number of polygons in the generated model" })
  declare target_polycount: any;

  @prop({ type: "bool", default: false, description: "Automatically rig the generated model as a humanoid character. Includes basic walking and running animations. Best results with humanoid characters that have clearly defined limbs." })
  declare enable_rigging: any;

  @prop({ type: "int", default: 1001, description: "Animation preset ID from Meshy's library (500+ presets). Only used when enable_animation is true. See https://docs.meshy.ai/en/api/animation-library for available action IDs." })
  declare animation_action_id: any;

  @prop({ type: "bool", default: false, description: "Deprecated: use pose_mode instead. When true, generates a T-pose model." })
  declare is_a_t_pose: any;

  @prop({ type: "enum", default: "full", values: ["preview", "full"], description: "Generation mode. 'preview' returns untextured geometry only, 'full' returns textured model (preview + refine)." })
  declare mode: any;

  @prop({ type: "bool", default: true, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "enum", default: "auto", values: ["off", "auto", "on"], description: "Controls symmetry behavior during model generation." })
  declare symmetry_mode: any;

  @prop({ type: "bool", default: true, description: "Whether to enable the remesh phase. When false, returns unprocessed triangular mesh." })
  declare should_remesh: any;

  @prop({ type: "enum", default: "triangle", values: ["quad", "triangle"], description: "Specify the topology of the generated model. Quad for smooth surfaces, Triangle for detailed geometry." })
  declare topology: any;

  @prop({ type: "enum", default: "", values: ["a-pose", "t-pose", ""], description: "Pose mode for the generated model. 'a-pose' generates an A-pose, 't-pose' generates a T-pose, empty string for no specific pose." })
  declare pose_mode: any;

  @prop({ type: "image", default: "", description: "2D image to guide the texturing process (only used in 'full' mode)" })
  declare texture_image: any;

  @prop({ type: "bool", default: false, description: "Apply an animation preset to the rigged model. Requires enable_rigging to be true." })
  declare enable_animation: any;

  @prop({ type: "bool", default: false, description: "Whether to enable prompt expansion. This will use a large language model to expand the prompt with additional details while maintaining the original meaning." })
  declare enable_prompt_expansion: any;

  @prop({ type: "str", default: "", description: "Seed for reproducible results. Same prompt and seed usually generate the same result." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "Additional text prompt to guide the texturing process (only used in 'full' mode)" })
  declare texture_prompt: any;

  @prop({ type: "float", default: 1.7, description: "Approximate height of the character in meters. Only used when enable_rigging is true." })
  declare rigging_height_meters: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const enablePbr = Boolean(inputs.enable_pbr ?? this.enable_pbr ?? false);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const artStyle = String(inputs.art_style ?? this.art_style ?? "realistic");
    const targetPolycount = Number(inputs.target_polycount ?? this.target_polycount ?? 30000);
    const enableRigging = Boolean(inputs.enable_rigging ?? this.enable_rigging ?? false);
    const animationActionId = Number(inputs.animation_action_id ?? this.animation_action_id ?? 1001);
    const isATPose = Boolean(inputs.is_a_t_pose ?? this.is_a_t_pose ?? false);
    const mode = String(inputs.mode ?? this.mode ?? "full");
    const enableSafetyChecker = Boolean(inputs.enable_safety_checker ?? this.enable_safety_checker ?? true);
    const symmetryMode = String(inputs.symmetry_mode ?? this.symmetry_mode ?? "auto");
    const shouldRemesh = Boolean(inputs.should_remesh ?? this.should_remesh ?? true);
    const topology = String(inputs.topology ?? this.topology ?? "triangle");
    const poseMode = String(inputs.pose_mode ?? this.pose_mode ?? "");
    const enableAnimation = Boolean(inputs.enable_animation ?? this.enable_animation ?? false);
    const enablePromptExpansion = Boolean(inputs.enable_prompt_expansion ?? this.enable_prompt_expansion ?? false);
    const seed = String(inputs.seed ?? this.seed ?? "");
    const texturePrompt = String(inputs.texture_prompt ?? this.texture_prompt ?? "");
    const riggingHeightMeters = Number(inputs.rigging_height_meters ?? this.rigging_height_meters ?? 1.7);

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "prompt": prompt,
      "art_style": artStyle,
      "target_polycount": targetPolycount,
      "enable_rigging": enableRigging,
      "animation_action_id": animationActionId,
      "is_a_t_pose": isATPose,
      "mode": mode,
      "enable_safety_checker": enableSafetyChecker,
      "symmetry_mode": symmetryMode,
      "should_remesh": shouldRemesh,
      "topology": topology,
      "pose_mode": poseMode,
      "enable_animation": enableAnimation,
      "enable_prompt_expansion": enablePromptExpansion,
      "seed": seed,
      "texture_prompt": texturePrompt,
      "rigging_height_meters": riggingHeightMeters,
    };

    const textureImageRef = inputs.texture_image as Record<string, unknown> | undefined;
    if (isRefSet(textureImageRef)) {
      const textureImageUrl = await assetToFalUrl(apiKey, textureImageRef!);
      if (textureImageUrl) args["texture_image_url"] = textureImageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v6-preview/text-to-3d", args);
    return { output: res };
  }
}

export const FAL_TEXT_TO_3D_NODES: readonly NodeClass[] = [
  HunyuanMotionFast,
  HunyuanMotion,
  Hunyuan3dV3TextTo3d,
  MeshyV6PreviewTextTo3d,
] as const;