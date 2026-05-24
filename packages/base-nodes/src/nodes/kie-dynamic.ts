/**
 * Dynamic Kie.ai node that creates inputs/outputs from pasted API documentation.
 */
import { parse as parseYaml } from "yaml";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getApiKey,
  isRefSet,
  kieExecuteTask,
  kieExecuteOmniDirect,
  kieImageRef,
  reportKieProviderCost,
  uploadAudioInput,
  uploadImageInput,
  uploadVideoInput,
  buildVideoClipsFromRefs
} from "@nodetool-ai/kie-nodes";
import type { TypeMetadata } from "@nodetool-ai/node-sdk";

type JsonRecord = Record<string, unknown>;

interface KieParamInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
  options?: string[];
  minVal?: number;
  maxVal?: number;
  isFileUrl: boolean;
  isFileUrlArray: boolean;
  /** gemini-omni-video style: [{ url, start, ends }] */
  isVideoClipList: boolean;
  acceptedFileTypes: string[];
}

interface KieSchemaBundle {
  modelId: string;
  params: KieParamInfo[];
  outputType: string; // "image" | "video" | "audio" | "text"
  execution: KieExecutionConfig;
}

interface KieExecutionConfig {
  mode: "createTask" | "omniDirect";
  submitEndpoint?: string;
  responseIdKey?: string;
}

const OMNI_VIDEO_SUPPLEMENTS: KieParamInfo[] = [
  {
    name: "duration",
    type: "string",
    required: true,
    description: "Generated video duration in seconds (4, 6, 8, or 10).",
    default: "8",
    options: ["4", "6", "8", "10"],
    isFileUrl: false,
    isFileUrlArray: false,
    isVideoClipList: false,
    acceptedFileTypes: []
  },
  {
    name: "audio_ids",
    type: "array",
    required: false,
    description: "Audio IDs from gemini-omni-audio for narration or dialogue.",
    isFileUrl: false,
    isFileUrlArray: false,
    isVideoClipList: false,
    acceptedFileTypes: []
  },
  {
    name: "character_ids",
    type: "array",
    required: false,
    description: "Character IDs from gemini-omni-character.",
    isFileUrl: false,
    isFileUrlArray: false,
    isVideoClipList: false,
    acceptedFileTypes: []
  },
  {
    name: "video_list",
    type: "array",
    required: false,
    description: "Source video clips with trim ranges for video editing.",
    isFileUrl: false,
    isFileUrlArray: true,
    isVideoClipList: true,
    acceptedFileTypes: []
  }
];

export interface ResolvedKieDynamicSchema {
  model_id: string;
  dynamic_properties: Record<string, unknown>;
  dynamic_inputs: Record<
    string,
    TypeMetadata & {
      description?: string;
      min?: number;
      max?: number;
      default?: unknown;
    }
  >;
  dynamic_outputs: Record<string, TypeMetadata>;
}

const HIDDEN_PARAMS = new Set(["upload_method", "callBackUrl", "callback_url"]);

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

function cleanDescription(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function extractModelId(text: string): string | null {
  let m = text.match(/\*\*Format\*\*\s*\|\s*`([^`]+)`/);
  if (m) return m[1].trim();
  m = text.match(/[Mm]odel\s+name,?\s*format:\s*`([^`]+)`/);
  if (m) return m[1].trim();
  m = text.match(/"model"\s*:\s*"([^"]+)"/);
  if (m) return m[1].trim();

  const openApiModel = extractOpenApiModelId(text);
  if (openApiModel) return openApiModel;

  return null;
}

function extractOpenApiModelId(text: string): string | null {
  const openApi = extractOpenApi(text);
  if (!openApi) return null;

  const paths = asRecord(openApi.paths);
  const createTask = asRecord(paths?.["/api/v1/jobs/createTask"]);
  const post = asRecord(createTask?.post);
  const requestBody = asRecord(post?.requestBody);
  const content = asRecord(requestBody?.content);
  const json = asRecord(content?.["application/json"]);
  const schema = asRecord(json?.schema);
  const properties = asRecord(schema?.properties);
  const model = asRecord(properties?.model);
  const enumValues = asStringArray(model?.enum);
  if (enumValues?.[0]) return enumValues[0];
  return typeof model?.default === "string" ? model.default : null;
}

function extractOpenApi(text: string): JsonRecord | null {
  const match = text.match(/```ya?ml\s*([\s\S]*?)```/i);
  if (!match) return null;
  const parsed = parseYaml(match[1]) as unknown;
  return asRecord(parsed) ?? null;
}

function isVideoClipSchema(schema: JsonRecord): boolean {
  const items = asRecord(schema.items);
  if (items?.type !== "object") return false;
  const props = asRecord(items.properties);
  return Boolean(props?.url);
}

function inferOutputType(modelId: string, _text: string): string {
  if (modelId === "gemini-omni-audio" || modelId === "gemini-omni-character") {
    return "text";
  }
  const lower = modelId.toLowerCase();
  const videoKws = [
    "video",
    "storyboard",
    "avatar",
    "seedance",
    "kling",
    "hailuo",
    "sora",
    "wan",
    "infinitalk",
    "omni-video"
  ];
  if (videoKws.some((kw) => lower.includes(kw))) return "video";
  const audioKws = ["music", "suno", "speech", "tts"];
  if (audioKws.some((kw) => lower.includes(kw))) return "audio";
  if (lower.includes("audio") && !lower.includes("omni-audio")) return "audio";
  return "image";
}

function resolveExecutionConfig(modelId: string): KieExecutionConfig {
  if (modelId === "gemini-omni-audio") {
    return {
      mode: "omniDirect",
      submitEndpoint: "/api/v1/omni/audio/create",
      responseIdKey: "audioId"
    };
  }
  if (modelId === "gemini-omni-character") {
    return {
      mode: "omniDirect",
      submitEndpoint: "/api/v1/omni/character/create",
      responseIdKey: "characterId"
    };
  }
  return { mode: "createTask" };
}

function supplementOmniParams(modelId: string, params: KieParamInfo[]): KieParamInfo[] {
  if (modelId !== "gemini-omni-video") {
    return params;
  }
  const existing = new Set(params.map((p) => p.name));
  const extras = OMNI_VIDEO_SUPPLEMENTS.filter((p) => !existing.has(p.name));
  return extras.length ? [...params, ...extras] : params;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter((item) => item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function parseInputParams(text: string): KieParamInfo[] {
  const sectionMatch = text.match(
    /###\s*input\s+Object\s+Parameters(.*?)(?=\n##\s|\n---|$)/is
  );
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const blocks = section.split(/\n####\s+/);
  const params: KieParamInfo[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const nameMatch = trimmed.match(/^(\w+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (HIDDEN_PARAMS.has(name)) continue;

    const typeMatch = trimmed.match(/\*\*Type\*\*:\s*`([^`]+)`/);
    const paramType = typeMatch ? typeMatch[1].trim() : "string";

    const reqMatch = trimmed.match(/\*\*Required\*\*:\s*(Yes|No)/i);
    const required = reqMatch ? reqMatch[1].toLowerCase() === "yes" : false;

    const descMatch = trimmed.match(
      /\*\*Description\*\*:\s*(.+?)(?=\n\s*-\s*\*\*|$)/s
    );
    const description = descMatch ? descMatch[1].trim() : "";

    let defaultVal: unknown = undefined;
    const defMatch = trimmed.match(/\*\*Default Value\*\*:\s*`([^`]*)`/);
    if (defMatch) defaultVal = coerceDefault(defMatch[1], paramType);

    let options: string[] | undefined;
    const optMatch = trimmed.match(
      /\*\*Options\*\*:\s*\n((?:\s*-\s*`[^`]+`.*\n?)+)/
    );
    if (optMatch) {
      options = [...optMatch[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    }

    const bounds = parseBounds(trimmed);
    const minVal = bounds.min;
    const maxVal = bounds.max;

    let isFileUrl = false;
    let isFileUrlArray = false;
    let isVideoClipList = false;
    const acceptedFileTypes: string[] = [];
    const ftMatch = trimmed.match(/\*\*Accepted File Types\*\*:\s*(.+)/);
    if (ftMatch)
      acceptedFileTypes.push(...ftMatch[1].split(",").map((t) => t.trim()));

    if (name.endsWith("_ids") && paramType === "array") {
      isFileUrl = false;
      isFileUrlArray = false;
    } else if (name === "video_list" && paramType === "array") {
      isFileUrlArray = true;
      isVideoClipList = true;
    } else if (
      acceptedFileTypes.length ||
      description.includes("Upload") ||
      description.includes("URL")
    ) {
      if (paramType === "array") isFileUrlArray = true;
      else isFileUrl = true;
    }
    if (name.endsWith("_url") && paramType === "string") isFileUrl = true;
    if (name.endsWith("_urls") && paramType === "array") isFileUrlArray = true;

    params.push({
      name,
      type: paramType,
      required,
      description,
      default: defaultVal,
      options,
      minVal,
      maxVal,
      isFileUrl,
      isFileUrlArray,
      isVideoClipList,
      acceptedFileTypes
    });
  }
  return params;
}

function openApiPropertyToParam(
  name: string,
  schema: JsonRecord,
  required: boolean
): KieParamInfo | null {
  if (HIDDEN_PARAMS.has(name)) return null;

  const schemaType = String(schema.type ?? "string");
  const description = cleanDescription(schema.description);
  const enumValues = asStringArray(schema.enum);
  const isArray = schemaType === "array";
  const itemSchema = asRecord(schema.items) ?? {};
  const isUrlArray =
    isArray &&
    (name.endsWith("_urls") ||
      itemSchema.format === "uri" ||
      description.includes("asset://"));
  const isUrl =
    schemaType === "string" && (name.endsWith("_url") || schema.format === "uri");
  const isVideoClipList =
    name === "video_list" || (isArray && isVideoClipSchema(schema));
  const isIdArray = isArray && name.endsWith("_ids");
  const mediaKind =
    isUrl || isUrlArray || isVideoClipList
      ? detectMediaKindFromText(
          `${name} ${description} ${String(itemSchema.description ?? "")}`
        )
      : null;

  let paramType = schemaType;
  if (isArray) paramType = "array";

  let defaultVal: unknown = schema.default;
  if (defaultVal === undefined && enumValues?.length) {
    defaultVal = enumValues[0];
  }

  let options: string[] | undefined = enumValues;
  if (isArray && asStringArray(itemSchema.enum)?.length) {
    options = asStringArray(itemSchema.enum);
  }

  const bounds = parseBounds(description);
  let isFileUrl = false;
  let isFileUrlArray = false;

  if (isIdArray) {
    isFileUrl = false;
    isFileUrlArray = false;
  } else if (isVideoClipList) {
    isFileUrlArray = true;
  } else if (mediaKind && isUrlArray) {
    isFileUrlArray = true;
  } else if (mediaKind && isUrl) {
    isFileUrl = true;
  } else if (
    isArray &&
    (name.endsWith("_urls") ||
      description.includes("Upload") ||
      /\bURL\b/i.test(description))
  ) {
    isFileUrlArray = true;
  } else if (
    schemaType === "string" &&
    (name.endsWith("_url") ||
      description.includes("Upload") ||
      /\bURL\b/i.test(description))
  ) {
    isFileUrl = true;
  }

  return {
    name,
    type: paramType,
    required,
    description,
    default: defaultVal,
    options,
    minVal: bounds.min,
    maxVal: bounds.max,
    isFileUrl,
    isFileUrlArray,
    isVideoClipList,
    acceptedFileTypes: []
  };
}

function parseFlatOpenApiParams(text: string, path: string): KieParamInfo[] {
  const openApi = extractOpenApi(text);
  if (!openApi) return [];

  const paths = asRecord(openApi.paths);
  const post = asRecord(asRecord(paths?.[path])?.post);
  if (!post) return [];

  const requestBody = asRecord(post.requestBody);
  const content = asRecord(requestBody?.content);
  const json = asRecord(content?.["application/json"]);
  const schema = asRecord(json?.schema);
  const properties = asRecord(schema?.properties);
  if (!properties) return [];

  const requiredFields = new Set(asStringArray(schema?.required) ?? []);
  const params: KieParamInfo[] = [];

  for (const [name, rawSchema] of Object.entries(properties)) {
    const param = openApiPropertyToParam(
      name,
      asRecord(rawSchema) ?? {},
      requiredFields.has(name)
    );
    if (param) params.push(param);
  }

  return params;
}

function parseOpenApiInputParams(text: string, modelId: string): KieParamInfo[] {
  if (modelId === "gemini-omni-audio") {
    const omni = parseFlatOpenApiParams(text, "/api/v1/omni/audio/create");
    if (omni.length) return omni;
  }
  if (modelId === "gemini-omni-character") {
    const omni = parseFlatOpenApiParams(text, "/api/v1/omni/character/create");
    if (omni.length) return omni;
  }

  const openApi = extractOpenApi(text);
  if (!openApi) return [];

  const paths = asRecord(openApi.paths);
  const createTask = asRecord(paths?.["/api/v1/jobs/createTask"]);
  const post = asRecord(createTask?.post);
  if (!post) return [];

  const requestBody = asRecord(post.requestBody);
  const content = asRecord(requestBody?.content);
  const json = asRecord(content?.["application/json"]);
  const schema = asRecord(json?.schema);
  const properties = asRecord(schema?.properties);
  const inputSchema = asRecord(properties?.input);
  const inputProperties = asRecord(inputSchema?.properties);
  if (!inputProperties) return [];

  const requiredFields = new Set(asStringArray(inputSchema?.required) ?? []);
  const params: KieParamInfo[] = [];

  for (const [name, rawSchema] of Object.entries(inputProperties)) {
    const param = openApiPropertyToParam(
      name,
      asRecord(rawSchema) ?? {},
      requiredFields.has(name)
    );
    if (param) params.push(param);
  }

  return params;
}

function mergeKieParams(
  markdownParams: KieParamInfo[],
  openApiParams: KieParamInfo[]
): KieParamInfo[] {
  const merged = new Map<string, KieParamInfo>();
  for (const param of openApiParams) {
    merged.set(param.name, param);
  }
  for (const param of markdownParams) {
    const existing = merged.get(param.name);
    if (!existing) {
      merged.set(param.name, param);
      continue;
    }
    merged.set(param.name, {
      ...existing,
      ...param,
      description: param.description || existing.description,
      options: param.options?.length ? param.options : existing.options,
      acceptedFileTypes: param.acceptedFileTypes.length
        ? param.acceptedFileTypes
        : existing.acceptedFileTypes,
      isVideoClipList: param.isVideoClipList || existing.isVideoClipList,
      isFileUrlArray: param.isFileUrlArray || existing.isFileUrlArray,
      isFileUrl: param.isFileUrl || existing.isFileUrl
    });
  }
  return [...merged.values()];
}

function coerceDefault(raw: string, paramType: string): unknown {
  if (paramType === "integer") {
    const n = parseInt(raw, 10);
    return isNaN(n) ? raw : n;
  }
  if (paramType === "number") {
    const n = parseFloat(raw);
    return isNaN(n) ? raw : n;
  }
  if (paramType === "boolean")
    return ["true", "1", "yes"].includes(raw.toLowerCase());
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseBounds(text: string): { min?: number; max?: number } {
  const rangeMatch = text.match(
    /\*\*Range\*\*:\s*`?(-?\d+(?:\.\d+)?)`?\s*(?:to|-|~)\s*`?(-?\d+(?:\.\d+)?)`?/i
  );
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  }

  const minLengthMatch = text.match(/\*\*Min(?:imum)? Length\*\*:\s*`?(-?\d+(?:\.\d+)?)`?/i);
  const maxLengthMatch = text.match(/\*\*Max(?:imum)? Length\*\*:\s*`?(-?\d+(?:\.\d+)?)`?/i);
  const minMatch = text.match(/\bMinimum:\s*(-?\d+(?:\.\d+)?)/i);
  const maxMatch = text.match(/\bMaximum:\s*(-?\d+(?:\.\d+)?)/i);

  return {
    ...(minLengthMatch || minMatch
      ? { min: Number((minLengthMatch ?? minMatch)![1]) }
      : {}),
    ...(maxLengthMatch || maxMatch
      ? { max: Number((maxLengthMatch ?? maxMatch)![1]) }
      : {})
  };
}

function detectMediaKindFromText(text: string): "image" | "audio" | "video" | null {
  const firstToken = text.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (/^image_urls?$|^images?$/.test(firstToken)) return "image";
  if (/^video_urls?$|^video_list$/.test(firstToken)) return "video";
  if (/^audio_urls?$/.test(firstToken)) return "audio";
  const joined = text.toLowerCase();
  if (joined.includes("image/")) return "image";
  if (joined.includes("audio/")) return "audio";
  if (joined.includes("video/")) return "video";
  if (/\bimage\b|jpeg|jpg|png|webp|gif|bmp/.test(joined)) return "image";
  if (/\baudio\b|mp3|wav|aac|ogg|mpeg/.test(joined)) return "audio";
  if (/\bvideo\b|mp4|mov|quicktime|matroska|mkv/.test(joined)) return "video";
  return null;
}

function detectMediaKind(
  param: KieParamInfo
): "image" | "audio" | "video" | null {
  if (param.isVideoClipList) return "video";
  return detectMediaKindFromText(
    `${param.name} ${param.description} ${param.acceptedFileTypes.join(",")}`
  );
}

function fieldNameForParam(param: KieParamInfo): string {
  const kind = detectMediaKind(param) ?? "image";
  if (param.isVideoClipList) {
    return param.name;
  }
  if (param.isFileUrlArray) {
    if (param.name === "input_urls") return `${kind}s`;
    if (param.name.endsWith(`_${kind}_urls`)) {
      return `${param.name.slice(0, -`${kind}_urls`.length)}${kind}s`;
    }
    if (param.name === `${kind}_urls`) return `${kind}s`;
    return param.name.replace(/_urls$/, "s");
  }
  if (param.isFileUrl) {
    return param.name.replace(/_url$/, "");
  }
  return param.name;
}

function mapParamType(param: KieParamInfo): TypeMetadata {
  if (param.isVideoClipList) {
    return {
      type: "video_clip_list",
      type_args: [],
      ...(param.minVal !== undefined ? { min: param.minVal } : {}),
      ...(param.maxVal !== undefined ? { max: param.maxVal } : {})
    };
  }
  if (param.name.endsWith("_ids") && param.type === "array") {
    return { type: "list", type_args: [{ type: "str", type_args: [] }] };
  }
  if (param.isFileUrlArray) {
    const kind = detectMediaKind(param) ?? "image";
    return { type: "list", type_args: [{ type: kind, type_args: [] }] };
  }
  if (param.isFileUrl) {
    const kind = detectMediaKind(param) ?? "image";
    return { type: kind, type_args: [] };
  }
  switch (param.type) {
    case "string":
      return {
        type: "str",
        type_args: [],
        ...(param.options?.length ? { values: param.options } : {})
      };
    case "boolean":
      return { type: "bool", type_args: [] };
    case "integer":
      return { type: "int", type_args: [] };
    case "number":
      return { type: "float", type_args: [] };
    case "array":
      return {
        type: "list",
        type_args: [{ type: "str", type_args: [] }]
      };
    default:
      return { type: "any", type_args: [] };
  }
}

function defaultRefForKind(kind: "image" | "audio" | "video"): unknown {
  if (kind === "audio") {
    return { type: "audio", uri: "", asset_id: null, data: null, metadata: null };
  }
  if (kind === "video") {
    return {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    };
  }
  return { type: "image", uri: "", asset_id: null, data: null, metadata: null };
}

function defaultDynamicValue(param: KieParamInfo): unknown {
  if (param.isVideoClipList || param.isFileUrlArray) {
    return [];
  }
  if (param.isFileUrl) {
    return defaultRefForKind(detectMediaKind(param) ?? "image");
  }
  if (param.default !== undefined) {
    return param.default;
  }
  if (param.type === "array") {
    return [];
  }
  if (param.type === "string") {
    return "";
  }
  if (param.type === "boolean") {
    return false;
  }
  return null;
}

function mapOutputType(outputType: string): TypeMetadata {
  if (outputType === "text") {
    return { type: "str", type_args: [], optional: false };
  }
  if (outputType === "video") {
    return { type: "video", type_args: [], optional: false };
  }
  if (outputType === "audio") {
    return { type: "audio", type_args: [], optional: false };
  }
  return { type: "image", type_args: [], optional: false };
}

function parseKieDocs(text: string): KieSchemaBundle {
  const modelId = extractModelId(text);
  if (!modelId) throw new Error("Could not find model ID in documentation");
  const params = supplementOmniParams(
    modelId,
    mergeKieParams(parseInputParams(text), parseOpenApiInputParams(text, modelId))
  );
  return {
    modelId,
    params,
    outputType: inferOutputType(modelId, text),
    execution: resolveExecutionConfig(modelId)
  };
}

export function resolveKieDynamicSchema(
  modelInfo: string
): ResolvedKieDynamicSchema {
  const bundle = parseKieDocs(modelInfo);
  const dynamic_properties: Record<string, unknown> = {};
  const dynamic_inputs: ResolvedKieDynamicSchema["dynamic_inputs"] = {};

  for (const param of bundle.params) {
    const fieldName = fieldNameForParam(param);
    dynamic_properties[fieldName] = defaultDynamicValue(param);
    dynamic_inputs[fieldName] = {
      ...mapParamType(param),
      optional: !param.required,
      ...(param.description ? { description: param.description } : {}),
      ...(param.minVal !== undefined ? { min: param.minVal } : {}),
      ...(param.maxVal !== undefined ? { max: param.maxVal } : {}),
      ...(param.default !== undefined && !param.isFileUrl && !param.isFileUrlArray
        ? { default: param.default }
        : {})
    };
  }

  const outputName =
    bundle.outputType === "video"
      ? "video"
      : bundle.outputType === "audio"
        ? "audio"
        : bundle.outputType === "text"
          ? "output"
          : "image";

  return {
    model_id: bundle.modelId,
    dynamic_properties,
    dynamic_inputs,
    dynamic_outputs: {
      [outputName]: mapOutputType(bundle.outputType)
    }
  };
}

export class KieAINode extends BaseNode {
  static readonly nodeType = "kie.dynamic_schema.KieAI";
  static readonly title = "Kie AI";
  static readonly description =
    "Dynamic Kie.ai node for running any kie.ai model.\n    kie, dynamic, schema, api, inference, runtime, model\n\n    Use cases:\n    - Call any kie.ai model without a dedicated Python node\n    - Prototype workflows with new models as they appear\n    - Run models by pasting their API documentation\n    - Access the full kie.ai catalog dynamically";
  static readonly inlineFields = ["model_info"];
  static readonly inputFields = [];
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;

  @prop({
    type: "str",
    default: "",
    title: "Model Info",
    description: "Paste the full API documentation from the kie.ai model page."
  })
  declare model_info: any;

  async process(
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<Record<string, unknown>> {
    const modelInfo = String(this.model_info ?? "").trim();
    if (!modelInfo)
      throw new Error("model_info is empty. Paste kie.ai API documentation.");
    const apiKey = getApiKey(this._secrets);
    const bundle = parseKieDocs(modelInfo);

    const apiInput: Record<string, unknown> = {};
    for (const p of bundle.params) {
      const fieldName = fieldNameForParam(p);
      const val =
        this.getDynamic(fieldName) ??
        (this as any)[fieldName] ??
        this.getDynamic(p.name) ??
        (this as any)[p.name];
      if (val === undefined || val === null) {
        if (p.required) throw new Error(`Missing required input: ${fieldName}`);
        continue;
      }

      if (p.isVideoClipList) {
        const clips = await buildVideoClipsFromRefs(
          (ref) => uploadVideoInput(apiKey, ref, context),
          val
        );
        if (clips.length) apiInput[p.name] = clips;
      } else if (p.isFileUrlArray) {
        const kind = detectMediaKind(p) ?? "image";
        const uploadFn =
          kind === "audio"
            ? uploadAudioInput
            : kind === "video"
              ? uploadVideoInput
              : uploadImageInput;
        const items = Array.isArray(val) ? val : [];
        const urls: string[] = [];
        for (const item of items) {
          if (isRefSet(item)) {
            urls.push(await uploadFn(apiKey, item, context));
          } else if (typeof item === "string" && item) {
            urls.push(item);
          }
        }
        if (urls.length) apiInput[p.name] = urls;
      } else if (p.name.endsWith("_ids") && p.type === "array") {
        const list = normalizeStringList(val);
        if (list.length) apiInput[p.name] = list;
      } else if (p.isFileUrl) {
        const kind = detectMediaKind(p) ?? "image";
        const uploadFn =
          kind === "audio"
            ? uploadAudioInput
            : kind === "video"
              ? uploadVideoInput
              : uploadImageInput;
        if (isRefSet(val)) {
          apiInput[p.name] = await uploadFn(apiKey, val, context);
        } else if (typeof val === "string" && val) {
          apiInput[p.name] = val;
        }
      } else {
        apiInput[p.name] = val;
      }
    }

    let result: Awaited<ReturnType<typeof kieExecuteTask>>;
    if (bundle.execution.mode === "omniDirect") {
      if (!bundle.execution.submitEndpoint || !bundle.execution.responseIdKey) {
        throw new Error(`Omni model ${bundle.modelId} is missing direct endpoint config`);
      }
      result = await kieExecuteOmniDirect(
        apiKey,
        bundle.execution.submitEndpoint,
        apiInput,
        bundle.execution.responseIdKey
      );
    } else {
      result = await kieExecuteTask(
        apiKey,
        bundle.modelId,
        apiInput,
        2000,
        300
      );
    }

    reportKieProviderCost(context, result.creditsConsumed);

    if (bundle.outputType === "text") {
      return { output: result.data };
    }
    if (bundle.outputType === "video")
      return { video: { type: "video", uri: "", data: result.data } };
    if (bundle.outputType === "audio")
      return { audio: { type: "audio", uri: "", data: result.data } };
    return { image: await kieImageRef(result.data) };
  }
}

export const KIE_DYNAMIC_NODES: readonly NodeClass[] = [KieAINode];
