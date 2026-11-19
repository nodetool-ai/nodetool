/**
 * The cloud server's side of a cloud document's saved state in the desktop
 * app (WP1.15): the TypeScript form of `TrpcCloudSaver`,
 * `WorkflowCloudSaver` and `TimelineCloudSaver` in
 * `native/account/src/cloud_savers.cpp`, with the same answers.
 *
 * A save names the revision it edits. When another save got there first,
 * the server refuses it with ALREADY_EXISTS, and the saver reads the latest
 * revision and sends the draft again on it, up to kConflictRetries times.
 * The draft wins, and the server keeps the revision it replaces as a
 * version. A document stored in a newer schema, or on a server that does
 * not take this client's saves, opens read-only.
 */
import { SYNC_PROTOCOL_HEADER, SYNC_PROTOCOL_VERSION } from "@nodetool-ai/protocol/api-schemas/sync.js";

import { CloudRequestError } from "./cloudFetch";
import type {
  CloudBase,
  CloudDocumentKey,
  CloudDocumentOptions,
  CloudSaver,
  SaveResult,
  SaveStatus
} from "./CloudDocumentSaver";

export const WORKFLOW_SCHEMA_VERSION = 1;
export const TIMELINE_SCHEMA_VERSION = 1;
/** The client protocol version, as kClientProtocolVersion in native/account. */
export const CLIENT_PROTOCOL_VERSION = 1;
/** A conflict is retried this many times before the save counts as offline. */
export const CONFLICT_RETRIES = 3;

/** The role and options the server reported when the document opened. */
export interface DocumentAccess {
  role: string;
  options: CloudDocumentOptions;
}

const DEFAULT_ACCESS: DocumentAccess = {
  role: "editor",
  options: { allowHistory: false, allowDownload: false, allowDuplicate: false }
};

/** A document as `open()` read it. */
export interface OpenedDocument {
  status: SaveStatus;
  reason: string;
  /** The revision a save of this document edits. */
  base: CloudBase;
  /** The read procedure's answer, the document JSON. */
  data: string;
  schemaVersion: number;
  /** False when the client cannot write the schema or the server refuses its saves. */
  writable: boolean;
}

/** The parts of a kind's save, as the subclasses of TrpcCloudSaver in native/account. */
export interface CloudDocumentKind {
  /** `workflow` or `timeline`: the kind's key in the capabilities. */
  readonly kind: string;
  readonly schemaVersion: number;
  readonly procedure: string;
  readonly readProcedure: string;
  /** The save's input, or null when the draft is not JSON of the kind's shape. */
  input(key: CloudDocumentKey, editingInstance: string, base: CloudBase, draft: string): Record<string, unknown> | null;
  /** The new revision's `updated_at` in the procedure's answer. */
  updatedAt(data: Record<string, unknown>): string | null;
  schemaVersionOf(data: Record<string, unknown>): number;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** tRPC answers `{"result": {"data": …}}`; a server with a transformer wraps the payload in `{"json": …}`. */
function unwrap(value: unknown): unknown {
  return isObject(value) && "json" in value ? value.json : value;
}

function stringField(data: JsonObject, name: string): string | null {
  const value = data[name];
  return typeof value === "string" ? value : null;
}

function schemaField(data: JsonObject, name: string): number {
  const value = data[name];
  // A server that records no version stores every document in version 1.
  return Number.isInteger(value) ? (value as number) : 1;
}

/** The SHA-256 of `text` as 64 lower-case hex characters. */
export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A workflow draft is `{"graph": {...}, "name": "..."}`, or the graph alone. */
export const WORKFLOW_KIND: CloudDocumentKind = {
  kind: "workflow",
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  procedure: "workflows.autosave",
  readProcedure: "workflows.get",
  input(key, editingInstance, base, draft) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      return null;
    }
    const wrapped = isObject(parsed) && "graph" in parsed;
    const graph = wrapped ? (parsed as JsonObject).graph : parsed;
    if (!isObject(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      return null;
    }
    const input: JsonObject = {
      id: key.documentId,
      graph,
      // A cloud save is never rate limited away: the saved state reads
      // Saved to cloud only after it.
      force: true,
      client_id: "desktop",
      editing_instance: editingInstance,
      schema_version: WORKFLOW_SCHEMA_VERSION,
      expected_updated_at: base.updatedAt
    };
    const name = wrapped ? (parsed as JsonObject).name : undefined;
    if (typeof name === "string" && name) {
      input.name = name;
    }
    return input;
  },
  updatedAt: (data) => stringField(data, "updated_at"),
  schemaVersionOf: (data) => schemaField(data, "schema_version")
};

/** A timeline draft is the document, with `fps`, `width` and `height` sent as columns. */
export const TIMELINE_KIND: CloudDocumentKind = {
  kind: "timeline",
  schemaVersion: TIMELINE_SCHEMA_VERSION,
  procedure: "timeline.update",
  readProcedure: "timeline.get",
  input(key, editingInstance, base, draft) {
    let document: unknown;
    try {
      document = JSON.parse(draft);
    } catch {
      return null;
    }
    if (!isObject(document)) {
      return null;
    }
    const input: JsonObject = { id: key.documentId, editingInstance, schemaVersion: TIMELINE_SCHEMA_VERSION };
    const rest: JsonObject = { ...document };
    for (const column of ["fps", "width", "height"]) {
      if (column in rest) {
        if (typeof rest[column] === "number") {
          input[column] = rest[column];
        }
        delete rest[column];
      }
    }
    input.document = rest;
    input.baseUpdatedAt = base.updatedAt;
    return input;
  },
  updatedAt: (data) => stringField(data, "updatedAt"),
  schemaVersionOf: (data) => schemaField(data, "schemaVersion")
};

const EMPTY_DOCUMENT: OpenedDocument = {
  status: "offline",
  reason: "",
  base: { updatedAt: "", contentHash: "" },
  data: "",
  schemaVersion: 1,
  writable: false
};

interface Outcome {
  status: SaveStatus;
  reason: string;
  data: JsonObject | null;
}

/** The server and account a saver sends for, and how it reaches the server. */
export interface CloudSaverTarget {
  serverOrigin: string;
  /** `serverKeyOf(serverOrigin)`. */
  serverKey: string;
  accountId: string;
  /** A `fetch` that reaches `serverOrigin` with the account's credential. */
  fetch: typeof fetch;
}

function result(status: SaveStatus, reason = ""): SaveResult {
  return { status, reason, base: { updatedAt: "", contentHash: "" }, ...DEFAULT_ACCESS };
}

/**
 * Saves and reads one kind of cloud document over tRPC. Thread affinity:
 * the renderer's event loop. One instance serves every document of its kind
 * on one server and account.
 */
export class TrpcCloudSaver implements CloudSaver {
  private readonly access = new Map<string, DocumentAccess>();
  private readonly readOnly = new Map<string, string>();
  private writable = false;

  constructor(
    private readonly target: CloudSaverTarget,
    private readonly documentKind: CloudDocumentKind
  ) {}

  /** The role and options to store with the base after a save. */
  setAccess(documentId: string, access: DocumentAccess): void {
    this.access.set(documentId, access);
  }

  /** Reads the document, and whether this client may save it. */
  async open(key: CloudDocumentKey): Promise<OpenedDocument> {
    if (!this.boundTo(key)) {
      return { ...EMPTY_DOCUMENT, status: "signedOut", reason: "OTHER_ACCOUNT" };
    }
    const opened = await this.read(key);
    if (opened.status !== "ok") {
      return opened;
    }
    let readOnly = "";
    if (opened.schemaVersion > this.documentKind.schemaVersion) {
      readOnly = "SCHEMA_DOWNGRADE";
    } else {
      const writable = await this.checkWritable();
      if (writable.status === "refused") {
        readOnly = writable.reason;
      }
      // Offline or signed out: the capabilities are read again at the save.
    }
    if (readOnly) {
      this.readOnly.set(key.documentId, readOnly);
    } else {
      this.readOnly.delete(key.documentId);
    }
    return { ...opened, writable: readOnly === "", reason: readOnly };
  }

  async save(key: CloudDocumentKey, editingInstance: string, base: CloudBase, draft: string): Promise<SaveResult> {
    if (!this.boundTo(key)) {
      // The draft waits, under its own account, until that account is signed in here again.
      return result("signedOut", "OTHER_ACCOUNT");
    }
    if (!base.updatedAt) {
      // Without the revision it edits, the server would apply the save to whatever it holds now.
      return result("refused", "NO_BASE");
    }
    if (!this.documentKind.input(key, editingInstance, base, draft)) {
      return result("refused", "INVALID_DRAFT");
    }
    const readOnly = this.readOnly.get(key.documentId);
    if (readOnly) {
      return result("refused", readOnly);
    }
    const writable = await this.checkWritable();
    if (writable.status !== "ok") {
      return writable;
    }

    let sendBase = base;
    for (let attempt = 0; attempt <= CONFLICT_RETRIES; attempt += 1) {
      const input = this.documentKind.input(key, editingInstance, sendBase, draft);
      const outcome = await this.call(`/trpc/${this.documentKind.procedure}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (outcome.status === "ok" && outcome.data) {
        const revision = this.documentKind.updatedAt(outcome.data);
        if (!revision) {
          return result("refused", "INVALID_RESPONSE");
        }
        const access = this.access.get(key.documentId) ?? DEFAULT_ACCESS;
        return {
          status: "ok",
          reason: "",
          base: { updatedAt: revision, contentHash: await contentHash(draft) },
          role: access.role,
          options: access.options
        };
      }
      if (outcome.status !== "refused" || outcome.reason !== "ALREADY_EXISTS") {
        return result(outcome.status, outcome.reason);
      }
      // Another save got there first. Send the draft again on the latest revision.
      const latest = await this.read(key);
      if (latest.status !== "ok") {
        return result(latest.status, latest.reason);
      }
      if (latest.schemaVersion > this.documentKind.schemaVersion) {
        return result("refused", "SCHEMA_DOWNGRADE");
      }
      sendBase = latest.base;
    }
    // The document keeps changing under this save. It is tried again later.
    return result("offline");
  }

  private boundTo(key: CloudDocumentKey): boolean {
    return key.serverKey === this.target.serverKey && key.accountId === this.target.accountId;
  }

  /**
   * Sends one request and sorts the answer: a 401 is signed out, and a
   * timeout, a rate limit or a server failure is offline. Both are retried
   * later. Any other error status is a refusal with the API code.
   */
  private async call(path: string, init: RequestInit = {}): Promise<Outcome> {
    let response: Response;
    try {
      response = await this.target.fetch(`${this.target.serverOrigin}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), [SYNC_PROTOCOL_HEADER]: String(SYNC_PROTOCOL_VERSION) }
      });
    } catch (error) {
      if (error instanceof CloudRequestError && (error.code === "SIGNED_OUT" || error.code === "CANCELLED")) {
        return { status: "signedOut", reason: "", data: null };
      }
      if (error instanceof CloudRequestError && error.code === "REFUSED") {
        return { status: "refused", reason: "WRONG_SERVER", data: null };
      }
      return { status: "offline", reason: "", data: null };
    }
    const status = response.status;
    if (status === 401) {
      return { status: "signedOut", reason: "", data: null };
    }
    if (status === 408 || status === 425 || status === 429 || status >= 500) {
      return { status: "offline", reason: "", data: null };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (status !== 200) {
      return { status: "refused", reason: refusalCode(body, status), data: null };
    }
    const data = isObject(body) && isObject(body.result) ? unwrap(body.result.data) : null;
    if (!isObject(data)) {
      return { status: "refused", reason: "INVALID_RESPONSE", data: null };
    }
    return { status: "ok", reason: "", data };
  }

  /** Whether the server takes this client's saves of the kind. */
  private async checkWritable(): Promise<SaveResult> {
    if (this.writable) {
      return result("ok");
    }
    let response: Response;
    try {
      response = await this.target.fetch(`${this.target.serverOrigin}/api/sync/capabilities`);
    } catch (error) {
      if (error instanceof CloudRequestError && (error.code === "SIGNED_OUT" || error.code === "CANCELLED")) {
        return result("signedOut");
      }
      return error instanceof CloudRequestError && error.code === "REFUSED"
        ? result("refused", "WRONG_SERVER")
        : result("offline");
    }
    if (response.status === 401) {
      return result("signedOut");
    }
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      return result("offline");
    }
    let caps: unknown = null;
    if (response.status === 200) {
      try {
        caps = await response.json();
      } catch {
        caps = null;
      }
    }
    if (!isObject(caps) || !Number.isInteger(caps.min_client_protocol_version) || !isObject(caps.kinds)) {
      // A server from before capability negotiation lacks the save guarantees cloud documents rely on.
      return result("refused", "SERVER_UNSUPPORTED");
    }
    if ((caps.min_client_protocol_version as number) > CLIENT_PROTOCOL_VERSION) {
      return result("refused", "CLIENT_TOO_OLD");
    }
    const kindCaps = caps.kinds[this.documentKind.kind];
    const lists = (field: string, wanted: unknown): boolean =>
      isObject(kindCaps) && Array.isArray(kindCaps[field]) && (kindCaps[field] as unknown[]).includes(wanted);
    if (!lists("write", this.documentKind.schemaVersion) || !lists("modes", "whole")) {
      return result("refused", "SERVER_UNSUPPORTED");
    }
    this.writable = true;
    return result("ok");
  }

  private async read(key: CloudDocumentKey): Promise<OpenedDocument> {
    const empty = EMPTY_DOCUMENT;
    const input = encodeURIComponent(JSON.stringify({ id: key.documentId }));
    const outcome = await this.call(`/trpc/${this.documentKind.readProcedure}?input=${input}`);
    if (outcome.status !== "ok" || !outcome.data) {
      return { ...empty, status: outcome.status, reason: outcome.reason };
    }
    const revision = this.documentKind.updatedAt(outcome.data);
    if (!revision) {
      return { ...empty, status: "refused", reason: "INVALID_RESPONSE" };
    }
    const data = JSON.stringify(outcome.data);
    return {
      status: "ok",
      reason: "",
      base: { updatedAt: revision, contentHash: await contentHash(data) },
      data,
      schemaVersion: this.documentKind.schemaVersionOf(outcome.data),
      writable: false
    };
  }
}

/** The API code of a refused call, or `HTTP_<status>` when the body names none. */
function refusalCode(body: unknown, status: number): string {
  if (isObject(body) && "error" in body) {
    const error = unwrap(body.error);
    if (isObject(error) && isObject(error.data) && typeof error.data.apiCode === "string") {
      return error.data.apiCode;
    }
  }
  return `HTTP_${status}`;
}
