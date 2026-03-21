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

export class Ultrashape extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.Ultrashape";
  static readonly title = "Ultrashape";
  static readonly description = `Ultrashape
3d_to_3d`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "int", default: 1024, description: "Marching cubes resolution." })
  declare octree_resolution: any;

  @prop({ type: "bool", default: true, description: "Remove image background." })
  declare remove_background: any;

  @prop({ type: "int", default: 42, description: "Random seed." })
  declare seed: any;

  @prop({ type: "str", default: "", description: "URL of the coarse mesh (.glb or .obj) to refine." })
  declare model_url: any;

  @prop({ type: "int", default: 50, description: "Diffusion steps." })
  declare num_inference_steps: any;

  @prop({ type: "image", default: "", description: "URL of the reference image for mesh refinement." })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const octreeResolution = Number(inputs.octree_resolution ?? this.octree_resolution ?? 1024);
    const removeBackground = Boolean(inputs.remove_background ?? this.remove_background ?? true);
    const seed = Number(inputs.seed ?? this.seed ?? 42);
    const modelUrl = String(inputs.model_url ?? this.model_url ?? "");
    const numInferenceSteps = Number(inputs.num_inference_steps ?? this.num_inference_steps ?? 50);

    const args: Record<string, unknown> = {
      "octree_resolution": octreeResolution,
      "remove_background": removeBackground,
      "seed": seed,
      "model_url": modelUrl,
      "num_inference_steps": numInferenceSteps,
    };

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/ultrashape", args);
    return { output: res };
  }
}

export class Sam33DAlign extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.Sam33DAlign";
  static readonly title = "Sam33 D Align";
  static readonly description = `Sam 3
3d_to_3d`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "image", default: "", description: "URL of the human mask image. If not provided, uses full image." })
  declare body_mask_url: any;

  @prop({ type: "str", default: "", description: "URL of the SAM-3D Body mesh file (.ply or .glb) to align" })
  declare body_mesh_url: any;

  @prop({ type: "str", default: "", description: "Optional URL of SAM-3D Object mesh (.glb) to create combined scene" })
  declare object_mesh_url: any;

  @prop({ type: "str", default: "", description: "Focal length from SAM-3D Body metadata. If not provided, estimated from MoGe." })
  declare focal_length: any;

  @prop({ type: "image", default: "", description: "URL of the original image used for MoGe depth estimation" })
  declare image: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const bodyMeshUrl = String(inputs.body_mesh_url ?? this.body_mesh_url ?? "");
    const objectMeshUrl = String(inputs.object_mesh_url ?? this.object_mesh_url ?? "");
    const focalLength = String(inputs.focal_length ?? this.focal_length ?? "");

    const args: Record<string, unknown> = {
      "body_mesh_url": bodyMeshUrl,
      "object_mesh_url": objectMeshUrl,
      "focal_length": focalLength,
    };

    const bodyMaskUrlRef = inputs.body_mask_url as Record<string, unknown> | undefined;
    if (isRefSet(bodyMaskUrlRef)) {
      const bodyMaskUrlUrl = await assetToFalUrl(apiKey, bodyMaskUrlRef!);
      if (bodyMaskUrlUrl) args["body_mask_url"] = bodyMaskUrlUrl;
    }

    const imageRef = inputs.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToFalUrl(apiKey, imageRef!);
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/sam-3/3d-align", args);
    return { output: res };
  }
}

export class MeshyV5Retexture extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.MeshyV5Retexture";
  static readonly title = "Meshy V5 Retexture";
  static readonly description = `Meshy-5 retexture applies new, high-quality textures to existing 3D models using either text prompts or reference images. It supports PBR material generation for realistic, production-ready results.
3d, editing, transformation, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "bool", default: false, description: "Generate PBR Maps (metallic, roughness, normal) in addition to base color." })
  declare enable_pbr: any;

  @prop({ type: "str", default: "", description: "Describe your desired texture style using text. Maximum 600 characters. Required if image_style_url is not provided." })
  declare text_style_prompt: any;

  @prop({ type: "bool", default: true, description: "If set to true, input data will be checked for safety before processing." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: true, description: "Use the original UV mapping of the model instead of generating new UVs. If the model has no original UV, output quality may be reduced." })
  declare enable_original_uv: any;

  @prop({ type: "str", default: "", description: "URL or base64 data URI of a 3D model to texture. Supports .glb, .gltf, .obj, .fbx, .stl formats. Can be a publicly accessible URL or data URI with MIME type application/octet-stream." })
  declare model_url: any;

  @prop({ type: "image", default: "", description: "2D image to guide the texturing process. Supports .jpg, .jpeg, and .png formats. Required if text_style_prompt is not provided. If both are provided, image_style_url takes precedence." })
  declare image_style: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const enablePbr = Boolean(inputs.enable_pbr ?? this.enable_pbr ?? false);
    const textStylePrompt = String(inputs.text_style_prompt ?? this.text_style_prompt ?? "");
    const enableSafetyChecker = Boolean(inputs.enable_safety_checker ?? this.enable_safety_checker ?? true);
    const enableOriginalUv = Boolean(inputs.enable_original_uv ?? this.enable_original_uv ?? true);
    const modelUrl = String(inputs.model_url ?? this.model_url ?? "");

    const args: Record<string, unknown> = {
      "enable_pbr": enablePbr,
      "text_style_prompt": textStylePrompt,
      "enable_safety_checker": enableSafetyChecker,
      "enable_original_uv": enableOriginalUv,
      "model_url": modelUrl,
    };

    const imageStyleRef = inputs.image_style as Record<string, unknown> | undefined;
    if (isRefSet(imageStyleRef)) {
      const imageStyleUrl = await assetToFalUrl(apiKey, imageStyleRef!);
      if (imageStyleUrl) args["image_style_url"] = imageStyleUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v5/retexture", args);
    return { output: res };
  }
}

export class MeshyV5Remesh extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.MeshyV5Remesh";
  static readonly title = "Meshy V5 Remesh";
  static readonly description = `Meshy-5 remesh allows you to remesh and export existing 3D models into various formats
3d, editing, transformation, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "float", default: 0, description: "Resize the model to a certain height measured in meters. Set to 0 for no resizing." })
  declare resize_height: any;

  @prop({ type: "str", default: "", description: "Position of the origin. None means no effect." })
  declare origin_at: any;

  @prop({ type: "int", default: 30000, description: "Target number of polygons in the generated model. Actual count may vary based on geometry complexity." })
  declare target_polycount: any;

  @prop({ type: "enum", default: "triangle", values: ["quad", "triangle"], description: "Specify the topology of the generated model. Quad for smooth surfaces, Triangle for detailed geometry." })
  declare topology: any;

  @prop({ type: "str", default: "", description: "URL or base64 data URI of a 3D model to remesh. Supports .glb, .gltf, .obj, .fbx, .stl formats. Can be a publicly accessible URL or data URI with MIME type application/octet-stream." })
  declare model_url: any;

  @prop({ type: "list[str]", default: [], description: "List of target formats for the remeshed model." })
  declare target_formats: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const resizeHeight = Number(inputs.resize_height ?? this.resize_height ?? 0);
    const originAt = String(inputs.origin_at ?? this.origin_at ?? "");
    const targetPolycount = Number(inputs.target_polycount ?? this.target_polycount ?? 30000);
    const topology = String(inputs.topology ?? this.topology ?? "triangle");
    const modelUrl = String(inputs.model_url ?? this.model_url ?? "");
    const targetFormats = String(inputs.target_formats ?? this.target_formats ?? []);

    const args: Record<string, unknown> = {
      "resize_height": resizeHeight,
      "origin_at": originAt,
      "target_polycount": targetPolycount,
      "topology": topology,
      "model_url": modelUrl,
      "target_formats": targetFormats,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/meshy/v5/remesh", args);
    return { output: res };
  }
}

export class HunyuanPart extends FalNode {
  static readonly nodeType = "fal.3d_to_3d.HunyuanPart";
  static readonly title = "Hunyuan Part";
  static readonly description = `Use the capabilities of hunyuan part to generate point clouds from your 3D files.
3d, editing, transformation, modeling`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  @prop({ type: "float", default: 0, description: "X coordinate of the point prompt for segmentation (normalized space -1 to 1)." })
  declare point_prompt_x: any;

  @prop({ type: "bool", default: true, description: "Whether to use normal information for segmentation." })
  declare use_normal: any;

  @prop({ type: "float", default: 0, description: "Z coordinate of the point prompt for segmentation (normalized space -1 to 1)." })
  declare point_prompt_z: any;

  @prop({ type: "float", default: 0, description: "Standard deviation of noise to add to sampled points." })
  declare noise_std: any;

  @prop({ type: "int", default: 100000, description: "Number of points to sample from the mesh." })
  declare point_num: any;

  @prop({ type: "str", default: "", description: "URL of the 3D model file (.glb or .obj) to process for segmentation." })
  declare model_file_url: any;

  @prop({ type: "float", default: 0, description: "Y coordinate of the point prompt for segmentation (normalized space -1 to 1)." })
  declare point_prompt_y: any;

  @prop({ type: "str", default: "", description: "\n            The same seed and input will produce the same segmentation results.\n        " })
  declare seed: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(inputs);
    const pointPromptX = Number(inputs.point_prompt_x ?? this.point_prompt_x ?? 0);
    const useNormal = Boolean(inputs.use_normal ?? this.use_normal ?? true);
    const pointPromptZ = Number(inputs.point_prompt_z ?? this.point_prompt_z ?? 0);
    const noiseStd = Number(inputs.noise_std ?? this.noise_std ?? 0);
    const pointNum = Number(inputs.point_num ?? this.point_num ?? 100000);
    const modelFileUrl = String(inputs.model_file_url ?? this.model_file_url ?? "");
    const pointPromptY = Number(inputs.point_prompt_y ?? this.point_prompt_y ?? 0);
    const seed = String(inputs.seed ?? this.seed ?? "");

    const args: Record<string, unknown> = {
      "point_prompt_x": pointPromptX,
      "use_normal": useNormal,
      "point_prompt_z": pointPromptZ,
      "noise_std": noiseStd,
      "point_num": pointNum,
      "model_file_url": modelFileUrl,
      "point_prompt_y": pointPromptY,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-part", args);
    return { output: res };
  }
}

export const FAL_3D_TO_3D_NODES: readonly NodeClass[] = [
  Ultrashape,
  Sam33DAlign,
  MeshyV5Retexture,
  MeshyV5Remesh,
  HunyuanPart,
] as const;