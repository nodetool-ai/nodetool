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
 * Map ComfyUI type to NodeTool type
 */
function mapComfyTypeToNodeToolType(comfyType: unknown): string {
  const typeMap: Record<string, string> = {
    "INT": "int",
    "FLOAT": "float",
    "STRING": "str",
    "BOOLEAN": "bool",
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
    "TAESD": "comfy.taesd"
  };

  if (typeof comfyType === "string" && comfyType.length > 0) {
    const normalizedType = comfyType.toUpperCase();
    return typeMap[normalizedType] || `comfy.${comfyType.toLowerCase()}`;
  }

  if (Array.isArray(comfyType) && comfyType.length > 0) {
    // Some Comfy schemas use union-like type descriptors (e.g. ["CLIP", "CLIP_VISION"]).
    // Prefer first string type in the union; otherwise fallback to string.
    const firstStringType = comfyType.find(
      (value): value is string => typeof value === "string"
    );
    if (firstStringType) {
      return mapComfyTypeToNodeToolType(firstStringType);
    }
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
  }

  // Handle enums (combo boxes) - store in json_schema_extra
  if (enumOptions) {
    property.json_schema_extra = {
      enum: enumOptions
    };
  }

  // Handle multiline strings - store in json_schema_extra  
  if (comfyTypeName === "STRING" && config.multiline) {
    property.json_schema_extra = {
      ...(property.json_schema_extra || {}),
      multiline: true
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
    the_model_info: {},
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
