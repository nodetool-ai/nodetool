import { parse as parseYaml } from "yaml";
import type { FieldDef, NodeConfig, ModuleConfig } from "./types.js";
import type { KieDocsEntry } from "./schema-fetcher.js";

type JsonRecord = Record<string, unknown>;
type MediaKind = "image" | "audio" | "video";

const IMAGE_REF = {
  type: "image" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

const AUDIO_REF = {
  type: "audio" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null
};

const VIDEO_REF = {
  type: "video" as const,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  duration: null,
  format: null
};

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function toWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
}

function toPascalCase(value: string): string {
  const className = toWords(value)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join("");
  return /^[A-Za-z]/.test(className) ? className : `Model${className}`;
}

function toTitle(value: string): string {
  return toWords(value)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function sanitizeParamName(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

function fieldNameForUrl(paramName: string, kind: MediaKind, isList: boolean): string {
  if (isList) {
    if (paramName === "input_urls") {
      return `${kind}s`;
    }
    if (paramName.endsWith(`_${kind}_urls`)) {
      return `${paramName.slice(0, -`${kind}_urls`.length)}${kind}s`;
    }
    if (paramName === `${kind}_urls`) {
      return `${kind}s`;
    }
    return paramName.replace(/_urls$/, "s");
  }
  return paramName.replace(/_url$/, "");
}

function moduleFromCategory(category: string): ModuleConfig["moduleName"] | null {
  const lower = category.toLowerCase().replace(/\s+/g, " ");
  if (lower.includes("video models")) {
    return "video";
  }
  if (lower.includes("audio") || lower.includes("suno") || lower.includes("elevenlabs")) {
    return "audio";
  }
  if (!lower.includes("image models")) {
    return null;
  }
  return "image";
}

function outputTypeForModule(moduleName: ModuleConfig["moduleName"]): NodeConfig["outputType"] {
  if (moduleName === "video") {
    return "video";
  }
  if (moduleName === "audio") {
    return "audio";
  }
  return "image";
}

function defaultForMedia(kind: MediaKind): unknown {
  if (kind === "audio") {
    return AUDIO_REF;
  }
  if (kind === "video") {
    return VIDEO_REF;
  }
  return IMAGE_REF;
}

function inferMediaKind(name: string, schema: JsonRecord): MediaKind | null {
  const text = `${name} ${String(schema.description ?? "")}`.toLowerCase();
  if (/\baudio\b|mp3|wav|aac|ogg|mpeg/.test(text)) {
    return "audio";
  }
  if (/\bvideo\b|mp4|mov|quicktime|matroska|mkv/.test(text)) {
    return "video";
  }
  if (/\bimage\b|\bframe\b|jpeg|jpg|png|webp|bmp|tiff|gif/.test(text)) {
    return "image";
  }
  return null;
}

function cleanDescription(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numericBoundsFromText(text: string): { min?: number; max?: number } {
  const minMatch = text.match(/\bMinimum:\s*(-?\d+(?:\.\d+)?)/i);
  const maxMatch = text.match(/\bMaximum:\s*(-?\d+(?:\.\d+)?)/i);
  if (minMatch || maxMatch) {
    return {
      ...(minMatch ? { min: Number(minMatch[1]) } : {}),
      ...(maxMatch ? { max: Number(maxMatch[1]) } : {})
    };
  }

  const rangeMatch = text.match(
    /\b(?:Range|Duration|Length)\b[^.\n\r]*?(?:\[|\(|:)?\s*(-?\d+(?:\.\d+)?)\s*(?:,|to|-|~)\s*(-?\d+(?:\.\d+)?)/i
  );
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }
  return {};
}

function boundsForSchema(schema: JsonRecord): { min?: number; max?: number } {
  const descriptionBounds = numericBoundsFromText(cleanDescription(schema.description));
  return {
    min:
      numericValue(schema.minimum) ??
      numericValue(schema.minLength) ??
      numericValue(schema.minItems) ??
      descriptionBounds.min,
    max:
      numericValue(schema.maximum) ??
      numericValue(schema.maxLength) ??
      numericValue(schema.maxItems) ??
      descriptionBounds.max
  };
}

function applyBounds(field: FieldDef, schema: JsonRecord): void {
  const bounds = boundsForSchema(schema);
  if (bounds.min !== undefined) {
    field.min = bounds.min;
  }
  if (bounds.max !== undefined) {
    field.max = bounds.max;
  }
}

function coerceDefault(schema: JsonRecord, type: FieldDef["type"]): unknown {
  if (type === "image" || type === "audio" || type === "video") {
    return defaultForMedia(type);
  }
  if (type.startsWith("list[")) {
    return [];
  }
  if (schema.default !== undefined) {
    return schema.default;
  }
  if (type === "bool") {
    return false;
  }
  if (type === "int" || type === "float") {
    return 0;
  }
  return "";
}

function mapField(paramName: string, schema: JsonRecord, required: boolean): {
  field: FieldDef;
  upload?: NonNullable<NodeConfig["uploads"]>[number];
  paramName?: string;
} | null {
  if (schema.deprecated === true) {
    return null;
  }

  const sourceName = sanitizeParamName(paramName);
  const schemaType = String(schema.type ?? "string");
  const enumValues = asStringArray(schema.enum);
  const isArray = schemaType === "array";
  const itemSchema = asRecord(schema.items) ?? {};
  const isUrlArray =
    isArray &&
    (sourceName.endsWith("_urls") || itemSchema.format === "uri" || cleanDescription(schema.description).includes("asset://"));
  const isUrl = schemaType === "string" && (sourceName.endsWith("_url") || schema.format === "uri");
  const mediaKind = (isUrl || isUrlArray) ? inferMediaKind(sourceName, schema) : null;

  if (mediaKind) {
    const fieldName = fieldNameForUrl(sourceName, mediaKind, isUrlArray);
    const fieldType = isUrlArray ? (`list[${mediaKind}]` as FieldDef["type"]) : mediaKind;
    const field: FieldDef = {
      name: fieldName,
      type: fieldType,
      default: coerceDefault(schema, fieldType),
      title: toTitle(fieldName),
      description: cleanDescription(schema.description),
      required
    };
    applyBounds(field, schema);
    return {
      field,
      upload: {
        field: fieldName,
        kind: mediaKind,
        ...(isUrlArray ? { isList: true } : {}),
        paramName: sourceName
      }
    };
  }

  let type: FieldDef["type"];
  if (enumValues?.length) {
    type = "enum";
  } else if (schemaType === "boolean") {
    type = "bool";
  } else if (schemaType === "integer") {
    type = "int";
  } else if (schemaType === "number") {
    type = "float";
  } else if (schemaType === "array") {
    type = "list[image]";
  } else {
    type = "str";
  }

  const field: FieldDef = {
    name: sourceName,
    type,
    default: coerceDefault(schema, type),
    title: toTitle(sourceName),
    description: cleanDescription(schema.description),
    required
  };
  if (enumValues?.length) {
    field.values = enumValues;
  }
  applyBounds(field, schema);
  return { field };
}

function extractOpenApi(markdown: string): JsonRecord | null {
  const match = markdown.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (!match) {
    return null;
  }
  const parsed = parseYaml(match[1]) as unknown;
  return asRecord(parsed) ?? null;
}

function firstPostOperation(openApi: JsonRecord): { path: string; operation: JsonRecord } | null {
  const paths = asRecord(openApi.paths);
  if (!paths) {
    return null;
  }
  const createTask = asRecord(paths["/api/v1/jobs/createTask"]);
  const createTaskPost = asRecord(createTask?.post);
  if (createTaskPost) {
    return { path: "/api/v1/jobs/createTask", operation: createTaskPost };
  }
  for (const [path, pathItem] of Object.entries(paths)) {
    const operation = asRecord(asRecord(pathItem)?.post);
    if (operation) {
      return { path, operation };
    }
  }
  return null;
}

function requestSchema(operation: JsonRecord): JsonRecord | null {
  const requestBody = asRecord(operation.requestBody);
  const content = asRecord(requestBody?.content);
  const json = asRecord(content?.["application/json"]);
  return asRecord(json?.schema) ?? null;
}

function inputSchema(schema: JsonRecord): JsonRecord | null {
  const properties = asRecord(schema.properties);
  return asRecord(properties?.input) ?? null;
}

function modelIdFromSchema(schema: JsonRecord): string | null {
  const properties = asRecord(schema.properties);
  const model = asRecord(properties?.model);
  const enumValues = asStringArray(model?.enum);
  if (enumValues?.[0]) {
    return enumValues[0];
  }
  return typeof model?.default === "string" ? model.default : null;
}

export class KieSchemaParser {
  parse(markdown: string, entry: KieDocsEntry): NodeConfig | null {
    const moduleName = moduleFromCategory(entry.category);
    if (!moduleName) {
      return null;
    }
    const openApi = extractOpenApi(markdown);
    if (!openApi) {
      return null;
    }
    const post = firstPostOperation(openApi);
    if (!post) {
      return null;
    }
    const schema = requestSchema(post.operation);
    if (!schema) {
      return null;
    }
    const isCreateTask = post.path === "/api/v1/jobs/createTask";
    if (!isCreateTask && moduleName !== "audio") {
      return null;
    }
    const input = isCreateTask ? inputSchema(schema) : schema;
    const modelId = isCreateTask ? modelIdFromSchema(schema) : String(post.operation.operationId ?? post.path.replace(/^\//, ""));
    if (!input) {
      return null;
    }
    if (!modelId) {
      return null;
    }

    const inputProperties = asRecord(input.properties) ?? {};
    const requiredFields = new Set(asStringArray(input.required) ?? []);
    const fields: FieldDef[] = [];
    const uploads: NonNullable<NodeConfig["uploads"]> = [];
    const paramNames: Record<string, string> = {};

    for (const [rawName, rawSchema] of Object.entries(inputProperties)) {
      if (["callBackUrl", "callback_url", "callbackUrl"].includes(rawName.trim())) {
        continue;
      }
      const propertySchema = asRecord(rawSchema);
      if (!propertySchema) {
        continue;
      }
      const mapped = mapField(rawName, propertySchema, requiredFields.has(rawName.trim()));
      if (!mapped) {
        continue;
      }
      fields.push(mapped.field);
      if (mapped.upload) {
        uploads.push(mapped.upload);
      }
      if (mapped.paramName && mapped.paramName !== mapped.field.name) {
        paramNames[mapped.field.name] = mapped.paramName;
      }
    }

    const outputType = outputTypeForModule(moduleName);
    const className = toPascalCase(String(post.operation.operationId ?? entry.title));
    const description = `${entry.title} via Kie.ai.\n\n    kie, ${moduleName}, ai\n\n    ${entry.summary || cleanDescription(post.operation.summary)}`;
    const validation = fields
      .filter((field) => field.required && (field.type === "str" || field.type === "enum"))
      .map((field) => ({
        field: field.name,
        rule: "not_empty" as const,
        message: `${field.title ?? field.name} is required`
      }));

    return {
      className,
      modelId,
      title: entry.title,
      description,
      outputType,
      ...(moduleName === "audio" && !isCreateTask
        ? { useSuno: true, sunoEndpoint: post.path }
        : {}),
      fields,
      ...(uploads.length ? { uploads } : {}),
      ...(Object.keys(paramNames).length ? { paramNames } : {}),
      ...(validation.length ? { validation } : {})
    };
  }
}
