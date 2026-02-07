/**
 * FAL dynamic schema resolution via backend.
 * POSTs model_info (pasted OpenAPI JSON, llms.txt, URL, or endpoint id) to the
 * app backend to avoid CORS; backend returns dynamic_properties and dynamic_outputs.
 */

export interface ResolvedFalSchema {
  dynamic_properties: Record<string, unknown>;
  dynamic_outputs: Record<
    string,
    { type: string; type_args?: unknown[]; optional?: boolean }
  >;
  endpoint_id?: string;
}

function sanitizeEndpointId(value: string): string {
  return value
    .trim()
    .replace(/[)\]\}>.,;:]+$/, "")
    .trim();
}

/**
 * Normalize user input (URL, endpoint id, or path) to a fal.ai endpoint id
 * suitable for the OpenAPI URL.
 */
export function modelInfoToEndpointId(modelInfo: string): string | null {
  const raw = (modelInfo ?? "").trim();
  if (!raw) return null;

  // Already looks like endpoint id (e.g. "fal-ai/flux-2/klein/4b/base/edit")
  if (raw.includes("/") && !raw.includes(" ") && !raw.startsWith("http")) {
    return sanitizeEndpointId(raw);
  }

  // fal.ai model URL -> extract path after /models/
  if (
    raw.startsWith("http") &&
    raw.includes("fal.ai") &&
    raw.includes("/models/")
  ) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith("/models/")) {
        const path = u.pathname
          .replace(/^\/models\/?,?/, "")
          .replace(/\/?$/, "");
        const id = path || u.pathname.replace("/models/", "");
        return sanitizeEndpointId(id);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function resolveRef(
  openapi: Record<string, unknown>,
  ref: string
): Record<string, unknown> | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let current: unknown = openapi;
  for (const part of parts) {
    if (
      current == null ||
      typeof current !== "object" ||
      Array.isArray(current)
    )
      return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "object" &&
    current !== null &&
    !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : null;
}

function resolveSchema(
  openapi: Record<string, unknown>,
  schema: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!schema || typeof schema !== "object") return null;
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const resolved = resolveRef(openapi, ref);
    return resolved ? resolveSchema(openapi, resolved) : null;
  }
  const oneOf = schema.oneOf as Record<string, unknown>[] | undefined;
  if (Array.isArray(oneOf) && oneOf.length)
    return resolveSchema(openapi, oneOf[0]);
  const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length)
    return resolveSchema(openapi, anyOf[0]);
  return schema;
}

function extractInputSchema(
  openapi: Record<string, unknown>
): Record<string, unknown> | null {
  const paths = openapi.paths as Record<string, unknown> | undefined;
  if (!paths) return null;
  for (const pathKey of Object.keys(paths)) {
    const methods = paths[pathKey] as Record<string, unknown> | undefined;
    const post = methods?.post as Record<string, unknown> | undefined;
    if (!post?.requestBody) continue;
    const content = (post.requestBody as Record<string, unknown>).content as
      | Record<string, unknown>
      | undefined;
    const json = content?.["application/json"] as
      | Record<string, unknown>
      | undefined;
    const schema = json?.schema as Record<string, unknown> | undefined;
    if (schema) return resolveSchema(openapi, schema);
  }
  return null;
}

function isQueueStatusSchema(schema: Record<string, unknown>): boolean {
  const title = String(schema.title ?? "").toLowerCase();
  if (title === "queuestatus") return true;
  const props = schema.properties as Record<string, unknown> | undefined;
  return Boolean(props && "status" in props && "request_id" in props);
}

function extractOutputSchema(
  openapi: Record<string, unknown>
): Record<string, unknown> | null {
  const paths = openapi.paths as Record<string, unknown> | undefined;
  if (!paths) return null;
  let candidate: Record<string, unknown> | null = null;
  for (const pathKey of Object.keys(paths)) {
    const methods = paths[pathKey] as Record<string, unknown> | undefined;
    const get = methods?.get as Record<string, unknown> | undefined;
    if (!get?.responses) continue;
    const responses = get.responses as Record<string, unknown>;
    const ok =
      responses["200"] ??
      (responses[200] as Record<string, unknown> | undefined);
    if (!ok?.content) continue;
    const content = ok.content as Record<string, unknown>;
    const json = content["application/json"] as
      | Record<string, unknown>
      | undefined;
    const schema = json?.schema as Record<string, unknown> | undefined;
    if (!schema) continue;
    const resolved = resolveSchema(openapi, schema);
    if (!resolved) continue;
    if (pathKey.endsWith("/requests/{request_id}")) return resolved;
    if (!isQueueStatusSchema(resolved)) candidate = resolved;
  }
  return candidate;
}

function defaultForProp(
  prop: Record<string, unknown>,
  required: boolean
): unknown {
  if (prop.default !== undefined) return prop.default;
  const type = prop.type as string | undefined;
  if (type === "string") return required ? "" : undefined;
  if (type === "integer" || type === "number") return required ? 0 : undefined;
  if (type === "boolean") return false;
  if (type === "array") return [];
  return undefined;
}

function inferOutputType(
  prop: Record<string, unknown>,
  name: string
): { type: string; type_args?: unknown[]; optional?: boolean } {
  const type = prop.type as string | undefined;
  const props = prop.properties as Record<string, unknown> | undefined;
  if (props && "url" in props) {
    const n = name.toLowerCase();
    if (n.includes("video") || n.includes("gif"))
      return { type: "video", optional: false };
    if (n.includes("audio") || n.includes("voice"))
      return { type: "audio", optional: false };
    if (n.includes("image") || n.includes("mask"))
      return { type: "image", optional: false };
    return { type: "any", optional: false };
  }
  if (type === "array") return { type: "list", type_args: [], optional: false };
  if (type === "boolean") return { type: "bool", optional: false };
  if (type === "integer") return { type: "int", optional: false };
  if (type === "number") return { type: "float", optional: false };
  if (type === "string") return { type: "str", optional: false };
  if (type === "object") return { type: "dict", optional: false };
  return { type: "any", optional: false };
}

/**
 * Resolve FAL dynamic schema via backend (uses base URL to avoid CORS).
 * Accepts pasted OpenAPI JSON, llms.txt, fal.ai URL, or endpoint id.
 *
 * @param modelInfo - Pasted OpenAPI JSON, llms.txt content, fal.ai URL, or endpoint id
 * @param apiBaseUrl - Backend base URL (e.g. from BASE_URL); use "" for same-origin
 */
export async function resolveFalSchemaClient(
  modelInfo: string,
  apiBaseUrl: string = ""
): Promise<ResolvedFalSchema> {
  const raw = (modelInfo ?? "").trim();
  if (!raw) {
    throw new Error(
      "Paste OpenAPI JSON, llms.txt, a fal.ai URL, or an endpoint id (e.g. fal-ai/.../model-name)"
    );
  }

  const base = apiBaseUrl || "";
  const url = `${base}/api/fal/resolve-dynamic-schema`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_info: raw })
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const json = JSON.parse(text) as { detail?: string };
      message = json.detail ?? text;
    } catch {
      // use text as-is
    }
    if (res.status === 501) {
      throw new Error(
        "FAL schema resolution requires the backend with nodetool-fal installed."
      );
    }
    if (res.status === 400) {
      throw new Error(message || "Invalid model_info");
    }
    throw new Error(
      message || `Failed to load schema: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as {
    endpoint_id?: string;
    dynamic_properties: Record<string, unknown>;
    dynamic_outputs: Record<
      string,
      { type: string; type_args?: unknown[]; optional?: boolean }
    >;
  };
  return {
    dynamic_properties: data.dynamic_properties ?? {},
    dynamic_outputs: data.dynamic_outputs ?? {},
    endpoint_id: data.endpoint_id
  };
}
