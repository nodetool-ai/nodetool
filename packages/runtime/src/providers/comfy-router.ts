/**
 * Comfy Router client: one `COMFY_API_KEY` reaches every partner model in the
 * Comfy Router catalog (https://docs.comfy.org/development/comfy-router).
 *
 * - Runs go through the queue (`POST /v2/models/{id}/requests`), poll the
 *   status route honouring `Retry-After`, and collect the native result.
 *   Aborting cancels the queued request.
 * - Every model takes its provider's own JSON body. Bodies are built from the
 *   model's published OpenAPI input schema (`/openapi.json`), setting only the
 *   fields the schema declares, the way `FalArgsBuilder` uses fal manifests.
 * - Results come back in each provider's native shape, so the media is found by
 *   walking the response for URLs and base64 payloads, or read as raw bytes
 *   when the response is not JSON.
 */

export const COMFY_ROUTER_BASE_URL = "https://api.comfy.org";

type Json = Record<string, unknown>;
type FetchFn = typeof fetch;

export type RouterMediaKind = "image" | "video" | "audio";

export class ComfyRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorType: string | null,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "ComfyRouterError";
  }
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** `{provider}/{model}` → URL path segments, each encoded. */
function modelPath(modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash <= 0 || slash === modelId.length - 1) {
    throw new Error(`Comfy Router model id must be "{provider}/{model}", got "${modelId}"`);
  }
  return `${encodeURIComponent(modelId.slice(0, slash))}/${encodeURIComponent(modelId.slice(slash + 1))}`;
}

// ── Input schema ────────────────────────────────────────────────────────────

export interface SchemaField {
  /** Leaf name, the key callers address the field by. */
  name: string;
  /** Where the field sits in the body: `["prompt"]` or `["input", "prompt"]`. */
  path: string[];
  type?: string;
  format?: string;
  enum?: unknown[];
  itemsType?: string;
  /** Item schema of an array field, when its items are objects. */
  items?: Json;
  required: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  contentEncoding?: string;
  description?: string;
}

/** The input fields a model declares, flattened one envelope level deep. */
export interface InputSchema {
  fields: Map<string, SchemaField>;
  /** `x-comfy-input-schema-authored: false`: the Router accepts any object. */
  open: boolean;
  /** `x-comfy-router-input-modalities`, when the schema publishes it. */
  inputModalities?: string[];
}

function resolveRef(doc: Json, node: unknown, depth = 0): Json | undefined {
  if (!isRecord(node) || depth > 8) return undefined;
  const ref = node.$ref;
  if (typeof ref === "string" && ref.startsWith("#/")) {
    let cur: unknown = doc;
    for (const part of ref.slice(2).split("/")) {
      cur = isRecord(cur) ? cur[part.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
    }
    const target = resolveRef(doc, cur, depth + 1);
    return target && node.default !== undefined ? { ...target, default: node.default } : target;
  }
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    const branches = node[key];
    if (Array.isArray(branches) && !node.type && !node.properties) {
      const concrete = branches
        .map((b) => resolveRef(doc, b, depth + 1))
        .filter((b): b is Json => b !== undefined && b.type !== "null");
      if (concrete.length === 0) continue;
      // `oneOf: [{const: "a"}, {const: "b"}]` is an enum.
      if (concrete.every((b) => "const" in b)) {
        return { ...node, type: "enum", enum: concrete.map((b) => b.const) };
      }
      if (key === "allOf") {
        return concrete.reduce<Json>(
          (acc, b) => ({
            ...acc,
            ...b,
            properties: { ...(acc.properties as Json | undefined), ...(b.properties as Json | undefined) },
            required: [
              ...((acc.required as string[] | undefined) ?? []),
              ...((b.required as string[] | undefined) ?? [])
            ]
          }),
          {}
        );
      }
      const first = concrete[0];
      return {
        ...first,
        description: node.description ?? first.description,
        default: node.default ?? first.default
      };
    }
  }
  if ("const" in node && !node.enum) return { ...node, enum: [node.const] };
  return node;
}

function toField(doc: Json, name: string, raw: unknown, path: string[], required: boolean): SchemaField {
  const prop = resolveRef(doc, raw) ?? {};
  const items = resolveRef(doc, prop.items);
  return {
    name,
    path,
    type: typeof prop.type === "string" ? prop.type : Array.isArray(prop.enum) ? "enum" : undefined,
    format: typeof prop.format === "string" ? prop.format : undefined,
    enum: Array.isArray(prop.enum) ? prop.enum : undefined,
    itemsType: typeof items?.type === "string" ? items.type : undefined,
    items: items && (items.type === "object" || isRecord(items.properties)) ? items : undefined,
    required,
    default: prop.default,
    minimum: typeof prop.minimum === "number" ? prop.minimum : undefined,
    maximum: typeof prop.maximum === "number" ? prop.maximum : undefined,
    contentEncoding: typeof prop.contentEncoding === "string" ? prop.contentEncoding : undefined,
    description: typeof prop.description === "string" ? prop.description : undefined
  };
}

/**
 * Read the request body schema out of a model's OpenAPI document. Object
 * properties (`input: {prompt, img_url}`, `parameters: {duration, seed}`)
 * are flattened one level so callers address leaves by name; a top-level
 * field wins a name clash.
 */
export function parseInputSchema(doc: unknown): InputSchema {
  const empty: InputSchema = { fields: new Map(), open: true };
  if (!isRecord(doc)) return empty;
  const paths = isRecord(doc.paths) ? doc.paths : {};
  let body: Json | undefined;
  for (const item of Object.values(paths)) {
    const post = isRecord(item) && isRecord(item.post) ? item.post : undefined;
    const content = post && isRecord(post.requestBody) ? post.requestBody.content : undefined;
    const json = isRecord(content) ? content["application/json"] : undefined;
    if (isRecord(json) && json.schema) {
      body = resolveRef(doc, json.schema);
      if (body) break;
    }
  }
  if (!body) return empty;
  const ext = (key: string): unknown => doc[key] ?? body?.[key];
  const authored = ext("x-comfy-input-schema-authored");
  const modalities = ext("x-comfy-router-input-modalities");
  const props = isRecord(body.properties) ? body.properties : {};
  const required = new Set(Array.isArray(body.required) ? (body.required as string[]) : []);
  const fields = new Map<string, SchemaField>();
  const nested: SchemaField[] = [];
  for (const [name, raw] of Object.entries(props)) {
    const prop = resolveRef(doc, raw) ?? {};
    if (isRecord(prop.properties) && Object.keys(prop.properties).length > 0) {
      const innerRequired = new Set(Array.isArray(prop.required) ? (prop.required as string[]) : []);
      for (const [leaf, leafRaw] of Object.entries(prop.properties)) {
        nested.push(toField(doc, leaf, leafRaw, [name, leaf], required.has(name) && innerRequired.has(leaf)));
      }
      continue;
    }
    fields.set(name, toField(doc, name, raw, [name], required.has(name)));
  }
  for (const field of nested) {
    if (!fields.has(field.name)) fields.set(field.name, field);
  }
  return {
    fields,
    open: authored === false && fields.size === 0,
    inputModalities: Array.isArray(modalities) ? modalities.map(String) : undefined
  };
}

// ── Request body builder ────────────────────────────────────────────────────

export interface MediaInput {
  bytes: Uint8Array;
  mimeType: string;
}

export function sniffMime(bytes: Uint8Array, fallback: string): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
  return fallback;
}

/** WAV from its RIFF/WAVE header, MP3 otherwise: the two the Router's audio inputs take. */
export function sniffAudioMime(bytes: Uint8Array): string {
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  return tag(0) === "RIFF" && tag(8) === "WAVE" ? "audio/wav" : "audio/mpeg";
}

export function dataUri(media: MediaInput): string {
  return `data:${media.mimeType};base64,${Buffer.from(media.bytes).toString("base64")}`;
}

/**
 * Sets fields only when the schema declares them (or the schema is open),
 * coercing numbers and enum values to the declared type, and writing nested
 * fields at their path.
 */
export class RouterArgsBuilder {
  readonly body: Json = {};

  constructor(readonly schema: InputSchema) {}

  has(name: string): boolean {
    return this.schema.open || this.schema.fields.has(name);
  }

  declares(name: string): boolean {
    return this.schema.fields.has(name);
  }

  field(name: string): SchemaField | undefined {
    return this.schema.fields.get(name);
  }

  firstDeclared(names: readonly string[]): string | undefined {
    return names.find((n) => this.schema.fields.has(n));
  }

  private pathOf(name: string): string[] {
    return this.schema.fields.get(name)?.path ?? [name];
  }

  isSet(name: string): boolean {
    let cur: unknown = this.body;
    for (const key of this.pathOf(name)) {
      if (!isRecord(cur) || !(key in cur)) return false;
      cur = cur[key];
    }
    return true;
  }

  /** The value written at a field's path, or undefined. */
  valueOf(name: string): unknown {
    let cur: unknown = this.body;
    for (const key of this.pathOf(name)) {
      if (!isRecord(cur)) return undefined;
      cur = cur[key];
    }
    return cur;
  }

  /** Write a value at a field's path without coercion. */
  put(name: string, value: unknown): this {
    const path = this.pathOf(name);
    let cur: Json = this.body;
    for (const key of path.slice(0, -1)) {
      if (!isRecord(cur[key])) cur[key] = {};
      cur = cur[key] as Json;
    }
    cur[path[path.length - 1]] = value;
    return this;
  }

  /** Remove a field the body carries, at its path. */
  unset(name: string): this {
    const path = this.pathOf(name);
    let cur: unknown = this.body;
    for (const key of path.slice(0, -1)) {
      if (!isRecord(cur)) return this;
      cur = cur[key];
    }
    if (isRecord(cur)) delete cur[path[path.length - 1]];
    return this;
  }

  set(name: string, value: unknown): this {
    if (value === undefined || value === null || value === "") return this;
    if (!this.has(name)) return this;
    const field = this.schema.fields.get(name);
    if (!field) return this.put(name, value);
    if (field.enum) {
      const hit = field.enum.find((e) => String(e) === String(value));
      return hit === undefined ? this : this.put(name, hit);
    }
    if (field.type === "integer" || field.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return this;
      return this.put(name, field.type === "integer" ? Math.round(n) : n);
    }
    if (field.type === "string" && typeof value === "number") return this.put(name, String(value));
    return this.put(name, value);
  }

  setFirst(names: readonly string[], value: unknown): this {
    const name = this.firstDeclared(names) ?? (this.schema.open ? names[0] : undefined);
    if (name) this.set(name, value);
    return this;
  }

  /**
   * Attach media to the first declared field in `names`. The Router has no
   * upload route, so media goes inline: base64 for fields that say so, a
   * data URI otherwise. Array fields get a list; an array of objects gets
   * `{url}` items (plus `type` when the item declares one).
   */
  attachMedia(names: readonly string[], media: MediaInput[], kind: "image" | "video" | "audio" = "image"): string | undefined {
    if (media.length === 0) return undefined;
    const name = this.firstDeclared(names) ?? (this.schema.open ? names[0] : undefined);
    if (!name) return undefined;
    const field = this.schema.fields.get(name);
    const raw =
      field?.contentEncoding === "base64" || field?.format === "byte" || /base64|b64/i.test(name);
    const encode = (m: MediaInput): string => (raw ? Buffer.from(m.bytes).toString("base64") : dataUri(m));
    if (field?.type === "array") {
      const itemProps = field.items && isRecord(field.items.properties) ? field.items.properties : null;
      if (itemProps) {
        const urlKey = ["url", "image_url", "uri", "data"].find((k) => k in itemProps) ?? "url";
        const typed = "type" in itemProps;
        this.put(
          name,
          media.map((m) => {
            const item: Record<string, string> = { [urlKey]: encode(m) };
            if (typed) item.type = kind;
            return item;
          })
        );
      } else {
        this.put(name, media.map(encode));
      }
    } else {
      this.put(name, encode(media[0]));
    }
    return name;
  }

  /**
   * Fill required fields the caller left unset: the schema default, else the
   * first enum value, else a random seed for a seed field.
   */
  fillRequiredDefaults(): this {
    for (const field of this.schema.fields.values()) {
      if (!field.required || this.isSet(field.name)) continue;
      if (field.default !== undefined) this.put(field.name, field.default);
      else if (field.enum && field.enum.length > 0) this.put(field.name, field.enum[0]);
      else if (/seed/i.test(field.name) && (field.type === "integer" || field.type === "number")) {
        const max = field.maximum ?? 2 ** 31 - 1;
        const min = field.minimum ?? 0;
        this.put(field.name, min + Math.floor(Math.random() * Math.max(1, max - min)));
      } else if (field.type === "boolean") this.put(field.name, false);
    }
    return this;
  }

  missingRequired(): string[] {
    return [...this.schema.fields.values()]
      .filter((f) => f.required && !this.isSet(f.name))
      .map((f) => f.path.join("."));
  }
}

// ── Output extraction ───────────────────────────────────────────────────────

const EXT_KIND: Array<[RegExp, RouterMediaKind]> = [
  [/\.(png|jpe?g|webp|gif|avif|bmp|tiff?)(\?|$)/i, "image"],
  [/\.(mp4|mov|webm|mkv|m4v)(\?|$)/i, "video"],
  [/\.(mp3|wav|ogg|flac|m4a|aac|opus)(\?|$)/i, "audio"]
];

interface MediaCandidate {
  kind: RouterMediaKind | null;
  url?: string;
  base64?: string;
  mimeType?: string;
  path: string;
}

function kindFromMime(mime: string | undefined): RouterMediaKind | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

function kindFromPath(path: string): RouterMediaKind | null {
  const p = path.toLowerCase();
  if (/video|mp4/.test(p)) return "video";
  if (/audio|speech|sound|music|voice/.test(p)) return "audio";
  if (/image|img|sample|picture|photo/.test(p)) return "image";
  return null;
}

/** Every URL or base64 payload in a native result, in document order. */
export function findMedia(result: unknown, path = ""): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  if (typeof result === "string") {
    if (/^https?:\/\//.test(result)) {
      const ext = EXT_KIND.find(([re]) => re.test(new URL(result).pathname));
      out.push({ kind: ext?.[1] ?? kindFromPath(path), url: result, path });
    } else if (result.startsWith("data:")) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(result);
      if (match?.[2]) out.push({ kind: kindFromMime(match[1]), base64: match[3], mimeType: match[1], path });
    } else if (result.length > 256 && /(b64|base64|bytes|data|audio|image|video)/i.test(path) && /^[A-Za-z0-9+/=\s]+$/.test(result.slice(0, 512))) {
      out.push({ kind: kindFromPath(path), base64: result, path });
    }
    return out;
  }
  if (Array.isArray(result)) {
    result.forEach((item, i) => out.push(...findMedia(item, `${path}[${i}]`)));
    return out;
  }
  if (isRecord(result)) {
    const mime =
      typeof result.mimeType === "string" ? result.mimeType
      : typeof result.mime_type === "string" ? result.mime_type
      : typeof result.content_type === "string" ? result.content_type
      : undefined;
    for (const [key, value] of Object.entries(result)) {
      for (const found of findMedia(value, path ? `${path}.${key}` : key)) {
        out.push(mime && !found.mimeType ? { ...found, mimeType: mime, kind: found.kind ?? kindFromMime(mime) } : found);
      }
    }
  }
  return out;
}

// ── Client ──────────────────────────────────────────────────────────────────

export interface RouterRunResult {
  bytes: Uint8Array;
  mimeType: string;
  requestId: string;
  creditsUsed: string | null;
}

export interface ComfyRouterClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchFn;
  /** Poll interval when the server sends no `Retry-After`. */
  pollMs?: number;
}

export class ComfyRouterClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;
  private readonly pollMs: number;
  private readonly schemas = new Map<string, Promise<InputSchema>>();

  constructor(private readonly options: ComfyRouterClientOptions) {
    this.baseUrl = (options.baseUrl ?? COMFY_ROUTER_BASE_URL).replace(/\/+$/, "");
    this.fetchFn = options.fetch ?? fetch;
    this.pollMs = options.pollMs ?? 2000;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "X-API-Key": this.options.apiKey, Accept: "application/json", ...extra };
  }

  private async fail(res: Response, what: string): Promise<never> {
    const requestId = res.headers.get("x-comfy-request-id");
    let errorType = res.headers.get("x-comfy-error-type");
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body: unknown = await res.json();
      if (isRecord(body)) {
        if (typeof body.error_type === "string") errorType = body.error_type;
        if (typeof body.detail === "string") detail = body.detail;
        else if (Array.isArray(body.detail)) {
          detail = body.detail
            .map((d) => (isRecord(d) ? `${Array.isArray(d.loc) ? d.loc.join(".") : "?"}: ${String(d.msg)}` : String(d)))
            .join("; ");
        }
        if (typeof body.upstream_detail === "string") detail += ` (${body.upstream_detail})`;
      }
    } catch {
      // Non-JSON error body: keep the status line.
    }
    const hint =
      errorType === "insufficient_credits" ? " Add credits at https://platform.comfy.org." : "";
    throw new ComfyRouterError(
      `Comfy Router ${what} failed (HTTP ${res.status}): ${detail}${errorType ? ` [${errorType}]` : ""}${requestId ? ` (request ${requestId})` : ""}.${hint}`,
      res.status,
      errorType,
      requestId
    );
  }

  /** One page of the live catalog. */
  async listModels(signal?: AbortSignal): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const url = new URL(`${this.baseUrl}/v2/models`);
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await this.fetchFn(url, { headers: this.headers(), signal });
      if (!res.ok) await this.fail(res, "model listing");
      const body: unknown = await res.json();
      if (!isRecord(body) || !Array.isArray(body.data)) break;
      for (const entry of body.data) {
        if (isRecord(entry) && typeof entry.id === "string") ids.push(entry.id);
      }
      if (body.has_more !== true || typeof body.next_cursor !== "string") break;
      cursor = body.next_cursor;
    }
    return ids;
  }

  /** The model's input schema, fetched once per process. */
  inputSchema(modelId: string, signal?: AbortSignal): Promise<InputSchema> {
    let pending = this.schemas.get(modelId);
    if (!pending) {
      pending = (async () => {
        const res = await this.fetchFn(`${this.baseUrl}/v2/models/${modelPath(modelId)}/openapi.json`, {
          headers: this.headers(),
          signal
        });
        if (!res.ok) await this.fail(res, `schema for ${modelId}`);
        return parseInputSchema(await res.json());
      })();
      pending.catch(() => this.schemas.delete(modelId));
      this.schemas.set(modelId, pending);
    }
    return pending;
  }

  /**
   * Queue a run and wait for it. Returns the finished result response.
   * Aborting `signal` cancels the queued request.
   */
  private async queue(
    modelId: string,
    body: Json,
    options: { signal?: AbortSignal; timeoutSeconds?: number | null }
  ): Promise<{ res: Response; requestId: string; signal: AbortSignal }> {
    const timeout = AbortSignal.timeout(Math.max(1, options.timeoutSeconds ?? 900) * 1000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const base = `${this.baseUrl}/v2/models/${modelPath(modelId)}/requests`;

    const submitted = await this.fetchFn(base, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }),
      body: JSON.stringify(body),
      signal
    });
    if (submitted.status === 403 && submitted.headers.get("x-comfy-error-type") === "not_enabled") {
      // The queue is not offered for this model or caller: use the
      // synchronous route, which holds the connection until the result.
      const sync = await this.fetchFn(`${this.baseUrl}/v2/models/${modelPath(modelId)}`, {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json", Accept: "*/*" }),
        body: JSON.stringify(body),
        signal
      });
      if (!sync.ok) await this.fail(sync, `${modelId} run`);
      return { res: sync, requestId: sync.headers.get("x-comfy-request-id") ?? "sync", signal };
    }
    if (!submitted.ok) await this.fail(submitted, `submit to ${modelId}`);
    const handle: unknown = await submitted.json();
    if (!isRecord(handle) || typeof handle.request_id !== "string") {
      throw new Error(`Comfy Router returned no request_id for ${modelId}`);
    }
    const requestId = handle.request_id;
    const own = `${base}/${encodeURIComponent(requestId)}`;
    const statusUrl = typeof handle.status_url === "string" ? handle.status_url : `${own}/status`;
    const responseUrl = typeof handle.response_url === "string" ? handle.response_url : own;
    const cancelUrl = typeof handle.cancel_url === "string" ? handle.cancel_url : `${own}/cancel`;

    const cancel = (): void => {
      void this.fetchFn(cancelUrl, { method: "PUT", headers: this.headers() }).catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      let status: Json = handle;
      while (status.status !== "COMPLETED") {
        const res = await this.fetchFn(statusUrl, { headers: this.headers(), signal });
        if (!res.ok) await this.fail(res, `status of ${requestId}`);
        status = (await res.json()) as Json;
        if (status.status === "COMPLETED") break;
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.pollMs, signal);
      }
      const res = await this.fetchFn(responseUrl, { headers: this.headers({ Accept: "*/*" }), signal });
      if (!res.ok) await this.fail(res, `${modelId} run ${requestId}`);
      if (typeof status.error_type === "string") {
        throw new ComfyRouterError(
          `Comfy Router ${modelId} run ${requestId} ended with ${status.error_type}`,
          res.status,
          status.error_type,
          requestId
        );
      }
      return { res, requestId, signal };
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }

  /** Queue a run and return its native JSON result. */
  async runJson(
    modelId: string,
    body: Json,
    options: { signal?: AbortSignal; timeoutSeconds?: number | null } = {}
  ): Promise<unknown> {
    const { res } = await this.queue(modelId, body, options);
    return res.json();
  }

  /** Queue a run and return the first media of `kind` in its result. */
  async run(
    modelId: string,
    body: Json,
    kind: RouterMediaKind,
    options: { signal?: AbortSignal; timeoutSeconds?: number | null } = {}
  ): Promise<RouterRunResult> {
    const { res, requestId, signal } = await this.queue(modelId, body, options);
    const creditsUsed = res.headers.get("x-comfy-credits-used");
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        mimeType: contentType.split(";")[0] || `${kind}/*`,
        requestId,
        creditsUsed
      };
    }
    const result: unknown = await res.json();
    const media = await this.pickMedia(result, kind, signal);
    if (!media) {
      throw new Error(
        `Comfy Router ${modelId} run ${requestId} finished but returned no ${kind}: ${JSON.stringify(result).slice(0, 400)}`
      );
    }
    return { ...media, requestId, creditsUsed };
  }

  private async pickMedia(
    result: unknown,
    kind: RouterMediaKind,
    signal: AbortSignal
  ): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const all = findMedia(result);
    // Field names can mislabel media (an mp4 under an `image` key), so other
    // kinds are tried last and kept only when the bytes say they match.
    const ordered = [
      ...all.filter((m) => m.kind === kind),
      ...all.filter((m) => m.kind === null),
      ...all.filter((m) => m.kind !== null && m.kind !== kind)
    ];
    for (const candidate of ordered) {
      if (candidate.base64) {
        const bytes = new Uint8Array(Buffer.from(candidate.base64, "base64"));
        const mimeType = candidate.mimeType ?? sniffMime(bytes, `${kind}/*`);
        if (candidate.kind !== null && candidate.kind !== kind && kindFromMime(sniffMime(bytes, mimeType)) !== kind) continue;
        return { bytes, mimeType };
      }
      if (candidate.url) {
        // Output URLs may be on the provider's host: never send the key there.
        const res = await this.fetchFn(candidate.url, { signal });
        if (!res.ok) continue;
        const mimeType = (res.headers.get("content-type") ?? "").split(";")[0];
        if (mimeType && kindFromMime(mimeType) !== kind && candidate.kind !== kind) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { bytes, mimeType: mimeType || sniffMime(bytes, `${kind}/*`) };
      }
    }
    return null;
  }
}
