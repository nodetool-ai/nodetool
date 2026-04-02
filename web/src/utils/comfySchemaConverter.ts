/**
 * ComfyUI Schema Converter
 * 
 * Converts ComfyUI node schemas to NodeTool NodeMetadata format.
 */

import { ComfyUINodeSchema, ComfyUIObjectInfo } from "../services/ComfyUIService";
import { NodeMetadata, Property, OutputSlot } from "../stores/ApiTypes";
import log from "loglevel";

type ComfyInputSpec = [unknown, unknown?];

/**
 * Map ComfyUI type string to NodeTool type.
 * Only handles known string type names — enum arrays are handled separately.
 */
function mapComfyTypeToNodeToolType(comfyType: unknown): string {
  const typeMap: Record<string, string> = {
    // Primitives
    "INT": "int",
    "FLOAT": "float",
    "FLOATS": "float",
    "STRING": "str",
    "BOOLEAN": "bool",
    "COLOR": "color",
    // Core diffusion types
    "IMAGE": "comfy.image_tensor",
    "LATENT": "comfy.latent",
    "VAE": "comfy.vae",
    "CLIP": "comfy.clip",
    "CONDITIONING": "comfy.conditioning",
    "MODEL": "comfy.unet",
    "CONTROL_NET": "comfy.control_net",
    "SAMPLER": "comfy.sampler",
    "SIGMAS": "comfy.sigmas",
    "MASK": "comfy.mask",
    "CLIP_VISION": "comfy.clip_vision",
    "CLIP_VISION_OUTPUT": "comfy.clip_vision_output",
    "STYLE_MODEL": "comfy.style_model",
    "GLIGEN": "comfy.gligen",
    "IP_ADAPTER": "comfy.ip_adapter",
    "INSIGHTFACE": "comfy.insight_face",
    "TAESD": "comfy.taesd",
    // Sampling & scheduling
    "NOISE": "comfy.noise",
    "GUIDER": "comfy.guider",
    "HOOKS": "comfy.hooks",
    "HOOK_KEYFRAMES": "comfy.hook_keyframes",
    // Model variants
    "UPSCALE_MODEL": "comfy.upscale_model",
    "LATENT_UPSCALE_MODEL": "comfy.latent_upscale_model",
    "LATENT_OPERATION": "comfy.latent_operation",
    "LORA_MODEL": "comfy.lora_model",
    "MODEL_PATCH": "comfy.model_patch",
    "PHOTOMAKER": "comfy.photomaker",
    // Media types
    "AUDIO": "comfy.audio",
    "VIDEO": "comfy.video",
    "WEBCAM": "comfy.webcam",
    "SVG": "comfy.svg",
    // 3D types
    "MESH": "comfy.mesh",
    "VOXEL": "comfy.voxel",
    "LOAD_3D": "comfy.load_3d",
    "LOAD3D_CAMERA": "comfy.load_3d_camera",
    "FILE_3D": "comfy.file_3d",
    "FILE_3D_GLB": "comfy.file_3d",
    "FILE_3D_OBJ": "comfy.file_3d",
    "FILE_3D_FBX": "comfy.file_3d",
    "FILE_3D_GLTF": "comfy.file_3d",
    "FILE_3D_STL": "comfy.file_3d",
    "FILE_3D_USDZ": "comfy.file_3d",
    // Spatial & pose
    "POSE_KEYPOINT": "comfy.pose_keypoint",
    "BOUNDING_BOX": "comfy.bounding_box",
    "CAMERA_CONTROL": "comfy.camera_control",
    "WAN_CAMERA_EMBEDDING": "comfy.wan_camera_embedding",
    // Audio encoder
    "AUDIO_ENCODER": "comfy.audio_encoder",
    "AUDIO_ENCODER_OUTPUT": "comfy.audio_encoder_output",
    "AUDIO_RECORD": "comfy.audio_record",
    // Service-specific types
    "ELEVENLABS_VOICE": "comfy.elevenlabs_voice",
    "OPENAI_CHAT_CONFIG": "comfy.openai_chat_config",
    "OPENAI_INPUT_FILES": "comfy.openai_input_files",
    "GEMINI_INPUT_FILES": "comfy.gemini_input_files",
    "LUMA_CONCEPTS": "comfy.luma_concepts",
    "LUMA_REF": "comfy.luma_ref",
    "RECRAFT_COLOR": "comfy.recraft_color",
    "RECRAFT_CONTROLS": "comfy.recraft_controls",
    "RECRAFT_V3_STYLE": "comfy.recraft_v3_style",
    "PIXVERSE_TEMPLATE": "comfy.pixverse_template",
    // Task IDs
    "MESHY_TASK_ID": "comfy.meshy_task_id",
    "MESHY_RIGGED_TASK_ID": "comfy.meshy_rigged_task_id",
    "MODEL_TASK_ID": "comfy.model_task_id",
    "RIG_TASK_ID": "comfy.rig_task_id",
    "RETARGET_TASK_ID": "comfy.retarget_task_id",
    // Misc
    "LOSS_MAP": "comfy.loss_map",
    "TIMESTEPS_RANGE": "comfy.timesteps_range",
    "TRACKS": "comfy.tracks",
    // V3 node system
    "COMBO": "str",
    "COMFY_AUTOGROW_V3": "str",
    "COMFY_DYNAMICCOMBO_V3": "str",
    "COMFY_MATCHTYPE_V3": "comfy.matchtype_v3",
    // Wildcard
    "*": "any"
  };

  if (typeof comfyType === "string" && comfyType.length > 0) {
    // Handle comma-separated union types (e.g. "FILE_3D_GLB,FILE_3D_OBJ,FILE_3D")
    // by taking the first type in the union.
    const primaryType = comfyType.includes(",") ? comfyType.split(",")[0].trim() : comfyType;
    const normalizedType = primaryType.toUpperCase();
    return typeMap[normalizedType] || `comfy.${primaryType.toLowerCase()}`;
  }

  // Array of strings = enum/combo options, not a type union.
  // Type is handled as "str" with values stored in the property.
  if (Array.isArray(comfyType)) {
    return "str";
  }

  return "str";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractEnumOptions(typeDescriptor: unknown): string[] | undefined {
  if (!Array.isArray(typeDescriptor)) {
    return undefined;
  }
  const options = typeDescriptor.filter(
    (value): value is string => typeof value === "string"
  );
  return options.length > 0 ? options : undefined;
}

/**
 * Map ComfyUI widget to NodeTool property
 */
function mapComfyInputToProperty(
  name: string,
  inputSpec: ComfyInputSpec
): Property {
  const [rawType, rawConfig] = inputSpec;
  const comfyType = rawType;
  const comfyTypeName = typeof comfyType === "string" ? comfyType.toUpperCase() : "";
  const config = isRecord(rawConfig) ? rawConfig : {};
  const enumOptions = extractEnumOptions(rawType);
  const nodeToolType = mapComfyTypeToNodeToolType(comfyType);

  const property: Property = {
    name,
    type: {
      type: nodeToolType,
      optional: false,
      type_args: []
    },
    description: config.tooltip || "",
    default: config.default,
    required: false
  };

  // Handle number constraints
  if (comfyTypeName === "INT" || comfyTypeName === "FLOAT") {
    if (config.min !== undefined) {
      property.min = config.min;
    }
    if (config.max !== undefined) {
      property.max = config.max;
    }
    if (config.step !== undefined) {
      property.json_schema_extra = {
        ...(property.json_schema_extra || {}),
        step: config.step
      };
    }
  }

  // Handle enums (combo boxes) - store in type.values for proper routing
  if (enumOptions) {
    property.type.values = enumOptions;
    property.type.type = "str";
  }

  // Handle multiline strings — use text type for multiline inputs
  if (comfyTypeName === "STRING" && config.multiline) {
    property.type.type = "text";
  }

  // Handle seed inputs — mark with control_after_generate hint
  if (config.control_after_generate) {
    property.json_schema_extra = {
      ...(property.json_schema_extra || {}),
      control_after_generate: true
    };
  }

  return property;
}

/**
 * Convert ComfyUI node schema to NodeTool NodeMetadata
 */
export function comfySchemaToNodeMetadata(
  nodeName: string,
  schema: ComfyUINodeSchema
): NodeMetadata {
  const properties: Property[] = [];
  const outputs: OutputSlot[] = [];

  // Convert required inputs
  if (schema.input.required) {
    Object.entries(schema.input.required).forEach(([name, inputSpec]) => {
      const property = mapComfyInputToProperty(name, inputSpec as ComfyInputSpec);
      property.required = true;
      properties.push(property);
    });
  }

  // Convert optional inputs
  if (schema.input.optional) {
    Object.entries(schema.input.optional).forEach(([name, inputSpec]) => {
      const property = mapComfyInputToProperty(name, inputSpec as ComfyInputSpec);
      property.required = false;
      properties.push(property);
    });
  }

  // Convert outputs
  schema.output.forEach((outputType, index) => {
    const outputName = schema.output_name[index] || `output_${index}`;
    const nodeToolType = mapComfyTypeToNodeToolType(outputType);

    outputs.push({
      name: outputName,
      type: {
        type: nodeToolType,
        optional: false,
        type_args: []
      },
      stream: false
    });
  });

  // Create NodeMetadata
  const metadata: NodeMetadata = {
    node_type: `comfy.${nodeName}`,
    title: schema.display_name || schema.name || nodeName,
    description: schema.description || `ComfyUI ${nodeName} node`,
    namespace: "comfy",
    properties,
    outputs,
    layout: "default",

    recommended_models: [],
    basic_fields: properties.map((property) => property.name),
    is_dynamic: false,
    is_streaming_output: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    required_settings: []
  };

  return metadata;
}

/**
 * Convert all ComfyUI object info to NodeTool metadata map
 */
export function comfyObjectInfoToMetadataMap(
  objectInfo: ComfyUIObjectInfo
): Record<string, NodeMetadata> {
  const metadataMap: Record<string, NodeMetadata> = {};

  Object.entries(objectInfo).forEach(([nodeName, schema]) => {
    try {
      const metadata = comfySchemaToNodeMetadata(nodeName, schema);
      metadataMap[metadata.node_type] = metadata;
    } catch (error) {
      log.error(`Failed to convert ComfyUI schema for ${nodeName}:`, error);
    }
  });

  return metadataMap;
}
