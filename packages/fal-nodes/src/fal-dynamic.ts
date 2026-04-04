/**
 * FalRawNode and FalDynamicNode — TS port of dynamic_schema.py.
 *
 * The Python FalAI node fetches an OpenAPI schema from fal.ai at runtime and
 * dynamically exposes inputs/outputs derived from it.  The TS node SDK has
 * `isDynamic` and `supportsDynamicOutputs` static flags but no Python-style
 * runtime schema mutation, so we provide two nodes:
 *
 *  1. FalRawNode   — simple "call any endpoint" node. Takes an endpoint_id and
 *                    a JSON string of arguments, returns the raw result object.
 *                    Covers the same "call new endpoints without adding nodes"
 *                    use case at zero schema-resolution overhead.
 *
 *  2. FalDynamicNode — fetches the OpenAPI schema (from fal.ai) at process()
 *                      time, maps the input schema properties to the node's
 *                      dynamic-properties map, builds the argument dict, and
 *                      maps output values back. model_info accepts a raw
 *                      endpoint id (e.g. "fal-ai/flux/dev"), a fal.ai model
 *                      URL, or a llms.txt URL.
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  falUpload,
  imageToDataUrl
} from "./fal-base.js";

// ---------------------------------------------------------------------------
// Helpers: URL / endpoint resolution (ported from dynamic_schema.py)
// ---------------------------------------------------------------------------

function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isOpenApiUrl(value: string): boolean {
  return value.includes("openapi.json?endpoint_id=");
}

function looksLikeEndpointId(value: string): boolean {
  return value.includes("/") && !value.includes(" ") && !value.includes("\n");
}

function sanitizeEndpointId(value: string): string {
  const clean = value
    .trim()
    .replace(/[)\]}>.,;:]+$/, "")
    .trim();
  if (!/^[a-zA-Z0-9\-_/]+$/.test(clean)) {
    throw new Error(`Invalid characters in endpoint ID: ${clean}`);
  }
  return clean;
}

function openApiUrlForEndpoint(endpointId: string): string {
  return `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${sanitizeEndpointId(endpointId)}`;
}

function endpointFromOpenApiUrl(openApiUrl: string): string | null {
  try {
    const url = new URL(openApiUrl);
    const id = url.searchParams.get("endpoint_id");
    if (id) return sanitizeEndpointId(id);
  } catch {
    // ignore
  }
  return null;
}

function coerceLlmsUrl(value: string): string | null {
  if (value.endsWith("/llms.txt")) return value;
  try {
    const parsed = new URL(value);
    if (
      parsed.hostname.endsWith("fal.ai") &&
      parsed.pathname.startsWith("/models/")
    ) {
      return `${value.replace(/\/$/, "")}/llms.txt`;
    }
  } catch {
    // ignore
  }
  return null;
}

function endpointFromLlmsUrl(llmsUrl: string): string | null {
  try {
    const parsed = new URL(llmsUrl);
    if (!parsed.hostname.endsWith("fal.ai")) return null;
    if (!parsed.pathname.startsWith("/models/")) return null;
    if (!parsed.pathname.endsWith("/llms.txt")) return null;
    const endpointPath = parsed.pathname
      .replace("/models/", "")
      .replace("/llms.txt", "");
    return sanitizeEndpointId(endpointPath.replace(/^\/|\/$/g, ""));
  } catch {
    return null;
  }
}

/**
 * Normalize model_info into [modelInfoText, modelInfoUrl, endpointHint].
 * Mirrors Python _normalize_model_info.
 */
function normalizeModelInfo(
  modelInfo: string
): [string | null, string | null, string | null] {
  const normalized = modelInfo.trim();
  if (!normalized) return [null, null, null];

  if (isUrl(normalized)) {
    if (isOpenApiUrl(normalized)) {
      const hint = endpointFromOpenApiUrl(normalized);
      return [null, normalized, hint ? sanitizeEndpointId(hint) : null];
    }
    const llmsUrl = coerceLlmsUrl(normalized);
    if (llmsUrl) {
      const hint = endpointFromLlmsUrl(llmsUrl);
      return [null, llmsUrl, hint ? sanitizeEndpointId(hint) : null];
    }
    return [null, null, null];
  }

  if (looksLikeEndpointId(normalized)) {
    const clean = sanitizeEndpointId(normalized);
    const llmsUrl = `https://fal.ai/models/${clean}/llms.txt`;
    return [null, llmsUrl, clean];
  }

  // Treat as raw llms.txt text
  return [normalized, null, null];
}

function parseModelInfoText(
  modelInfoText: string,
  endpointHint: string | null
): [string | null, string | null] {
  let endpointId = endpointHint;
  let openApiUrl: string | null = null;

  const openApiMatch =
    /https?:\/\/[^\s`]+openapi\.json\?endpoint_id=[^`\s]+/.exec(modelInfoText);
  if (openApiMatch) openApiUrl = openApiMatch[0];

  const modelIdMatch = /Model ID\*\*:\s*`([^`]+)`/.exec(modelInfoText);
  if (modelIdMatch) endpointId = sanitizeEndpointId(modelIdMatch[1]);

  const endpointMatch = /Endpoint\*\*:\s*`https?:\/\/[^/]+\/([^`]+)`/.exec(
    modelInfoText
  );
  if (endpointMatch) endpointId = sanitizeEndpointId(endpointMatch[1]);

  if (!endpointId && openApiUrl) {
    endpointId = endpointFromOpenApiUrl(openApiUrl);
  }
  return [endpointId, openApiUrl];
}

function validateFalUrl(url: string): void {
  let domain: string;
  try {
    domain = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (
    !domain.endsWith(".fal.ai") &&
    domain !== "fal.ai" &&
    !domain.endsWith(".fal.run") &&
    domain !== "fal.run"
  ) {
    throw new Error(
      `Invalid domain for FAL schema resolution: ${domain}. Only *.fal.ai or *.fal.run domains are permitted.`
    );
  }
}

async function fetchOpenApi(
  openApiUrl: string
): Promise<Record<string, unknown>> {
  validateFalUrl(openApiUrl);
  const res = await fetch(openApiUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to fetch OpenAPI schema: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchModelInfoText(modelInfoUrl: string): Promise<string> {
  validateFalUrl(modelInfoUrl);
  const res = await fetch(modelInfoUrl, {
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) throw new Error(`Failed to fetch model info: ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

function resolveSchemaRef(
  openapi: Record<string, unknown>,
  schema: Record<string, unknown>
): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return {};
  if ("$ref" in schema) {
    return resolveRef(openapi, schema.$ref as string);
  }
  if ("oneOf" in schema) {
    const opts = schema.oneOf as Array<Record<string, unknown>>;
    if (opts?.length) return resolveSchemaRef(openapi, opts[0]);
  }
  if ("anyOf" in schema) {
    const opts = schema.anyOf as Array<Record<string, unknown>>;
    if (opts?.length) return resolveSchemaRef(openapi, opts[0]);
  }
  if ("allOf" in schema) {
    return mergeAllOf(openapi, schema.allOf as Array<Record<string, unknown>>);
  }
  return schema;
}

function resolveRef(
  openapi: Record<string, unknown>,
  ref: string
): Record<string, unknown> {
  if (!ref.startsWith("#/")) return {};
  const parts = ref.slice(2).split("/");
  let current: unknown = openapi;
  for (const part of parts) {
    if (!current || typeof current !== "object") return {};
    current = (current as Record<string, unknown>)[part];
    if (current === undefined) return {};
  }
  if (typeof current === "object" && current !== null) {
    return resolveSchemaRef(openapi, current as Record<string, unknown>);
  }
  return {};
}

function mergeAllOf(
  openapi: Record<string, unknown>,
  schemas: Array<Record<string, unknown>>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { type: "object", properties: {} };
  const required: string[] = [];
  for (const entry of schemas) {
    const resolved = resolveSchemaRef(openapi, entry);
    if (!resolved) continue;
    if (resolved.properties) {
      Object.assign(merged.properties as object, resolved.properties);
    }
    if (Array.isArray(resolved.required)) {
      required.push(...(resolved.required as string[]));
    }
    for (const key of ["title", "description", "type", "items"] as const) {
      if (key in resolved && !(key in merged)) {
        merged[key] = resolved[key];
      }
    }
  }
  if (required.length) merged.required = [...new Set(required)].sort();
  return merged;
}

function extractInputSchema(
  openapi: Record<string, unknown>
): Record<string, unknown> {
  const paths = openapi.paths as Record<string, unknown> | undefined;
  if (!paths) return {};
  for (const [, methods] of Object.entries(paths)) {
    const entry = (methods as Record<string, unknown>)?.post as
      | Record<string, unknown>
      | undefined;
    if (!entry) continue;
    const requestBody = entry.requestBody as
      | Record<string, unknown>
      | undefined;
    if (!requestBody) continue;
    const content = (requestBody.content as Record<string, unknown>)?.[
      "application/json"
    ] as Record<string, unknown> | undefined;
    const schema = content?.schema as Record<string, unknown> | undefined;
    if (schema) return resolveSchemaRef(openapi, schema);
  }
  return {};
}

function extractOutputSchema(
  openapi: Record<string, unknown>
): Record<string, unknown> {
  const paths = openapi.paths as Record<string, unknown> | undefined;
  if (!paths) return {};
  let candidate: Record<string, unknown> = {};
  for (const [pathKey, methods] of Object.entries(paths)) {
    const entry = (methods as Record<string, unknown>)?.get as
      | Record<string, unknown>
      | undefined;
    if (!entry) continue;
    const responses = entry.responses as Record<string, unknown> | undefined;
    const response = (responses?.["200"] ?? responses?.[200]) as
      | Record<string, unknown>
      | undefined;
    if (!response) continue;
    const content = (response.content as Record<string, unknown>)?.[
      "application/json"
    ] as Record<string, unknown> | undefined;
    const schema = content?.schema as Record<string, unknown> | undefined;
    if (!schema) continue;
    const resolved = resolveSchemaRef(openapi, schema);
    if (pathKey.endsWith("/requests/{request_id}")) return resolved;
    const props = resolved.properties as Record<string, unknown> | undefined;
    if (!(props && "status" in props && "request_id" in props)) {
      candidate = resolved;
    }
  }
  return candidate;
}

function endpointIdFromOpenApi(
  openapi: Record<string, unknown>,
  hint: string | null
): string {
  const metadata =
    ((openapi.info as Record<string, unknown>)?.["x-fal-metadata"] as Record<
      string,
      unknown
    >) ?? {};
  let id = (metadata.endpointId as string) ?? "";
  if (!id) id = hint ?? "";
  if (!id) {
    const paths = openapi.paths as Record<string, unknown> | undefined;
    for (const p of Object.keys(paths ?? {})) {
      if (p.startsWith("/")) {
        id = p.replace(/^\//, "");
        break;
      }
    }
  }
  return id;
}

// ---------------------------------------------------------------------------
// Value coercion: asset refs → FAL CDN URLs
// ---------------------------------------------------------------------------

async function coerceInputValue(
  apiKey: string,
  openapi: Record<string, unknown>,
  propSchema: Record<string, unknown>,
  value: unknown
): Promise<unknown> {
  const resolved = resolveSchemaRef(openapi, propSchema);

  // Check for asset ref (has .uri or .data)
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const ref = value as Record<string, unknown>;
    if (ref.uri !== undefined || ref.data !== undefined) {
      // Try data URI for images, CDN upload otherwise
      const dataUrl = await imageToDataUrl(ref);
      if (dataUrl) return dataUrl;
      const uri = ref.uri as string | undefined;
      if (uri?.startsWith("https://") && !uri.includes("localhost")) return uri;
      const data = ref.data as string | undefined;
      if (data) {
        const contentType =
          ref.type === "video"
            ? "video/mp4"
            : ref.type === "audio"
              ? "audio/mp3"
              : ref.type === "document"
                ? "application/pdf"
                : "application/octet-stream";
        const bytes = Uint8Array.from(Buffer.from(data, "base64"));
        return falUpload(apiKey, bytes, contentType);
      }
      return null;
    }
  }

  // Arrays
  if (resolved.type === "array" && Array.isArray(value)) {
    const itemSchema = (resolved.items as Record<string, unknown>) ?? {};
    return Promise.all(
      (value as unknown[]).map((item) =>
        coerceInputValue(apiKey, openapi, itemSchema, item)
      )
    );
  }

  return value;
}

// Output mapping helpers

function inferAssetType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("video") || lower.includes("gif")) return "video";
  if (
    lower.includes("audio") ||
    lower.includes("voice") ||
    lower.includes("sound")
  )
    return "audio";
  if (
    lower.includes("image") ||
    lower.includes("mask") ||
    lower.includes("frame")
  )
    return "image";
  if (
    lower.includes("document") ||
    lower.includes("pdf") ||
    lower.includes("doc")
  )
    return "document";
  return "asset";
}

function mapOutputValue(
  openapi: Record<string, unknown>,
  name: string,
  schema: Record<string, unknown>,
  value: unknown
): unknown {
  if (value === null || value === undefined) return value;
  const resolved = resolveSchemaRef(openapi, schema);

  if (resolved.type === "array" && Array.isArray(value)) {
    const itemSchema = (resolved.items as Record<string, unknown>) ?? {};
    return (value as unknown[]).map((item) =>
      mapOutputValue(openapi, name, itemSchema, item)
    );
  }

  // File schema (has "url" property) → return {uri, type}
  const props = resolved.properties as Record<string, unknown> | undefined;
  if (props && "url" in props && typeof value === "object" && value !== null) {
    const fileObj = value as Record<string, unknown>;
    const url = fileObj.url as string | undefined;
    if (url) {
      const assetType = inferAssetType(name);
      return { type: assetType, uri: url };
    }
  }

  return value;
}

function mapOutputValues(
  openapi: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  response: Record<string, unknown>
): Record<string, unknown> {
  const properties = (outputSchema.properties as Record<string, unknown>) ?? {};
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(properties)) {
    if (!(name in response)) continue;
    out[name] = mapOutputValue(
      openapi,
      name,
      schema as Record<string, unknown>,
      response[name]
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Task 14a: FalRawNode — simple "call any endpoint" node
// ---------------------------------------------------------------------------

export class FalRawNode extends BaseNode {
  static readonly nodeType = "fal.dynamic.FalRaw";
  static readonly title = "FAL Raw";
  static readonly description =
    "Call any fal.ai endpoint by ID with a JSON arguments string. " +
    "Returns the raw result object. " +
    "fal, dynamic, raw, endpoint, custom, any model";
  static readonly basicFields = ["endpoint_id", "arguments"];
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly isDynamic = false;
  static readonly outputTypes = { result: "dict" };

  @prop({
    type: "str",
    default: "",
    title: "Endpoint ID",
    description:
      'FAL endpoint ID, e.g. "fal-ai/flux/dev" or "fal-ai/mmaudio-v2/text-to-audio".'
  })
  declare endpoint_id: string;

  @prop({
    type: "str",
    default: "{}",
    title: "Arguments",
    description: "JSON object of arguments to pass to the endpoint."
  })
  declare arguments: string;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const endpointId = String(this.endpoint_id ?? "").trim();
    const argsStr = String(this.arguments ?? "{}");

    if (!endpointId) throw new Error("endpoint_id is required");

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsStr) as Record<string, unknown>;
    } catch {
      throw new Error(`arguments must be valid JSON: ${argsStr}`);
    }

    const result = await falSubmit(apiKey, endpointId, args);
    return { result };
  }
}

// ---------------------------------------------------------------------------
// Task 14b: FalDynamicNode — schema-driven "call any endpoint" node
// ---------------------------------------------------------------------------

/**
 * FalDynamicNode fetches the OpenAPI schema for a fal.ai model at process()
 * time and uses it to:
 *  - validate / coerce input values (asset refs → CDN URLs / data URIs)
 *  - map output file objects to {type, uri} asset refs
 *
 * model_info can be:
 *  - A raw endpoint ID: "fal-ai/flux/dev"
 *  - A fal.ai model URL: "https://fal.ai/models/fal-ai/flux/dev"
 *  - A llms.txt URL: "https://fal.ai/models/fal-ai/flux/dev/llms.txt"
 *  - A fal.ai OpenAPI URL: "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=..."
 *  - Pasted llms.txt content
 *
 * Additional inputs beyond model_info are passed as dynamic properties and
 * forwarded to the endpoint.
 */
export class FalDynamicNode extends BaseNode {
  static readonly nodeType = "fal.dynamic.FalDynamic";
  static readonly title = "FAL Dynamic";
  static readonly description =
    "Dynamic FAL node — fetches the OpenAPI schema for any fal.ai endpoint and " +
    "calls it with inputs resolved from the schema. " +
    "fal, schema, dynamic, openapi, inference, runtime, model, any";
  static readonly basicFields = ["model_info"];
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly isDynamic = true;
  static readonly supportsDynamicOutputs = true;
  static readonly outputTypes = { result: "dict" };

  @prop({
    type: "str",
    default: "",
    title: "Model Info",
    description:
      "Endpoint ID (e.g. 'fal-ai/flux/dev'), fal.ai model URL, llms.txt URL, or pasted llms.txt content."
  })
  declare model_info: string;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const modelInfo = String(this.model_info ?? "").trim();

    if (!modelInfo) {
      throw new Error(
        "model_info is required: paste an endpoint ID, fal.ai model URL, llms.txt URL, or llms.txt content"
      );
    }

    // Resolve OpenAPI schema and endpoint ID
    const { openapi, endpointId } = await this._resolveSchema(modelInfo);

    // Extract input/output schemas
    const inputSchema = extractInputSchema(openapi);
    const outputSchema = extractOutputSchema(openapi);

    // Build arguments from dynamic properties (excluding known node meta keys)
    const SKIP_KEYS = new Set([
      "model_info",
      "_secrets",
      "__node_id",
      "__node_name"
    ]);
    const schemaProps =
      (inputSchema.properties as Record<string, Record<string, unknown>>) ?? {};
    const required = new Set<string>(
      Array.isArray(inputSchema.required)
        ? (inputSchema.required as string[])
        : []
    );

    const args: Record<string, unknown> = {};

    // First pass: schema-declared properties
    for (const [name, propSchema] of Object.entries(schemaProps)) {
      const value = this.getDynamic(name) ?? (this as any)[name];
      if (value === undefined || value === null) {
        if (required.has(name)) {
          throw new Error(`Missing required input: ${name}`);
        }
        continue;
      }
      args[name] = await coerceInputValue(apiKey, openapi, propSchema, value);
    }

    // Second pass: any extra dynamic properties not in schema are forwarded as-is
    for (const [key, value] of this.dynamicProps.entries()) {
      if (SKIP_KEYS.has(key)) continue;
      if (key in args) continue; // already handled
      if (value !== undefined && value !== null) args[key] = value;
    }

    const result = (await falSubmit(apiKey, endpointId, args)) as Record<
      string,
      unknown
    >;

    // Map output values
    const mapped = mapOutputValues(openapi, outputSchema, result);
    if (Object.keys(mapped).length > 0) return mapped;
    return { result };
  }

  private async _resolveSchema(
    modelInfo: string
  ): Promise<{ openapi: Record<string, unknown>; endpointId: string }> {
    const [modelInfoText, modelInfoUrl, endpointHint] =
      normalizeModelInfo(modelInfo);

    if (!modelInfoText && !modelInfoUrl) {
      throw new Error(
        "Unable to parse model_info — expected endpoint ID, fal.ai URL, llms.txt URL, or llms.txt text"
      );
    }

    let openApiUrl: string | null = null;
    let endpointId: string | null = endpointHint;
    let llmInfo = modelInfoText;

    if (modelInfoUrl) {
      if (isOpenApiUrl(modelInfoUrl)) {
        openApiUrl = modelInfoUrl;
        endpointId = endpointId ?? endpointFromOpenApiUrl(modelInfoUrl);
      } else {
        llmInfo = await fetchModelInfoText(modelInfoUrl);
      }
    }

    if (llmInfo) {
      [endpointId, openApiUrl] = parseModelInfoText(llmInfo, endpointId);
    }

    if (!openApiUrl && endpointId) {
      openApiUrl = openApiUrlForEndpoint(endpointId);
    }

    if (!openApiUrl) {
      throw new Error(
        "Unable to resolve an OpenAPI schema URL from model_info"
      );
    }

    const openapi = await fetchOpenApi(openApiUrl);
    const resolvedEndpointId = endpointIdFromOpenApi(openapi, endpointId);

    return { openapi, endpointId: resolvedEndpointId };
  }
}
