/**
 * ComfyUI Schema Converter
 * 
 * Converts ComfyUI node schemas to NodeTool NodeMetadata format.
 */

import { ComfyUINodeSchema, ComfyUIObjectInfo } from "../services/ComfyUIService";
import { NodeMetadata, Property, OutputSlot } from "../stores/ApiTypes";
import log from "loglevel";

/**
 * Map ComfyUI type to NodeTool type
 */
function mapComfyTypeToNodeToolType(comfyType: string): string {
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

  return typeMap[comfyType] || `comfy.${comfyType.toLowerCase()}`;
}

/**
 * Map ComfyUI widget to NodeTool property
 */
function mapComfyInputToProperty(
  name: string,
  inputSpec: [string, Record<string, any>?]
): Property {
  const [comfyType, config = {}] = inputSpec;
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
  if (comfyType === "INT" || comfyType === "FLOAT") {
    if (config.min !== undefined) {
      property.min = config.min;
    }
    if (config.max !== undefined) {
      property.max = config.max;
    }
  }

  // Handle enums (combo boxes) - store in json_schema_extra
  if (Array.isArray(config)) {
    property.json_schema_extra = {
      enum: config
    };
  }

  // Handle multiline strings - store in json_schema_extra  
  if (comfyType === "STRING" && typeof config === "object" && !Array.isArray(config) && config.multiline) {
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
      const property = mapComfyInputToProperty(name, inputSpec);
      property.required = true;
      properties.push(property);
    });
  }

  // Convert optional inputs
  if (schema.input.optional) {
    Object.entries(schema.input.optional).forEach(([name, inputSpec]) => {
      const property = mapComfyInputToProperty(name, inputSpec);
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
    basic_fields: [],
    is_dynamic: false,
    is_streaming_output: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false
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
