/**
 * Configuration types for Kie.ai code generation.
 */

/**
 * A value decoded from a Kie docs page's OpenAPI YAML block — the generator's
 * only external input. Every read below that decode goes through one of the
 * predicates here, so no field of the payload reaches a config unnarrowed.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonRecord;

/** A decoded JSON object. A key the payload omits reads as `undefined`. */
export type JsonRecord = { [key: string]: JsonValue | undefined };

export function isJsonRecord(
  value: JsonValue | undefined
): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

export function isJsonNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number";
}

/** The three node modules Kie configs are emitted into. */
export type KieModuleName = "image" | "audio" | "video";

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
    | "list[str]"
    | "list[image]"
    | "list[video]"
    | "list[audio]";
  default?: JsonValue;
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
  /** Override module for manifest routing (e.g. Omni text nodes in video module). */
  moduleName?: KieModuleName;
  /** Polling interval in ms. Default: 2000 (image), 4000 (suno), 8000 (video). */
  pollInterval?: number;
  /** Max poll attempts. Default: 200 (image), 120 (suno), 450 (video). */
  maxAttempts?: number;
  /** Use Suno execution path instead of standard. */
  useSuno?: boolean;
  /** Optional Suno submit endpoint for direct Suno APIs. */
  sunoEndpoint?: string;
  /** Sync omni endpoint, e.g. /api/v1/omni/audio/create */
  useOmniDirect?: boolean;
  submitEndpoint?: string;
  /** Key on response.data for sync omni path, e.g. audioId */
  responseIdKey?: string;
  /** Extract this key from resultJson.resultObject (createTask polled text path) */
  resultObjectKey?: string;
  /** Fields beyond the standard timeout_seconds. */
  fields: FieldDef[];
  /** Fields that need uploadImageInput/uploadAudioInput/uploadVideoInput. */
  uploads?: Array<{
    field: string;
    kind: "image" | "audio" | "video";
    /** If true, field is a list and each item is uploaded. */
    isList?: boolean;
    /** Build video_list clip objects { url, start, ends } instead of URL arrays. */
    isVideoClip?: boolean;
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
    defaultValue?: JsonValue;
  }>;
}

export interface ModuleConfig {
  /** Module name used in nodeType: "kie.{module}.{Class}". */
  moduleName: KieModuleName;
  /** Default polling config for this module. */
  defaultPollInterval?: number;
  defaultMaxAttempts?: number;
  nodes: NodeConfig[];
}
