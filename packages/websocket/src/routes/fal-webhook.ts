/**
 * Authenticated fal queue webhook ingress.
 *
 * The route deliberately stops at the durable inbox boundary. A generation
 * finalizer consumes the accepted delivery later, so this handler never
 * downloads provider media or emits completion notifications.
 */

import {
  createHash,
  createPublicKey,
  verify as verifySignature
} from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  GenerationWebhookDelivery,
  GenerationAttempt
} from "@nodetool-ai/models";

export const FAL_WEBHOOK_PATH = "/api/providers/fal/webhook/:token";
export const FAL_WEBHOOK_JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
export const FAL_WEBHOOK_TIMESTAMP_WINDOW_SECONDS = 300;
export const FAL_WEBHOOK_JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const FAL_WEBHOOK_MAX_BODY_BYTES = 10 * 1024 * 1024;

const HEADER_REQUEST_ID = "x-fal-webhook-request-id";
const HEADER_USER_ID = "x-fal-webhook-user-id";
const HEADER_TIMESTAMP = "x-fal-webhook-timestamp";
const HEADER_SIGNATURE = "x-fal-webhook-signature";

export interface FalWebhookHeaders {
  readonly requestId: string;
  readonly userId: string;
  readonly timestamp: string;
  readonly signature: string;
}

export interface FalWebhookJwk {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly x: string;
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
}

export type FalWebhookVerificationResult =
  | {
      readonly ok: true;
      readonly headers: FalWebhookHeaders;
      readonly bodySha256: string;
    }
  | {
      readonly ok: false;
      readonly retryable: boolean;
      readonly reason:
        | "missing_header"
        | "invalid_header"
        | "invalid_timestamp"
        | "stale_timestamp"
        | "invalid_signature"
        | "jwks_unavailable";
    };

export interface FalWebhookVerifierOptions {
  readonly fetchJwks?: () => Promise<readonly FalWebhookJwk[]>;
  readonly now?: () => number;
  readonly cacheTtlMs?: number;
}

class FalWebhookKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FalWebhookKeyError";
  }
}

function parseHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  const headerName = Object.keys(headers).find(
    (key) => key.toLowerCase() === name
  );
  const value = headerName ? headers[headerName] : undefined;
  if (typeof value !== "string" || value.length === 0) return null;
  // Header values are part of the signed message. Reject whitespace and
  // control characters instead of silently normalising a signed value.
  if (!/^[\x21-\x7e]+$/u.test(value)) {
    return null;
  }
  return value;
}

function parseFalHeaders(
  headers: Record<string, string | string[] | undefined>
): FalWebhookHeaders | FalWebhookVerificationResult {
  const requestId = parseHeader(headers, HEADER_REQUEST_ID);
  const userId = parseHeader(headers, HEADER_USER_ID);
  const timestamp = parseHeader(headers, HEADER_TIMESTAMP);
  const signature = parseHeader(headers, HEADER_SIGNATURE);
  if (!requestId || !userId || !timestamp || !signature) {
    return { ok: false, retryable: false, reason: "missing_header" };
  }
  if (
    requestId.length > 512 ||
    userId.length > 512 ||
    !/^\d{1,12}$/u.test(timestamp) ||
    !/^[0-9a-fA-F]{128}$/u.test(signature)
  ) {
    return { ok: false, retryable: false, reason: "invalid_header" };
  }
  return { requestId, userId, timestamp, signature };
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function isFalJwk(value: unknown): value is FalWebhookJwk {
  if (typeof value !== "object" || value === null) return false;
  const key = value as Record<string, unknown>;
  return (
    key.kty === "OKP" &&
    key.crv === "Ed25519" &&
    typeof key.x === "string" &&
    decodeBase64Url(key.x) !== null
  );
}

async function fetchFalJwks(): Promise<readonly FalWebhookJwk[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(FAL_WEBHOOK_JWKS_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      throw new FalWebhookKeyError(`fal JWKS returned ${response.status}`);
    }
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null) {
      throw new FalWebhookKeyError("fal JWKS was not an object");
    }
    const keys = (parsed as Record<string, unknown>).keys;
    if (!Array.isArray(keys)) {
      throw new FalWebhookKeyError("fal JWKS did not contain keys");
    }
    return keys.filter(isFalJwk);
  } catch (error) {
    if (error instanceof FalWebhookKeyError) throw error;
    throw new FalWebhookKeyError("fal JWKS fetch failed");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * fal Ed25519 verifier. Key refreshes are coalesced so a burst of callbacks
 * cannot turn a key rotation or cold start into a request storm.
 */
export class FalWebhookVerifier {
  private readonly fetchJwks: () => Promise<readonly FalWebhookJwk[]>;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private cachedKeys: readonly FalWebhookJwk[] | null = null;
  private cacheExpiresAt = 0;
  private refreshPromise: Promise<readonly FalWebhookJwk[]> | null = null;

  constructor(options: FalWebhookVerifierOptions = {}) {
    this.fetchJwks = options.fetchJwks ?? fetchFalJwks;
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = Math.min(
      options.cacheTtlMs ?? FAL_WEBHOOK_JWKS_CACHE_TTL_MS,
      FAL_WEBHOOK_JWKS_CACHE_TTL_MS
    );
  }

  private async refreshKeys(): Promise<readonly FalWebhookJwk[]> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchJwks()
      .then((keys) => {
        this.cachedKeys = keys;
        this.cacheExpiresAt = this.now() + this.cacheTtlMs;
        return keys;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async keys(): Promise<readonly FalWebhookJwk[]> {
    if (this.cachedKeys && this.now() < this.cacheExpiresAt) {
      return this.cachedKeys;
    }
    return this.refreshKeys();
  }

  async verify(
    headers: Record<string, string | string[] | undefined>,
    body: Uint8Array
  ): Promise<FalWebhookVerificationResult> {
    const parsed = parseFalHeaders(headers);
    if ("ok" in parsed) return parsed;

    const timestamp = Number(parsed.timestamp);
    const nowSeconds = Math.floor(this.now() / 1000);
    if (!Number.isSafeInteger(timestamp)) {
      return { ok: false, retryable: false, reason: "invalid_timestamp" };
    }
    if (
      Math.abs(nowSeconds - timestamp) > FAL_WEBHOOK_TIMESTAMP_WINDOW_SECONDS
    ) {
      return { ok: false, retryable: false, reason: "stale_timestamp" };
    }

    const bodySha256 = createHash("sha256").update(body).digest("hex");
    const message = Buffer.from(
      `${parsed.requestId}\n${parsed.userId}\n${parsed.timestamp}\n${bodySha256}`,
      "utf8"
    );
    const signature = Buffer.from(parsed.signature, "hex");

    let keys: readonly FalWebhookJwk[];
    try {
      keys = await this.keys();
    } catch {
      return { ok: false, retryable: true, reason: "jwks_unavailable" };
    }

    const matches = (candidateKeys: readonly FalWebhookJwk[]): boolean => {
      for (const jwk of candidateKeys) {
        try {
          // Keep the verifier input to the required Ed25519 JWK members. The
          // local validation type intentionally does not claim Node's broad
          // JsonWebKey index signature.
          const key: JsonWebKey = {
            kty: jwk.kty,
            crv: jwk.crv,
            x: jwk.x
          };
          const publicKey = createPublicKey({ key, format: "jwk" });
          if (verifySignature(null, message, publicKey, signature)) return true;
        } catch {
          // Invalid keys are ignored. A malformed JWKS must not make an
          // attacker-controlled callback pass verification.
        }
      }
      return false;
    };

    if (!matches(keys)) {
      // A signed callback can arrive immediately after fal rotates keys. One
      // bounded refresh handles that case while preventing retry storms.
      try {
        keys = await this.refreshKeys();
      } catch {
        return { ok: false, retryable: true, reason: "jwks_unavailable" };
      }
      if (!matches(keys)) {
        return { ok: false, retryable: false, reason: "invalid_signature" };
      }
    }

    return { ok: true, headers: parsed, bodySha256 };
  }
}

export interface FalWebhookAttempt {
  readonly attemptId?: string;
  readonly generationId: string;
  /** fal account identity, when it was persisted at acceptance. */
  readonly providerUserId?: string;
  readonly providerRequestId?: string;
  readonly providerAccountRef?: string;
}

export interface FalWebhookDelivery {
  readonly token: string;
  readonly attempt: FalWebhookAttempt;
  readonly requestId: string;
  readonly gatewayRequestId: string | null;
  readonly userId: string;
  readonly timestamp: string;
  readonly status: "OK" | "ERROR";
  readonly payload: unknown;
  readonly payloadError: unknown;
  readonly error: unknown;
  readonly rawBody: Uint8Array;
  readonly bodySha256: string;
  readonly headersSignature?: string;
}

export interface FalWebhookInbox {
  /** Find the preaccepted attempt identified by the callback token. */
  findAttempt(token: string): Promise<FalWebhookAttempt | null>;
  /** Commit the verified delivery before the HTTP handler acknowledges it. */
  insertIfAbsent(delivery: FalWebhookDelivery): Promise<boolean>;
}

/** Durable adapter for the generation-attempt and webhook-delivery tables. */
export class DrizzleFalWebhookInbox implements FalWebhookInbox {
  async findAttempt(token: string): Promise<FalWebhookAttempt | null> {
    const row = await GenerationAttempt.findByCallbackToken("fal_ai", token);
    if (!row) return null;
    const providerRequestId =
      typeof row.provider_request_id === "string"
        ? row.provider_request_id
        : undefined;
    const providerAccountRef =
      typeof row.provider_account_ref === "string"
        ? row.provider_account_ref
        : undefined;
    const attempt: FalWebhookAttempt = {
      attemptId: row.id,
      generationId: row.generation_id,
      providerRequestId,
      providerAccountRef
    };
    return attempt;
  }

  async insertIfAbsent(delivery: FalWebhookDelivery): Promise<boolean> {
    // Older attempts may not have an account reference. Scope their fallback
    // to the generation rather than allowing unrelated requests to collide.
    const accountRef =
      delivery.attempt.providerAccountRef ??
      `generation:${delivery.attempt.generationId}`;
    const result = await GenerationWebhookDelivery.ingest({
      provider: "fal_ai",
      provider_account_ref: accountRef,
      provider_request_id: delivery.requestId,
      payload_hash: delivery.bodySha256,
      raw_payload: Buffer.from(delivery.rawBody).toString("utf8"),
      signature: delivery.headersSignature ?? null,
      generation_id: delivery.attempt.generationId,
      attempt_id: delivery.attempt.attemptId ?? null,
      observation: {
        gateway_request_id: delivery.gatewayRequestId,
        user_id: delivery.userId,
        timestamp: delivery.timestamp,
        status: delivery.status,
        payload: delivery.payload,
        payload_error: delivery.payloadError,
        error: delivery.error
      }
    });
    return result.created;
  }
}

export interface FalWebhookRouteOptions {
  /** The durable generation inbox. Omit only for hosts not yet cut over. */
  readonly inbox?: FalWebhookInbox;
  readonly verifier?: FalWebhookVerifier;
  readonly maxBodyBytes?: number;
}

interface FalWebhookBody {
  readonly raw: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requestHeaders(
  req: FastifyRequest
): Record<string, string | string[] | undefined> {
  return req.headers;
}

export function createFalWebhookRoute(
  options: FalWebhookRouteOptions = {}
): FastifyPluginAsync {
  const maxBodyBytes = options.maxBodyBytes ?? FAL_WEBHOOK_MAX_BODY_BYTES;
  const verifier = options.verifier ?? new FalWebhookVerifier();

  return async (app) => {
    // This parser is encapsulated by Fastify. Other routes retain their
    // existing parser and never see a reserialised body.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser(
      "*",
      { parseAs: "buffer", bodyLimit: maxBodyBytes },
      (_req, body, done) => done(null, body)
    );

    app.post<{ Params: { token: string }; Body: FalWebhookBody | Buffer }>(
      FAL_WEBHOOK_PATH,
      {
        bodyLimit: maxBodyBytes,
        config: { rateLimit: { max: 120, timeWindow: 60_000 } },
        schema: {
          // The body is intentionally a raw Buffer. JSON schema validation is
          // performed after signature verification below, because parsing or
          // reserialising it first would invalidate fal's signature.
          body: {},
          params: {
            type: "object",
            required: ["token"],
            properties: {
              token: { type: "string", minLength: 1, maxLength: 512 }
            }
          },
          response: {
            200: {
              type: "object",
              required: ["status", "duplicate"],
              properties: {
                status: { type: "string", const: "accepted" },
                duplicate: { type: "boolean" }
              }
            }
          }
        }
      },
      async (req, reply) => {
        const body = Buffer.isBuffer(req.body)
          ? req.body
          : (req.body as FalWebhookBody | undefined)?.raw;
        if (!body) return reply.status(400).send({ error: "Missing body" });

        const verification = await verifier.verify(requestHeaders(req), body);
        if (!verification.ok) {
          return reply
            .status(verification.retryable ? 503 : 400)
            .send({ error: verification.reason });
        }

        let decoded: unknown;
        try {
          decoded = JSON.parse(body.toString("utf8"));
        } catch {
          return reply.status(400).send({ error: "Invalid JSON body" });
        }
        if (!isRecord(decoded)) {
          return reply
            .status(400)
            .send({ error: "Webhook body must be an object" });
        }
        const requestId = nonEmptyString(decoded.request_id);
        const gatewayRequestId = nonEmptyString(decoded.gateway_request_id);
        const status = decoded.status;
        if (
          !requestId ||
          (requestId !== verification.headers.requestId &&
            gatewayRequestId !== verification.headers.requestId)
        ) {
          return reply.status(400).send({ error: "Request ID mismatch" });
        }
        if (status !== "OK" && status !== "ERROR") {
          return reply.status(400).send({ error: "Invalid webhook status" });
        }

        const token = req.params.token;
        if (!options.inbox) {
          return reply.status(503).send({ error: "Inbox unavailable" });
        }
        let attempt: FalWebhookAttempt | null;
        try {
          attempt = await options.inbox.findAttempt(token);
        } catch {
          return reply.status(503).send({ error: "Inbox unavailable" });
        }
        if (!attempt)
          return reply.status(404).send({ error: "Unknown webhook token" });
        if (
          attempt.providerUserId &&
          attempt.providerUserId !== verification.headers.userId
        ) {
          return reply.status(400).send({ error: "Webhook user mismatch" });
        }
        if (
          attempt.providerRequestId &&
          attempt.providerRequestId !== requestId
        ) {
          return reply.status(400).send({ error: "Provider request mismatch" });
        }

        const delivery: FalWebhookDelivery = {
          token,
          attempt,
          requestId,
          gatewayRequestId,
          userId: verification.headers.userId,
          timestamp: verification.headers.timestamp,
          status,
          payload: decoded.payload ?? null,
          payloadError: decoded.payload_error ?? null,
          // fal's ERROR callbacks commonly put the useful diagnostic in
          // payload_error. Preserve the structured field and expose the same
          // normalized value to consumers that only read `error`.
          error: decoded.error ?? decoded.payload_error ?? null,
          rawBody: Buffer.from(body),
          bodySha256: verification.bodySha256,
          headersSignature: verification.headers.signature
        };
        let created: boolean;
        try {
          created = await options.inbox.insertIfAbsent(delivery);
        } catch {
          return reply.status(503).send({ error: "Inbox unavailable" });
        }
        return reply.send({ status: "accepted", duplicate: !created });
      }
    );
  };
}

/** Default registration keeps the callback surface present during cutover. */
export const falWebhookRoute = createFalWebhookRoute({
  inbox: new DrizzleFalWebhookInbox()
});

export default falWebhookRoute;
