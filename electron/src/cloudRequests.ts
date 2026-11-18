/**
 * The cloud requests and transfer calls of the desktop app's renderer
 * (technical design, "Cloud documents, sharing and transfer in the desktop
 * app"; WP1.14).
 *
 * The renderer never holds a token. It names a method, a path on the
 * signed-in server, its headers and its body. This module checks them
 * against the list of routes, keeps the headers and the body, and asks the
 * account helper for a `request`. The helper applies the request rule of the
 * native account library and answers with `http` messages that carry the
 * `Authorization` header only. This module sends each one with the kept
 * headers and body, keeps the response, and gives the helper the status, so
 * the helper can renew the token on a 401 and ask again. When the helper
 * answers `response`, the renderer gets the kept response.
 *
 * A transfer call goes to the desktop app's own local server. The helper adds
 * the account and the access token to the input. This module sends that call
 * only to the loopback origin of the local server this app runs, with the
 * local client token.
 *
 * Every pending request ends with SIGNED_OUT when the account signs out, and
 * with OFFLINE when the helper stops.
 */
import { LOCAL_CLIENT_TOKEN_HEADER } from "./localClientToken";
import type {
  CloudMethod,
  CloudRequestError,
  CloudRequestInput,
  CloudResponse,
  TransferResult,
  TransferStatus,
} from "./types.d";

/** Upper bound on a request body the renderer sends. */
export const MAX_CLOUD_REQUEST_BYTES = 32 * 1024 * 1024;
/** Upper bound on a response body the renderer receives. */
export const MAX_CLOUD_RESPONSE_BYTES = 64 * 1024 * 1024;
/** The helper reads lines up to 1 MB, so a transfer answer stays below it. */
export const MAX_TRANSFER_RESPONSE_BYTES = 900 * 1024;
/** How long a cloud request may take, the helper's renewal included. */
export const CLOUD_REQUEST_TIMEOUT_MS = 60_000;
/** How long a transfer call may take. A run sends files and gets 30 minutes in the native apps. */
export const TRANSFER_TIMEOUT_MS = 31 * 60_000;
/** Requests in flight at once. The helper queues 256. */
export const MAX_PENDING = 128;

export type {
  CloudMethod,
  CloudRequestError,
  CloudRequestInput,
  CloudResponse,
  TransferResult,
  TransferStatus,
} from "./types.d";

export type SocketTokenResult = { ok: true; token: string } | { ok: false; error: string };

/** What the forwarder needs of a response. `net.fetch` returns one. */
export interface CloudFetchResponse {
  status: number;
  type?: string;
  headers: { forEach(fn: (value: string, name: string) => void): void };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type CloudFetchLike = (
  url: string,
  init: {
    method: string;
    headers: [string, string][];
    body?: string | Uint8Array;
    redirect: "manual";
    signal: AbortSignal;
  },
) => Promise<CloudFetchResponse>;

/** Request headers the renderer may set. The helper adds `Authorization`. */
const REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "range",
  "trpc-accept",
  "x-nodetool-protocol",
  "x-trpc-source",
]);

/** Response headers the renderer never sees. */
const DROPPED_RESPONSE_HEADERS = new Set(["set-cookie", "set-cookie2"]);

/**
 * tRPC routers the renderer may not call through the account: the ones that
 * create a credential (the server refuses them for an access token too), and
 * the transfer router, which runs on the local server through `transfer`.
 */
const DENIED_PROCEDURE_PREFIXES = ["agentAccess.", "cloudTransfer."];

const PROCEDURE = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/;

/**
 * Whether the renderer may ask for `path` with `method`. The list of routes
 * a cloud document needs: tRPC, the asset file routes for reading, and the
 * sync capabilities. Anything else, another host, a dot segment, an encoded
 * slash or a fragment is refused (TC117).
 */
/**
 * The file routes: `/api/assets/<id>/...` and the bytes of a server whose
 * storage has no signed URLs, `/api/storage/<key>`. The server checks the
 * key against the caller's own and shared assets.
 */
function isMediaPath(pathname: string): boolean {
  return ["/api/assets/", "/api/storage/"].some(
    (prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length,
  );
}

export function cloudRouteAllowed(method: string, path: string): boolean {
  if (path.length === 0 || path.length > 8192) {
    return false;
  }
  if (!path.startsWith("/") || path.startsWith("//") || /[^\x21-\x7e]|[#\\]/.test(path)) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(path, "https://route.invalid");
  } catch {
    return false;
  }
  // The URL parser removes dot segments, including encoded ones. A path it
  // changes is not one a route has.
  const query = path.indexOf("?");
  if (url.origin !== "https://route.invalid" || url.pathname !== (query < 0 ? path : path.slice(0, query))) {
    return false;
  }
  const pathname = url.pathname;
  if (/%2f|%5c|%2e/i.test(pathname)) {
    return false;
  }
  if (pathname.startsWith("/trpc/")) {
    if (method !== "GET" && method !== "POST") {
      return false;
    }
    const procedures = pathname.slice("/trpc/".length).split(",");
    return procedures.every(
      (name) => PROCEDURE.test(name) && !DENIED_PROCEDURE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    );
  }
  if (isMediaPath(pathname)) {
    return method === "GET" || method === "HEAD";
  }
  if (pathname === "/api/sync/capabilities") {
    return method === "GET";
  }
  return false;
}

/** The renderer's headers that may be sent, or null when one is malformed. */
export function cloudRequestHeaders(headers: Record<string, string>): [string, string][] | null {
  const out: [string, string][] = [];
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value.length > 2048 || /[\r\n\0]/.test(value)) {
      return null;
    }
    if (REQUEST_HEADERS.has(lower)) {
      out.push([lower, value]);
    }
  }
  return out;
}

/** Whether `origin` is an `http` origin of this computer, as `isLoopbackHttpOrigin` in native/account. */
export function isLoopbackHttpOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    url.origin === origin &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !url.username &&
    !url.password
  );
}

function byteLength(body: string | Uint8Array | undefined): number {
  if (body === undefined) {
    return 0;
  }
  return body instanceof Uint8Array ? body.byteLength : Buffer.byteLength(body);
}

/** One `http` message of the helper that serves a request or a transfer. */
export interface TaggedHttp {
  id: number;
  method: string;
  url: string;
  headers: [string, string][];
  body: string;
  timeoutMs: number;
  requiredOrigin: string;
  request?: number;
  transfer?: number;
}

interface KeptResponse {
  status: number;
  headers: [string, string][];
  body: Uint8Array;
}

type Pending =
  | {
      kind: "request";
      method: CloudMethod;
      path: string;
      headers: [string, string][];
      body: string | Uint8Array | undefined;
      kept: KeptResponse | null;
      finish: (response: CloudResponse) => void;
    }
  | { kind: "transfer"; procedure: string; finish: (result: TransferResult) => void }
  | { kind: "socketToken"; finish: (result: SocketTokenResult) => void };

export interface CloudRequestsDeps {
  /** The canonical origin the helper was started for, or null. */
  serverOrigin: string | null;
  /** The loopback origin of the local server this app runs, or null. */
  localOrigin: () => string | null;
  localClientToken: () => string;
  fetch: CloudFetchLike;
  /** Writes one message to the helper. False when there is no helper. */
  send: (message: Record<string, unknown>) => boolean;
  /** Runs `fn` after `ms`, and returns the function that cancels it. */
  setTimer: (fn: () => void, ms: number) => () => void;
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

/**
 * Thread affinity: Electron's main process, on its event loop only. Owns the
 * pending requests and the fetches it starts for them, and aborts every one
 * in signedOut(), helperStopped() and dispose().
 */
export class CloudRequests {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly cancelTimers = new Map<number, () => void>();
  /** Fetches in flight by the helper's `http` id, so `httpCancel` can stop them. */
  private readonly fetches = new Map<number, AbortController>();

  constructor(private readonly deps: CloudRequestsDeps) {}

  /** A cloud request of the renderer. Never throws. */
  request(input: CloudRequestInput): Promise<CloudResponse> {
    if (!this.deps.serverOrigin || !cloudRouteAllowed(input.method, input.path)) {
      this.deps.log("Refused a cloud request off the list of routes", "warn");
      return Promise.resolve({ ok: false, error: "REFUSED" });
    }
    const headers = cloudRequestHeaders(input.headers);
    if (!headers || byteLength(input.body) > MAX_CLOUD_REQUEST_BYTES) {
      return Promise.resolve({ ok: false, error: "REFUSED" });
    }
    if (this.pending.size >= MAX_PENDING) {
      return Promise.resolve({ ok: false, error: "BUSY" });
    }
    const body = input.method === "GET" || input.method === "HEAD" ? undefined : input.body;
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, {
        kind: "request",
        method: input.method,
        path: input.path,
        headers,
        body,
        kept: null,
        finish: resolve,
      });
      this.start(id, CLOUD_REQUEST_TIMEOUT_MS, {
        type: "request",
        id,
        method: input.method,
        path: input.path,
        timeoutMs: CLOUD_REQUEST_TIMEOUT_MS,
      });
    });
  }

  /** A call of the local server's `cloudTransfer` router. Never throws. */
  transfer(procedure: string, input: Record<string, unknown>): Promise<TransferResult> {
    const localOrigin = this.deps.localOrigin();
    if (!localOrigin || !isLoopbackHttpOrigin(localOrigin) || !/^cloudTransfer\.[A-Za-z.]+$/.test(procedure)) {
      return Promise.resolve({ status: "refused", reason: "INVALID", data: null });
    }
    if (this.pending.size >= MAX_PENDING) {
      return Promise.resolve({ status: "offline", reason: "BUSY", data: null });
    }
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { kind: "transfer", procedure, finish: resolve });
      this.start(id, TRANSFER_TIMEOUT_MS, { type: "transfer", id, procedure, input, localOrigin });
    });
  }

  /** An access token for one socket upgrade, for the main process only (D25). */
  socketToken(): Promise<SocketTokenResult> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { kind: "socketToken", finish: resolve });
      this.start(id, CLOUD_REQUEST_TIMEOUT_MS, { type: "socketToken", id });
    });
  }

  /**
   * An `http` message of the helper. Returns false when it serves neither a
   * request nor a transfer, so the account's own forwarder sends it.
   */
  onHttp(message: TaggedHttp): boolean {
    if (message.request !== undefined) {
      void this.forwardRequest(message, message.request);
      return true;
    }
    if (message.transfer !== undefined) {
      void this.forwardTransfer(message, message.transfer);
      return true;
    }
    return false;
  }

  /** `httpCancel`: the helper stopped waiting for one of its `http` messages. */
  onHttpCancel(id: number): void {
    this.fetches.get(id)?.abort();
    this.fetches.delete(id);
  }

  onResponse(message: { id: number; status: number; error: string }): void {
    const entry = this.pending.get(message.id);
    if (!entry || entry.kind !== "request") {
      return;
    }
    if (message.error === "") {
      const kept = entry.kept;
      // The helper reports the status of the last send. Its response is the
      // one this module kept.
      if (kept && kept.status === message.status) {
        this.end(message.id, () => entry.finish({ ok: true, ...kept }));
        return;
      }
      this.end(message.id, () => entry.finish({ ok: false, error: "OFFLINE" }));
      return;
    }
    const error: CloudRequestError =
      message.error === "SIGNED_OUT" || message.error === "CANCELLED" || message.error === "BUSY"
        ? message.error
        : message.error === "INVALID"
          ? "REFUSED"
          : "OFFLINE";
    this.end(message.id, () => entry.finish({ ok: false, error }));
  }

  onTransferResult(message: { id: number; status: string; reason: string; data: unknown }): void {
    const entry = this.pending.get(message.id);
    if (!entry || entry.kind !== "transfer") {
      return;
    }
    const known: TransferStatus[] = ["ok", "signedOut", "offline", "refused", "localUnavailable", "cancelled"];
    const status = known.includes(message.status as TransferStatus)
      ? (message.status as TransferStatus)
      : "localUnavailable";
    this.end(message.id, () =>
      entry.finish({ status, reason: message.reason, data: status === "ok" ? message.data : null }),
    );
  }

  onSocketTokenResult(message: { id: number; token?: string; error?: string }): void {
    const entry = this.pending.get(message.id);
    if (!entry || entry.kind !== "socketToken") {
      return;
    }
    const result: SocketTokenResult =
      message.token
        ? { ok: true, token: message.token }
        : { ok: false, error: message.error || "OFFLINE" };
    this.end(message.id, () => entry.finish(result));
  }

  /** The account moved to signed out: every pending request ends. */
  signedOut(): void {
    this.endAll("SIGNED_OUT", true);
  }

  /** The helper exited: every pending request ends, and nothing tells it. */
  helperStopped(): void {
    this.endAll("OFFLINE", false);
  }

  dispose(): void {
    this.endAll("OFFLINE", false);
  }

  pendingCount(): number {
    return this.pending.size;
  }

  private start(id: number, timeoutMs: number, message: Record<string, unknown>): void {
    this.cancelTimers.set(
      id,
      this.deps.setTimer(() => this.cancel(id, "OFFLINE"), timeoutMs),
    );
    if (!this.deps.send(message)) {
      this.cancel(id, "OFFLINE");
    }
  }

  /** Ends `id` with `error` and tells the helper to stop it. */
  private cancel(id: number, error: CloudRequestError): void {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    this.deps.send({ type: "requestCancel", id });
    this.end(id, () => this.fail(entry, error));
  }

  private fail(entry: Pending, error: CloudRequestError): void {
    if (entry.kind === "request") {
      entry.finish({ ok: false, error });
    } else if (entry.kind === "transfer") {
      entry.finish({
        status: error === "SIGNED_OUT" ? "signedOut" : error === "CANCELLED" ? "cancelled" : "offline",
        reason: error,
        data: null,
      });
    } else {
      entry.finish({ ok: false, error });
    }
  }

  private end(id: number, finish: () => void): void {
    this.pending.delete(id);
    this.cancelTimers.get(id)?.();
    this.cancelTimers.delete(id);
    finish();
  }

  private endAll(error: CloudRequestError, tellHelper: boolean): void {
    for (const controller of this.fetches.values()) {
      controller.abort();
    }
    this.fetches.clear();
    for (const [id, entry] of [...this.pending]) {
      if (tellHelper) {
        this.deps.send({ type: "requestCancel", id });
      }
      this.end(id, () => this.fail(entry, error));
    }
  }

  private answer(httpId: number, status: number, body = ""): void {
    this.deps.send({ type: "httpResponse", id: httpId, status, body });
  }

  private async forwardRequest(message: TaggedHttp, requestId: number): Promise<void> {
    const entry = this.pending.get(requestId);
    const origin = this.deps.serverOrigin;
    const bearer = message.headers.length === 1 && message.headers[0][0] === "Authorization" ? message.headers[0][1] : "";
    if (
      !entry ||
      entry.kind !== "request" ||
      !origin ||
      message.url !== origin + entry.path ||
      message.method !== entry.method ||
      message.requiredOrigin !== origin ||
      !/^Bearer [\x21-\x7e]+$/.test(bearer)
    ) {
      this.deps.log("Refused an account request that matches no cloud request", "warn");
      this.answer(message.id, 0);
      return;
    }
    const controller = new AbortController();
    this.fetches.set(message.id, controller);
    const timeout = AbortSignal.timeout(Math.min(Math.max(message.timeoutMs, 1000), CLOUD_REQUEST_TIMEOUT_MS));
    let kept: KeptResponse | null = null;
    try {
      const response = await this.deps.fetch(message.url, {
        method: entry.method,
        headers: [...entry.headers, ["authorization", bearer]],
        body: entry.body,
        redirect: "manual",
        signal: AbortSignal.any([controller.signal, timeout]),
      });
      // A redirect is never followed, and an opaque one has no status.
      if (response.type !== "opaqueredirect" && response.status !== 0) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength <= MAX_CLOUD_RESPONSE_BYTES) {
          const headers: [string, string][] = [];
          response.headers.forEach((value, name) => {
            if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) {
              headers.push([name.toLowerCase(), value]);
            }
          });
          kept = { status: response.status, headers, body: bytes };
        }
      }
    } catch {
      kept = null;
    } finally {
      this.fetches.delete(message.id);
    }
    if (entry === this.pending.get(requestId)) {
      entry.kept = kept;
    }
    this.answer(message.id, kept?.status ?? 0);
  }

  private async forwardTransfer(message: TaggedHttp, transferId: number): Promise<void> {
    const entry = this.pending.get(transferId);
    const localOrigin = this.deps.localOrigin();
    if (
      !entry ||
      entry.kind !== "transfer" ||
      !localOrigin ||
      !isLoopbackHttpOrigin(localOrigin) ||
      message.url !== `${localOrigin}/trpc/${entry.procedure}` ||
      message.method !== "POST"
    ) {
      // FC32: an access token reaches no process but this app's local server.
      this.deps.log("Refused a transfer call to a server other than this app's own", "warn");
      this.answer(message.id, 0);
      return;
    }
    const controller = new AbortController();
    this.fetches.set(message.id, controller);
    const timeout = AbortSignal.timeout(Math.min(Math.max(message.timeoutMs, 1000), TRANSFER_TIMEOUT_MS));
    let status = 0;
    let body = "";
    try {
      const response = await this.deps.fetch(message.url, {
        method: "POST",
        headers: [
          ["content-type", "application/json"],
          [LOCAL_CLIENT_TOKEN_HEADER, this.deps.localClientToken()],
        ],
        body: message.body,
        redirect: "manual",
        signal: AbortSignal.any([controller.signal, timeout]),
      });
      if (response.type !== "opaqueredirect" && response.status !== 0) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength <= MAX_TRANSFER_RESPONSE_BYTES) {
          status = response.status;
          body = bytes.toString("utf8");
        }
      }
    } catch {
      status = 0;
    } finally {
      this.fetches.delete(message.id);
    }
    this.answer(message.id, status, body);
  }
}

/** The scheme the renderer loads a cloud document's media from. */
export const CLOUD_MEDIA_SCHEME = "nodetool-cloud";

/** Response headers a media answer keeps. A redirect's `Location` is not one. */
const MEDIA_RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
]);

/**
 * The asset route a `nodetool-cloud:` URL names on the signed-in server, or
 * null. `nodetool-cloud://api.nodetool.ai/api/assets/<id>` maps to
 * `https://api.nodetool.ai/api/assets/<id>`, and `/api/storage/<key>` the
 * same way. Another host, a route off the
 * list and user information in the URL are refused (TC121).
 */
export function cloudMediaPath(url: string, serverOrigin: string | null): string | null {
  if (!serverOrigin) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${CLOUD_MEDIA_SCHEME}:` || parsed.username || parsed.password || parsed.hash) {
    return null;
  }
  let origin: string;
  try {
    origin = new URL(`https://${parsed.host}`).origin;
  } catch {
    return null;
  }
  const path = parsed.pathname + parsed.search;
  const query = path.indexOf("?");
  if (origin !== serverOrigin || !isMediaPath(query < 0 ? path : path.slice(0, query)) || !cloudRouteAllowed("GET", path)) {
    return null;
  }
  return path;
}

export interface CloudMediaRequest {
  url: string;
  method: string;
  headers: { get(name: string): string | null };
}

export interface CloudMediaSource {
  serverOrigin(): string | null;
  request(input: CloudRequestInput): Promise<CloudResponse>;
}

/**
 * The `nodetool-cloud:` handler: one GET or HEAD of an asset route through
 * the account, with the renderer's `Range`. A refused URL answers 404, a
 * signed-out account 401, and a redirect or a failure 502, so the renderer
 * never follows the server elsewhere.
 */
export async function cloudMediaResponse(request: CloudMediaRequest, source: CloudMediaSource): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405 });
  }
  const path = cloudMediaPath(request.url, source.serverOrigin());
  if (!path) {
    return new Response(null, { status: 404 });
  }
  const headers: Record<string, string> = {};
  for (const name of ["range", "if-range", "if-none-match", "accept"]) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }
  const answer = await source.request({ method: request.method, path, headers });
  if (!answer.ok) {
    return new Response(null, {
      status: answer.error === "SIGNED_OUT" ? 401 : answer.error === "REFUSED" ? 404 : 502,
    });
  }
  if (answer.status >= 300 && answer.status < 400 && answer.status !== 304) {
    return new Response(null, { status: 502 });
  }
  const kept = new Headers();
  for (const [name, value] of answer.headers) {
    if (MEDIA_RESPONSE_HEADERS.has(name)) {
      kept.append(name, value);
    }
  }
  const nullBody = request.method === "HEAD" || answer.status === 204 || answer.status === 304;
  return new Response(nullBody ? null : new Uint8Array(answer.body), { status: answer.status, headers: kept });
}
