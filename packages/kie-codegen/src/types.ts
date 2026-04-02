/**
 * Configuration types for Kie.ai code generation.
 */

export interface FieldDef {
  name: string;
  type:
    | "str"
    | "int"
    | "float"
    | "bool"
    | "enum"
    | "image"
    | "audio"
    | "video"
    | "list[image]";
  default?: unknown;
  title?: string;
  description?: string;
  values?: string[];
  min?: number;
  max?: number;
  required?: boolean;
}

export interface NodeConfig {
  className: string;
  modelId: string;
  title: string;
  description: string;
  outputType: "image" | "audio" | "video" | "text";
  /** Polling interval in ms. Default: 2000 (image), 4000 (suno), 8000 (video). */
  pollInterval?: number;
  /** Max poll attempts. Default: 200 (image), 120 (suno), 450 (video). */
  maxAttempts?: number;
  /** Use Suno execution path instead of standard. */
  useSuno?: boolean;
  /** Fields beyond the standard timeout_seconds. */
  fields: FieldDef[];
  /** Fields that need uploadImageInput/uploadAudioInput/uploadVideoInput. */
  uploads?: Array<{
    field: string;
    kind: "image" | "audio" | "video";
    /** If true, field is a list and each item is uploaded. */
    isList?: boolean;
    /** Parameter name in the API payload. Default: field + "_url". */
    paramName?: string;
    /**
     * Group multiple single-field uploads into one array parameter.
     * All uploads with the same groupKey collect into the same array.
     * Requires paramName to specify the array parameter name.
     */
    groupKey?: string;
  }>;
  /** Validation rules. */
  validation?: Array<{
    field: string;
    rule: "not_empty";
    message?: string;
  }>;
  /** Override parameter name mapping (field name → API param name). */
  paramNames?: Record<string, string>;
  /** Fields to conditionally include (only add if value meets condition). */
  conditionalFields?: Array<{
    field: string;
    condition: "gte_zero" | "truthy" | "not_default";
    defaultValue?: unknown;
  }>;
}

export interface ModuleConfig {
  /** Module name used in nodeType: "kie.{module}.{Class}". */
  moduleName: string;
  /** Default polling config for this module. */
  defaultPollInterval?: number;
  defaultMaxAttempts?: number;
  nodes: NodeConfig[];
}
