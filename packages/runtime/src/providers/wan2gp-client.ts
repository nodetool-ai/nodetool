/**
 * Client for a Wan2GP server the user runs themselves.
 *
 * Wan2GP serves MCP over streamable HTTP at `/mcp` and serves one-use media
 * transfer routes under `/wangp_api/` on the same origin. This client speaks
 * both. It never runs Wan2GP: the network boundary is the license boundary,
 * because WanGP's license forbids embedding it in a paid product.
 *
 * It needs MCP API v2 or later, where jobs and transfers sit behind the
 * `wangp_session` tool. The tool shapes are recorded in the nodetool-wan2gp
 * repository's docs/wan2gp-contract.md.
 */

import { withSpan } from "../tracing-helpers.js";

export const WAN2GP_DEFAULT_SERVER_URL = "http://127.0.0.1:7866/mcp";
/** Safe default for one media transfer. Callers may raise it up to the ceiling. */
export const WAN2GP_DEFAULT_MAX_MEDIA_BYTES = 512 * 1024 ** 2;
/** Absolute upper bound for one media transfer. */
export const WAN2GP_MAX_MEDIA_BYTES = 8 * 1024 ** 3;
/** Cancellation is best effort and must never hold up shutdown. */
export const WAN2GP_CANCEL_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2025-06-18";

// Extensions Wan2GP's gallery accepts, from shared/mcp_server.py.
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".aac", ".m4a", ".flac", ".ogg", ".opus"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi"]);

export type Wan2GPRecord = Record<string, unknown>;

export interface Wan2GPProgress {
  phase?: string;
  status?: string;
  progress?: number;
  current_step?: number | null;
  total_steps?: number | null;
  [key: string]: unknown;
}

export interface Wan2GPGalleryItem {
  media_id: string;
  media_type: string;
  filename?: string;
}

/** A Wan2GP server rejected a call, or reported a failed generation. */
export class Wan2GPError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "Wan2GPError";
  }
}

/** The overall deadline for a generation elapsed while polling. */
export class Wan2GPTimeoutError extends Wan2GPError {
  constructor(message: string) {
    super(message);
    this.name = "Wan2GPTimeoutError";
  }
}

function isRecord(value: unknown): value is Wan2GPRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot).toLowerCase() : "";
}

/** Return `image`, `video` or `audio` for a filename Wan2GP's gallery accepts. */
export function wan2gpMediaTypeFor(filename: string): "image" | "video" | "audio" {
  const suffix = extensionOf(filename);
  if (IMAGE_EXTENSIONS.has(suffix)) return "image";
  if (VIDEO_EXTENSIONS.has(suffix)) return "video";
  if (AUDIO_EXTENSIONS.has(suffix)) return "audio";
  throw new Wan2GPError(
    `Wan2GP does not accept the file extension ${suffix || "(none)"} for gallery uploads.`
  );
}

/** Return the origin a server URL's relative transfer URLs resolve against. */
export function wan2gpOrigin(serverUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new Wan2GPError("The Wan2GP server URL must be an http or https URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Wan2GPError("The Wan2GP server URL must be an http or https URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Wan2GPError("The Wan2GP server URL must not carry credentials.");
  }
  return parsed.origin;
}

function ticketLimit(ticket: Wan2GPRecord, hardLimit: number): number {
  let limit = hardLimit;
  for (const key of ["max_bytes", "size", "size_bytes"]) {
    const value = ticket[key];
    if (value === undefined || value === null) continue;
    const advertised = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(advertised)) {
      throw new Wan2GPError(`Wan2GP returned an invalid transfer ticket ${key}.`);
    }
    if (advertised < 0) {
      throw new Wan2GPError(`Wan2GP returned a negative transfer ticket ${key}.`);
    }
    limit = Math.min(limit, advertised);
  }
  return limit;
}

/**
 * Validate a one-use transfer ticket and return the URL it names on the
 * server's own origin, with the byte limit it allows.
 *
 * A ticket comes from the server's response, so it is checked before any
 * request: it must be a relative URL under a transfer route, with no `..`
 * segment, that resolves to the origin the client was given.
 */
export function wan2gpTransferUrl(
  origin: string,
  ticket: unknown,
  key: "upload_url" | "download_url",
  method: "PUT" | "GET",
  hardLimit: number
): { url: URL; limit: number } {
  if (!isRecord(ticket)) {
    throw new Wan2GPError("Wan2GP returned an invalid media transfer ticket.");
  }
  if ((ticket.method ?? method) !== method) {
    throw new Wan2GPError(
      `Wan2GP media ticket requires an unexpected HTTP method (expected ${method}).`
    );
  }
  const raw = ticket[key];
  if (
    typeof raw !== "string" ||
    !raw ||
    raw.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw)
  ) {
    throw new Wan2GPError("Wan2GP media transfer tickets must contain a relative URL.");
  }
  const rawPath = raw.split(/[?#]/, 1)[0];
  if (raw.includes("\\") || rawPath.split("/").includes("..")) {
    throw new Wan2GPError("Wan2GP media transfer ticket contains an unsafe path.");
  }
  // API v2.1 serves downloads from /files/ and uploads from either route.
  const direction = method === "PUT" ? "upload" : "download";
  const prefixes = [`/wangp_api/gallery/${direction}/`, `/wangp_api/files/${direction}/`];
  const relativePath = `/${rawPath.replace(/^\/+/, "")}`;
  if (!prefixes.some((prefix) => relativePath.startsWith(prefix))) {
    throw new Wan2GPError("Wan2GP returned a media ticket outside its transfer routes.");
  }
  const url = new URL(raw.startsWith("/") ? raw : `/${raw}`, origin);
  if (url.origin !== origin) {
    throw new Wan2GPError("Wan2GP media transfer ticket points to a different origin.");
  }
  if (
    !prefixes.some((prefix) => url.pathname.startsWith(prefix)) ||
    prefixes.includes(url.pathname)
  ) {
    throw new Wan2GPError("Wan2GP returned a media ticket outside its transfer routes.");
  }
  return { url, limit: ticketLimit(ticket, hardLimit) };
}

function textPayload(result: Wan2GPRecord): string | null {
  const content = Array.isArray(result.content) ? result.content : [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return null;
}

/**
 * Turn an MCP CallToolResult into the value the Wan2GP tool returned.
 *
 * FastMCP puts a dict return value in `structuredContent` verbatim and any
 * other return value under a `result` key there. Both also arrive as JSON
 * text, which is the fallback when a server omits structured content.
 */
export function parseWan2GPToolResult(result: unknown, toolName: string): unknown {
  if (!isRecord(result)) {
    throw new Wan2GPError(`Wan2GP tool ${toolName} returned an invalid result.`);
  }
  if (result.isError === true) {
    const text = textPayload(result)?.trim();
    throw new Wan2GPError(text || `Wan2GP tool ${toolName} failed without a message.`);
  }
  const structured = result.structuredContent;
  if (isRecord(structured)) {
    const keys = Object.keys(structured);
    return keys.length === 1 && keys[0] === "result" ? structured.result : structured;
  }
  const text = textPayload(result);
  if (text === null) {
    throw new Wan2GPError(`Wan2GP tool ${toolName} returned no content.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Wan2GPError(
      `Wan2GP tool ${toolName} returned content that is not JSON: ${text.slice(0, 200)}`,
      { cause: error }
    );
  }
}

/** Return a job snapshot's latest progress. API v2.1 carries it beside the job. */
export function wan2gpProgressFromJob(job: Wan2GPRecord): Wan2GPProgress | null {
  if (isRecord(job.progress)) return job.progress as Wan2GPProgress;
  const events = Array.isArray(job.events) ? job.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (isRecord(event) && event.kind === "progress" && isRecord(event.data)) {
      return event.data as Wan2GPProgress;
    }
  }
  return null;
}

/** Join the errors of a finished job into one message. */
export function wan2gpJobErrorMessage(job: Wan2GPRecord): string {
  const result = isRecord(job.result) ? job.result : {};
  const errors = Array.isArray(result.errors) ? result.errors : [];
  const parts = errors.filter(isRecord).map((error) => {
    const message = String(error.message ?? "").trim();
    const stage = String(error.stage ?? "").trim();
    return stage ? `${message} (stage: ${stage})` : message;
  });
  if (parts.length === 0) {
    return result.cancelled === true
      ? "The Wan2GP generation was cancelled."
      : "Wan2GP reported a failed generation without an error message.";
  }
  return parts.join("; ");
}

/**
 * Return the first gallery item of a finished job, or throw the job's error.
 * A result with files but no gallery item is a text result, such as a
 * transcript, which has no media to return.
 */
export function wan2gpFirstGalleryItem(job: Wan2GPRecord): Wan2GPGalleryItem {
  const result = isRecord(job.result) ? job.result : {};
  if (result.success !== true) {
    throw new Wan2GPError(wan2gpJobErrorMessage(job));
  }
  const items = (Array.isArray(result.gallery_items) ? result.gallery_items : []).filter(isRecord);
  if (items.length === 0) {
    const files = (Array.isArray(result.generated_files) ? result.generated_files : [])
      .map((file) => String(file).split(/[\\/]/).pop() ?? "")
      .filter(Boolean);
    if (files.length > 0) {
      throw new Wan2GPError(
        `Wan2GP finished the generation but put no media in its gallery, only ${files.join(", ")}. ` +
          "Text results such as transcripts cannot be returned."
      );
    }
    throw new Wan2GPError("Wan2GP finished the generation but put no media in its gallery.");
  }
  const item = items[0];
  const mediaId = String(item.media_id ?? "").trim();
  if (!mediaId) {
    throw new Wan2GPError("Wan2GP returned a gallery item without a media_id.");
  }
  return {
    media_id: mediaId,
    media_type: String(item.media_type ?? "").trim().toLowerCase(),
    filename: typeof item.filename === "string" ? item.filename : undefined
  };
}

interface JsonRpcResponse {
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** Read one JSON-RPC response from a streamable-HTTP response body. */
async function readRpcResponse(response: Response, id: number): Promise<JsonRpcResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as unknown;
    const messages = Array.isArray(body) ? body : [body];
    const match = messages.find((message) => isRecord(message) && message.id === id);
    if (!match) throw new Wan2GPError("The Wan2GP MCP server sent no response to a request.");
    return match as JsonRpcResponse;
  }
  if (!contentType.includes("text/event-stream") || !response.body) {
    throw new Wan2GPError(
      `The Wan2GP MCP server answered with an unexpected content type: ${contentType || "(none)"}.`
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let message: unknown;
        try {
          message = JSON.parse(data);
        } catch {
          continue;
        }
        if (isRecord(message) && message.id === id && ("result" in message || "error" in message)) {
          return message as JsonRpcResponse;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  throw new Wan2GPError("The Wan2GP MCP server closed the stream without a response.");
}

export interface Wan2GPClientOptions {
  /** Largest media transfer in bytes. Defaults to 512 MiB, at most 8 GiB. */
  maxTransferBytes?: number;
  /** Aborts every request this client makes. */
  signal?: AbortSignal;
}

export interface Wan2GPPollOptions {
  onProgress?: (progress: Wan2GPProgress) => void;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One MCP session against one Wan2GP server. Create it with {@link Wan2GPClient.connect}. */
export class Wan2GPClient {
  readonly serverUrl: string;
  readonly origin: string;
  readonly maxTransferBytes: number;
  private readonly signal?: AbortSignal;
  private sessionId: string | null = null;
  private protocolVersion: string | null = null;
  private nextId = 1;

  private constructor(serverUrl: string, options: Wan2GPClientOptions) {
    this.serverUrl = serverUrl;
    this.origin = wan2gpOrigin(serverUrl);
    const max = options.maxTransferBytes ?? WAN2GP_DEFAULT_MAX_MEDIA_BYTES;
    if (!Number.isInteger(max) || max < 1 || max > WAN2GP_MAX_MEDIA_BYTES) {
      throw new Wan2GPError(
        `The media transfer limit must be between 1 and ${WAN2GP_MAX_MEDIA_BYTES} bytes.`
      );
    }
    this.maxTransferBytes = max;
    this.signal = options.signal;
  }

  /** Open an MCP session and check that the server speaks API v2 or later. */
  static async connect(
    serverUrl: string = WAN2GP_DEFAULT_SERVER_URL,
    options: Wan2GPClientOptions = {}
  ): Promise<Wan2GPClient> {
    const client = new Wan2GPClient(serverUrl, options);
    const init = await client.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "nodetool", version: "1" }
    });
    client.protocolVersion =
      isRecord(init) && typeof init.protocolVersion === "string"
        ? init.protocolVersion
        : PROTOCOL_VERSION;
    await client.notify("notifications/initialized");
    const listing = await client.rpc("tools/list", {});
    const tools = isRecord(listing) && Array.isArray(listing.tools) ? listing.tools : [];
    if (!tools.some((tool) => isRecord(tool) && tool.name === "wangp_session")) {
      await client.close();
      throw new Wan2GPError(
        "This Wan2GP server speaks MCP API v1. Update Wan2GP to a release whose MCP server has the wangp_session tool."
      );
    }
    return client;
  }

  private requestSignal(timeoutMs: number, extra?: AbortSignal): AbortSignal {
    const signals = [AbortSignal.timeout(timeoutMs)];
    if (this.signal) signals.push(this.signal);
    if (extra) signals.push(extra);
    return AbortSignal.any(signals);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    if (this.protocolVersion) headers["Mcp-Protocol-Version"] = this.protocolVersion;
    return headers;
  }

  private async post(body: Wan2GPRecord, signal: AbortSignal): Promise<Response> {
    const endpoint = this.serverUrl;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        redirect: "error",
        signal
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Wan2GPError(
        `Could not reach the Wan2GP server at ${this.serverUrl}. Start it with --mcp --mcp-async, or check the URL.`,
        { cause: error }
      );
    }
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!response.ok && response.status !== 202) {
      const detail = (await response.text()).slice(0, 500);
      throw new Wan2GPError(
        `The Wan2GP MCP server returned HTTP ${response.status}${detail ? `: ${detail}` : ""}.`
      );
    }
    return response;
  }

  private async rpc(method: string, params: Wan2GPRecord, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    return withSpan("wan2gp.rpc", { "rpc.system": "jsonrpc", "rpc.method": method }, async () => {
      const response = await this.post(
        { jsonrpc: "2.0", id, method, params },
        this.requestSignal(REQUEST_TIMEOUT_MS, signal)
      );
      const message = await readRpcResponse(response, id);
      if (message.error) {
        throw new Wan2GPError(
          `The Wan2GP MCP server rejected ${method}: ${message.error.message ?? "unknown error"}.`
        );
      }
      return message.result;
    });
  }

  private async notify(method: string): Promise<void> {
    const response = await this.post(
      { jsonrpc: "2.0", method },
      this.requestSignal(REQUEST_TIMEOUT_MS)
    );
    await response.body?.cancel();
  }

  /** End the MCP session. Best effort: a server that keeps no sessions ignores it. */
  async close(): Promise<void> {
    if (!this.sessionId) return;
    const endpoint = this.serverUrl;
    const headers = this.headers();
    this.sessionId = null;
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(WAN2GP_CANCEL_TIMEOUT_MS)
      });
      await response.body?.cancel();
    } catch {
      // The session expires on the server either way.
    }
  }

  /** Call one MCP tool and return its parsed return value. */
  async callTool(name: string, args: Wan2GPRecord = {}, signal?: AbortSignal): Promise<unknown> {
    const result = await this.rpc("tools/call", { name, arguments: args }, signal);
    return parseWan2GPToolResult(result, name);
  }

  private async session(action: string, args: Wan2GPRecord, signal?: AbortSignal): Promise<unknown> {
    return this.callTool("wangp_session", { action, arguments: args }, signal);
  }

  private async record(promise: Promise<unknown>, what: string): Promise<Wan2GPRecord> {
    const value = await promise;
    if (!isRecord(value)) throw new Wan2GPError(`Wan2GP returned an invalid ${what}.`);
    return value;
  }

  /** Search the model registry and return one page. Pages with `next_cursor`. */
  async listModels(
    query = "",
    filters: Wan2GPRecord = {},
    limit = 10,
    cursor?: string
  ): Promise<Wan2GPRecord> {
    const args: Wan2GPRecord = { query, limit };
    if (Object.keys(filters).length > 0) args.filters = filters;
    if (cursor) args.cursor = cursor;
    return this.record(
      this.callTool("wangp_models", { action: "search", arguments: args }),
      "model search page"
    );
  }

  /**
   * Return up to `limit` models with their outputs, inputs and media roles.
   * A search without a query returns compact rows, which are filled from
   * each model's capabilities.
   */
  async searchAllModels(query = "", filters: Wan2GPRecord = {}, limit = 500): Promise<Wan2GPRecord[]> {
    const rows: Wan2GPRecord[] = [];
    let cursor: string | undefined;
    while (rows.length < limit) {
      const page = await this.listModels(query, filters, Math.min(limit - rows.length, 100), cursor);
      for (const model of Array.isArray(page.models) ? page.models : []) {
        if (!isRecord(model)) continue;
        rows.push(
          "media_inputs" in model
            ? model
            : await this.getModelCapabilities(String(model.model_type ?? ""))
        );
      }
      cursor = typeof page.next_cursor === "string" ? page.next_cursor : undefined;
      if (page.has_more !== true || !cursor) break;
    }
    return rows.slice(0, limit);
  }

  /** Return one model's metadata: outputs, inputs, media roles and capabilities. */
  async getModelCapabilities(modelType: string): Promise<Wan2GPRecord> {
    const result = await this.callTool("wangp_model", { model_type: modelType, action: "capabilities" });
    const metadata = isRecord(result) ? result.metadata : undefined;
    if (!isRecord(metadata)) {
      throw new Wan2GPError(`Wan2GP returned no capabilities for ${modelType}.`);
    }
    return metadata;
  }

  /** Return one model's pristine generation defaults. */
  async getModelDefaults(modelType: string): Promise<Wan2GPRecord> {
    return this.record(
      this.callTool("wangp_model", { model_type: modelType, action: "defaults", arguments: {} }),
      `defaults for ${modelType}`
    );
  }

  private async put(url: URL, data: Uint8Array, filename: string): Promise<Wan2GPRecord> {
    return withSpan("wan2gp.upload", { "http.request.method": "PUT" }, async () => {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([new Uint8Array(data)]),
        redirect: "error",
        signal: this.requestSignal(REQUEST_TIMEOUT_MS * 10)
      });
      if (!response.ok) {
        throw new Wan2GPError(
          `Wan2GP rejected the upload of ${filename}: ${response.status} ${(await response.text()).slice(0, 200)}`
        );
      }
      const record = (await response.json()) as unknown;
      if (!isRecord(record)) throw new Wan2GPError(`Wan2GP returned an invalid upload record for ${filename}.`);
      return record;
    });
  }

  /**
   * Upload media to the gallery and return its `media_id`, which
   * `image_start`, `video_guide` and the other media settings accept. The
   * server refuses local paths unless started with
   * `--mcp-allow-read-file-system`, so this client never sends one.
   */
  async uploadMedia(filename: string, data: Uint8Array): Promise<string> {
    wan2gpMediaTypeFor(filename);
    const ticket = await this.session("create_gallery_upload", { filename });
    const { url, limit } = wan2gpTransferUrl(this.origin, ticket, "upload_url", "PUT", this.maxTransferBytes);
    if (data.byteLength > limit) {
      throw new Wan2GPError(`Upload of ${filename} exceeds the ${limit} byte transfer limit.`);
    }
    const record = await this.put(url, data, filename);
    const mediaId = String(record.media_id ?? "").trim();
    if (!mediaId) throw new Wan2GPError(`Wan2GP accepted the upload of ${filename} but returned no media_id.`);
    return mediaId;
  }

  /**
   * Upload a model's extra input file, such as a Wan-Move trajectory (.npy)
   * or a YuE score (.abc), to the server workspace and return the path it
   * issued, for example `@documents/uploads/<id>/trajectory.npy`.
   * `custom_guide` accepts that path.
   */
  async uploadFile(filename: string, data: Uint8Array): Promise<string> {
    if (!filename || /[\\/]/.test(filename) || !extensionOf(filename)) {
      throw new Wan2GPError(`Invalid upload file name: ${JSON.stringify(filename)}.`);
    }
    const ticket = await this.session("create_file_upload", { filename, size_bytes: data.byteLength });
    const { url, limit } = wan2gpTransferUrl(this.origin, ticket, "upload_url", "PUT", this.maxTransferBytes);
    if (data.byteLength > limit) {
      throw new Wan2GPError(`Upload of ${filename} exceeds the ${limit} byte transfer limit.`);
    }
    const record = await this.put(url, data, filename);
    const path = String(record.path ?? "").trim();
    if (record.status !== "done" || !path) {
      throw new Wan2GPError(`Wan2GP did not finish the upload of ${filename}.`);
    }
    return path;
  }

  /** Download one gallery item and return its bytes, within the transfer limit. */
  async downloadMedia(mediaId: string): Promise<Uint8Array> {
    const ticket = await this.session("create_gallery_download", { media_id: mediaId });
    const { url, limit } = wan2gpTransferUrl(this.origin, ticket, "download_url", "GET", this.maxTransferBytes);
    return withSpan("wan2gp.download", { "http.request.method": "GET" }, async () => {
      const response = await fetch(url, {
        method: "GET",
        redirect: "error",
        signal: this.requestSignal(REQUEST_TIMEOUT_MS * 20)
      });
      if (!response.ok) {
        throw new Wan2GPError(
          `Wan2GP rejected the download of ${mediaId}: ${response.status} ${(await response.text()).slice(0, 200)}`
        );
      }
      const header = response.headers.get("content-length");
      if (header !== null) {
        const length = Number(header);
        if (!Number.isInteger(length) || length < 0) {
          throw new Wan2GPError("Wan2GP returned an invalid Content-Length header.");
        }
        if (length > limit) {
          await response.body?.cancel();
          throw new Wan2GPError(`Download of ${mediaId} exceeds the ${limit} byte transfer limit.`);
        }
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw new Wan2GPError(`Download of ${mediaId} exceeds the ${limit} byte transfer limit.`);
          }
          chunks.push(value);
        }
      }
      return new Uint8Array(Buffer.concat(chunks, size));
    });
  }

  /** Start a generation from a settings dict and return its `job_id`. */
  async submit(settings: Wan2GPRecord): Promise<string> {
    let job: unknown;
    try {
      job = await this.callTool("wangp_generate", { settings, wait: false });
    } catch (error) {
      if (error instanceof Wan2GPError && error.message.includes("asynchronous execution is disabled")) {
        throw new Wan2GPError(
          "This Wan2GP server has asynchronous jobs turned off. Restart it with --mcp-async.",
          { cause: error }
        );
      }
      throw error;
    }
    const jobId = isRecord(job) ? String(job.job_id ?? "").trim() : "";
    if (!jobId) throw new Wan2GPError("Wan2GP accepted the generation but returned no job_id.");
    return jobId;
  }

  /** Poll one job once and return its snapshot. */
  async getJob(jobId: string, signal?: AbortSignal): Promise<Wan2GPRecord> {
    return this.record(this.session("get_job", { job_id: jobId }, signal), "job snapshot");
  }

  /** Ask Wan2GP to cancel a job. Cancellation is cooperative and never throws. */
  async cancel(jobId: string): Promise<void> {
    try {
      const id = this.nextId++;
      const response = await this.post(
        {
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "wangp_session", arguments: { action: "cancel_job", arguments: { job_id: jobId } } }
        },
        AbortSignal.timeout(WAN2GP_CANCEL_TIMEOUT_MS)
      );
      await readRpcResponse(response, id);
    } catch {
      // Best effort: the server may already be gone.
    }
  }

  /**
   * Poll a job until it finishes and return its final snapshot. Each new
   * progress payload goes to `onProgress`. A timeout, an abort or a failed
   * poll cancels the remote job before the error propagates.
   */
  async pollUntilDone(jobId: string, options: Wan2GPPollOptions = {}): Promise<Wan2GPRecord> {
    const interval = options.intervalMs ?? 1_000;
    const deadline = options.timeoutMs === undefined ? null : Date.now() + options.timeoutMs;
    let last = "";
    try {
      while (true) {
        options.signal?.throwIfAborted();
        if (deadline !== null && Date.now() >= deadline) {
          throw new Wan2GPTimeoutError(
            `Wan2GP job ${jobId} did not finish within ${Math.round((options.timeoutMs ?? 0) / 1000)} seconds.`
          );
        }
        const job = await this.getJob(jobId, options.signal);
        const progress = wan2gpProgressFromJob(job);
        const key = progress ? JSON.stringify(progress) : "";
        if (progress && key !== last) {
          last = key;
          options.onProgress?.(progress);
        }
        if (job.done === true) return job;
        const wait = deadline === null ? interval : Math.min(interval, Math.max(0, deadline - Date.now()));
        await new Promise<void>((resolve, reject) => {
          const signal = options.signal;
          const onAbort = (): void => {
            clearTimeout(timer);
            reject(signal?.reason);
          };
          const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          }, wait);
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      }
    } catch (error) {
      await this.cancel(jobId);
      throw error;
    }
  }

  /** Download a finished job's first gallery item, checking its media type. */
  async downloadFirstOutput(
    job: Wan2GPRecord,
    expected?: readonly string[]
  ): Promise<{ item: Wan2GPGalleryItem; data: Uint8Array }> {
    const item = wan2gpFirstGalleryItem(job);
    if (item.media_type === "world") {
      throw new Wan2GPError(
        "Wan2GP returned an interactive world (.wgpworld), which NodeTool has no asset type for. Pick a model whose main output is an image, video, audio or 3D model."
      );
    }
    if (expected && !expected.includes(item.media_type)) {
      throw new Wan2GPError(
        `Wan2GP returned ${item.media_type || "unknown"} output, but this call needs ${expected.join(" or ")}.`
      );
    }
    return { item, data: await this.downloadMedia(item.media_id) };
  }
}

// Leading bytes that identify the containers Wan2GP's gallery accepts. The
// server picks a media type from the filename extension alone, so the
// extension has to match the bytes.
function startsWith(data: Uint8Array, signature: number[] | string, offset = 0): boolean {
  const bytes = typeof signature === "string" ? [...signature].map((c) => c.charCodeAt(0)) : signature;
  if (data.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => data[offset + index] === byte);
}

/** Return an upload filename whose extension matches the image bytes. */
export function wan2gpImageFilename(data: Uint8Array): string {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47])) return "image.png";
  if (startsWith(data, [0xff, 0xd8, 0xff])) return "image.jpg";
  if (startsWith(data, "GIF8")) return "image.gif";
  if (startsWith(data, "BM")) return "image.bmp";
  if (startsWith(data, "RIFF") && startsWith(data, "WEBP", 8)) return "image.webp";
  if (startsWith(data, [0x49, 0x49, 0x2a, 0x00]) || startsWith(data, [0x4d, 0x4d, 0x00, 0x2a])) return "image.tif";
  return "image.png";
}

/** Return an upload filename whose extension matches the video bytes. */
export function wan2gpVideoFilename(data: Uint8Array): string {
  if (startsWith(data, "ftyp", 4)) return startsWith(data, "qt  ", 8) ? "video.mov" : "video.mp4";
  if (startsWith(data, [0x1a, 0x45, 0xdf, 0xa3])) return "video.webm";
  if (startsWith(data, "RIFF") && startsWith(data, "AVI ", 8)) return "video.avi";
  return "video.mp4";
}

/** Return an upload filename whose extension matches the audio bytes. */
export function wan2gpAudioFilename(data: Uint8Array): string {
  if (startsWith(data, "RIFF") && startsWith(data, "WAVE", 8)) return "audio.wav";
  if (startsWith(data, "fLaC")) return "audio.flac";
  if (startsWith(data, "OggS")) {
    const head = Buffer.from(data.subarray(0, 64)).toString("latin1");
    return head.includes("OpusHead") ? "audio.opus" : "audio.ogg";
  }
  if (startsWith(data, "ftyp", 4)) return "audio.m4a";
  if (startsWith(data, "ID3") || startsWith(data, [0xff, 0xfb]) || startsWith(data, [0xff, 0xf3]) || startsWith(data, [0xff, 0xf2])) {
    return "audio.mp3";
  }
  if (startsWith(data, [0xff, 0xf1]) || startsWith(data, [0xff, 0xf9])) return "audio.aac";
  return "audio.wav";
}
