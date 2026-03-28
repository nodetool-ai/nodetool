/**
 * Published unit rate for a FAL model endpoint (GET /v1/models/pricing at codegen time).
 * Same shape as `FalUnitPricing` in `@nodetool/fal-nodes` (`fal-base.ts`).
 */
export interface FalUnitPricing {
  endpointId: string;
  unitPrice: number;
  billingUnit: string;
  currency: string;
}

export interface EnumDef {
  name: string;
  values: [string, string][]; // [ENUM_KEY, rawValue]
  description?: string;
}

export interface FieldDef {
  name: string;
  apiParamName?: string; // Original API param name if field was renamed
  tsType: string; // "string" | "number" | "boolean" | "image" | "video" | "audio" | "enum" | "object" | "image[]" | ...
  propType: string; // @prop type value: "str" | "float" | "int" | "bool" | "image" | "video" | "audio" | "enum" | "list[image]" | "dict[str, any]"
  default: unknown;
  description: string;
  fieldType: "input" | "output";
  required: boolean;
  enumRef?: string; // Name of referenced enum
  enumValues?: string[]; // Raw values for @prop values array
  nestedAssetKey?: string; // Key inside nested object for asset URL
  parentField?: string; // If part of a nested structure
}

export interface NodeSpec {
  endpointId: string;
  className: string;
  docstring: string;
  tags: string[];
  useCases: string[];
  inputFields: FieldDef[];
  outputType: string; // "image" | "video" | "audio" | "dict"
  outputFields: FieldDef[];
  enums: EnumDef[];
  /** Filled at codegen when FAL_API_KEY can fetch GET /v1/models/pricing; otherwise null. */
  falUnitPricing?: FalUnitPricing | null;
}

export interface NodeConfig {
  className?: string;
  docstring?: string;
  tags?: string[];
  useCases?: string[];
  fieldOverrides?: Record<string, Partial<FieldDef>>;
  enumOverrides?: Record<string, string>; // oldEnumName -> newEnumName
  enumValueOverrides?: Record<string, Record<string, string>>; // enumName -> {oldKey: newKey}
  basicFields?: string[];
}

export interface ModuleConfig {
  sharedEnums?: Record<string, EnumDef>;
  configs: Record<string, NodeConfig>; // endpointId -> overrides
}
