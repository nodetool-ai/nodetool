/**
 * Authenticated AtlasCloud prediction webhook ingress.
 *
 * AtlasCloud signs each callback with Ed25519 over `<timestamp>.<raw body>` and
 * publishes the public keys as a JWKS (https://atlascloud.ai/docs/en/webhooks).
 * The route verifies that signature, then hands the callback to the in-process
 * registry the submitting run is waiting on. It does no provider I/O of its
 * own: a callback is an optimization over polling the prediction endpoint, so a
 * delivery this process cannot match is acknowledged rather than retried.
 */

import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  rejectAtlasWebhook,
  resolveAtlasWebhook,
  type AtlasPollResult
} from "@nodetool-ai/runtime";
import { isRecord, isString } from "../lib/wire-values.js";

export const ATLASCLOUD_WEBHOOK_PATH = "/api/providers/atlascloud/webhook";
export const ATLASCLOUD_WEBHOOK_JWKS_URL =
  "https://api.atlascloud.ai/api/v1/webhooks/jwks.json";
export const ATLASCLOUD_WEBHOOK_TIMESTAMP_WINDOW_SECONDS = 300;
export const ATLASCLOUD_WEBHOOK_JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Shortest gap between two key-rotation refreshes.
 *
 * This route is unauthenticated by design, so an unknown key id is something
 * any caller can present. Without a floor, a stream of made-up key ids would
 * turn each one into an outbound JWKS request at the route's rate limit. A
 * real rotation still resolves within one cooldown.
 */
export const ATLASCLOUD_WEBHOOK_ROTATION_COOLDOWN_MS = 60 * 1000;
export const ATLASCLOUD_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;

const HEADER_ID = "x-atlascloud-webhook-id";
const HEADER_TIMESTAMP = "x-atlascloud-webhook-timestamp";
const HEADER_SIGNATURE = "x-atlascloud-webhook-signature-ed25519";
/**
 * AtlasCloud's contract: the Ed25519 signature moves to the bare header once
 * HMAC is retired, so prefer `-Ed25519` and fall back to `-Signature`. During
 * the migration the bare header carries a hex HMAC, which is not a 64-byte
 * base64url value and so fails to decode below — legacy HMAC-only deliveries
 * stay rejected rather than being verified under the wrong scheme.
 */
const HEADER_SIGNATURE_FALLBACK = "x-atlascloud-webhook-signature";
const HEADER_KEY_ID = "x-atlascloud-webhook-key-id";

/** Terminal `payload.status` values that mean the prediction did not produce
 * usable outputs, even under a top-level `status: "OK"`. */
const FAILED_PAYLOAD_STATUSES = new Set(["failed", "timeout", "cancelled"]);

export interface AtlasCloudWebhookHeaders {
  readonly webhookId: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly keyId: string;
}

export interface AtlasCloudWebhookJwk {
  readonly kty: "OKP";
  readonly crv: "Ed25519";
  readonly x: string;
  readonly kid?: string;
  readonly alg?: string;
  readonly use?: string;
}

export type AtlasCloudWebhookVerificationResult =
  | { readonly ok: true; readonly headers: AtlasCloudWebhookHeaders }
  | {
      readonly ok: false;
      readonly retryable: boolean;
      readonly reason:
        | "missing_header"
        | "invalid_header"
        | "invalid_timestamp"
        | "stale_timestamp"
        | "unknown_key"
        | "invalid_signature"
        | "jwks_unavailable";
    };

export interface AtlasCloudWebhookVerifierOptions {
  readonly fetchJwks?: () => Promise<readonly AtlasCloudWebhookJwk[]>;
  readonly now?: () => number;
  readonly cacheTtlMs?: number;
  readonly rotationCooldownMs?: number;
}

class AtlasCloudWebhookKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasCloudWebhookKeyError";
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
  // The timestamp header is part of the signed message. Reject whitespace and
  // control characters rather than silently normalising a signed value.
  if (!/^[\x21-\x7e]+$/u.test(value)) return null;
  return value;
}

function parseAtlasHeaders(
  headers: Record<string, string | string[] | undefined>
): AtlasCloudWebhookHeaders | AtlasCloudWebhookVerificationResult {
  const webhookId = parseHeader(headers, HEADER_ID);
  const timestamp = parseHeader(headers, HEADER_TIMESTAMP);
  const signature =
    parseHeader(headers, HEADER_SIGNATURE) ??
    parseHeader(headers, HEADER_SIGNATURE_FALLBACK);
  const keyId = parseHeader(headers, HEADER_KEY_ID);
  if (!webhookId || !timestamp || !signature || !keyId) {
    return { ok: false, retryable: false, reason: "missing_header" };
  }
  if (
    webhookId.length > 512 ||
    keyId.length > 512 ||
    !/^\d{1,12}$/u.test(timestamp) ||
    !/^[A-Za-z0-9_-]{86,88}={0,2}$/u.test(signature)
  ) {
    return { ok: false, retryable: false, reason: "invalid_header" };
  }
  return { webhookId, timestamp, signature, keyId };
}

function decodeBase64Url(value: string, bytes: number): Buffer | null {
  // Padding is optional in base64url and AtlasCloud's own example emits none.
  // Accepting it costs nothing: the decoded length is what is checked.
  if (!/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === bytes ? decoded : null;
  } catch {
    return null;
  }
}

function isAtlasJwk(value: unknown): value is AtlasCloudWebhookJwk {
  if (typeof value !== "object" || value === null) return false;
  const key = value as Record<string, unknown>;
  return (
    key.kty === "OKP" &&
    key.crv === "Ed25519" &&
    typeof key.x === "string" &&
    decodeBase64Url(key.x, 32) !== null
  );
}

async function fetchAtlasJwks(): Promise<readonly AtlasCloudWebhookJwk[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(ATLASCLOUD_WEBHOOK_JWKS_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      throw new AtlasCloudWebhookKeyError(
        `AtlasCloud JWKS returned ${response.status}`
      );
    }
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null) {
      throw new AtlasCloudWebhookKeyError("AtlasCloud JWKS was not an object");
    }
    const keys = (parsed as Record<string, unknown>).keys;
    if (!Array.isArray(keys)) {
      throw new AtlasCloudWebhookKeyError(
        "AtlasCloud JWKS did not contain keys"
      );
    }
    return keys.filter(isAtlasJwk);
  } catch (error) {
    if (error instanceof AtlasCloudWebhookKeyError) throw error;
    throw new AtlasCloudWebhookKeyError("AtlasCloud JWKS fetch failed");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * AtlasCloud Ed25519 verifier. Key refreshes are coalesced so a burst of
 * callbacks cannot turn a key rotation or a cold start into a request storm.
 */
export class AtlasCloudWebhookVerifier {
  private readonly fetchJwks: () => Promise<readonly AtlasCloudWebhookJwk[]>;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly rotationCooldownMs: number;
  private cachedKeys: readonly AtlasCloudWebhookJwk[] | null = null;
  private cacheExpiresAt = 0;
  private lastRotationRefreshAt = Number.NEGATIVE_INFINITY;
  private refreshPromise: Promise<readonly AtlasCloudWebhookJwk[]> | null = null;

  constructor(options: AtlasCloudWebhookVerifierOptions = {}) {
    this.fetchJwks = options.fetchJwks ?? fetchAtlasJwks;
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = Math.min(
      options.cacheTtlMs ?? ATLASCLOUD_WEBHOOK_JWKS_CACHE_TTL_MS,
      ATLASCLOUD_WEBHOOK_JWKS_CACHE_TTL_MS
    );
    this.rotationCooldownMs =
      options.rotationCooldownMs ?? ATLASCLOUD_WEBHOOK_ROTATION_COOLDOWN_MS;
  }

  private async refreshKeys(): Promise<readonly AtlasCloudWebhookJwk[]> {
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

  /**
   * Claim the one rotation refresh allowed per cooldown. Only refreshes an
   * unknown key id provoked are counted: the cold-start load and a TTL
   * expiry are this verifier's own doing and cannot be driven by a caller.
   */
  private claimRotationRefresh(): boolean {
    const now = this.now();
    if (now - this.lastRotationRefreshAt < this.rotationCooldownMs) {
      return false;
    }
    this.lastRotationRefreshAt = now;
    return true;
  }

  private async keys(): Promise<readonly AtlasCloudWebhookJwk[]> {
    if (this.cachedKeys && this.now() < this.cacheExpiresAt) {
      return this.cachedKeys;
    }
    return this.refreshKeys();
  }

  async verify(
    headers: Record<string, string | string[] | undefined>,
    body: Uint8Array
  ): Promise<AtlasCloudWebhookVerificationResult> {
    const parsed = parseAtlasHeaders(headers);
    if ("ok" in parsed) return parsed;

    const timestamp = Number(parsed.timestamp);
    if (!Number.isSafeInteger(timestamp)) {
      return { ok: false, retryable: false, reason: "invalid_timestamp" };
    }
    const nowSeconds = Math.floor(this.now() / 1000);
    if (
      Math.abs(nowSeconds - timestamp) >
      ATLASCLOUD_WEBHOOK_TIMESTAMP_WINDOW_SECONDS
    ) {
      return { ok: false, retryable: false, reason: "stale_timestamp" };
    }

    const signature = decodeBase64Url(parsed.signature, 64);
    if (!signature) {
      return { ok: false, retryable: false, reason: "invalid_header" };
    }
    // AtlasCloud signs the timestamp, a literal period, and the exact request
    // bytes. Concatenating buffers keeps a non-UTF-8 body byte-identical.
    const message = Buffer.concat([
      Buffer.from(`${parsed.timestamp}.`, "utf8"),
      Buffer.from(body)
    ]);

    let keys: readonly AtlasCloudWebhookJwk[];
    try {
      keys = await this.keys();
    } catch {
      return { ok: false, retryable: true, reason: "jwks_unavailable" };
    }

    const matches = (
      candidateKeys: readonly AtlasCloudWebhookJwk[]
    ): "signed" | "unknown_key" | "bad_signature" => {
      const candidates = candidateKeys.filter(
        (jwk) => jwk.kid === undefined || jwk.kid === parsed.keyId
      );
      if (candidates.length === 0) return "unknown_key";
      for (const jwk of candidates) {
        try {
          // Keep the verifier input to the required Ed25519 JWK members. The
          // local validation type intentionally does not claim Node's broad
          // JsonWebKey index signature.
          const key: JsonWebKey = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
          const publicKey = createPublicKey({ key, format: "jwk" });
          if (verifySignature(null, message, publicKey, signature)) {
            return "signed";
          }
        } catch {
          // Invalid keys are ignored. A malformed JWKS must not make an
          // attacker-controlled callback pass verification.
        }
      }
      return "bad_signature";
    };

    let outcome = matches(keys);
    // Only an unknown key id can mean the cache is stale. A signature that
    // fails against a key AtlasCloud does publish is simply wrong, and
    // refetching on it let any caller drive one outbound request per attempt.
    if (outcome === "unknown_key" && this.claimRotationRefresh()) {
      try {
        keys = await this.refreshKeys();
      } catch {
        return { ok: false, retryable: true, reason: "jwks_unavailable" };
      }
      outcome = matches(keys);
    }
    if (outcome === "unknown_key") {
      return { ok: false, retryable: false, reason: "unknown_key" };
    }
    if (outcome !== "signed") {
      return { ok: false, retryable: false, reason: "invalid_signature" };
    }
    return { ok: true, headers: parsed };
  }
}

export interface AtlasCloudWebhookSink {
  /** Report a terminal prediction. Returns false when nothing was waiting. */
  resolve(predictionId: string, result: AtlasPollResult): boolean;
  /** Report a failed prediction. Returns false when nothing was waiting. */
  reject(predictionId: string, reason: string): boolean;
}

const registrySink: AtlasCloudWebhookSink = {
  resolve: resolveAtlasWebhook,
  reject: rejectAtlasWebhook
};

export interface AtlasCloudWebhookRouteOptions {
  readonly sink?: AtlasCloudWebhookSink;
  readonly verifier?: AtlasCloudWebhookVerifier;
  readonly maxBodyBytes?: number;
}

interface AtlasCloudWebhookBody {
  readonly raw: Buffer;
}

function outputsOf(value: unknown): AtlasPollResult["outputs"] {
  if (!Array.isArray(value)) return undefined;
  return value.filter(
    (entry): entry is string | { url?: string } =>
      isString(entry) || isRecord(entry)
  );
}

/** The callback's own account of the prediction, in the shape the prediction
 * endpoint returns, so a run finishes the same way whichever source wins. */
function resultOf(
  payload: Record<string, unknown> | null,
  error: string | null
): AtlasPollResult {
  const result: AtlasPollResult = {};
  const status = payload && isString(payload.status) ? payload.status : null;
  if (status) result.status = status;
  const outputs = outputsOf(payload?.outputs);
  if (outputs) result.outputs = outputs;
  if (payload && isString(payload.output)) result.output = payload.output;
  if (payload && isString(payload.url)) result.url = payload.url;
  if (error) result.error = error;
  return result;
}

function requestHeaders(
  req: FastifyRequest
): Record<string, string | string[] | undefined> {
  return req.headers;
}

export function createAtlasCloudWebhookRoute(
  options: AtlasCloudWebhookRouteOptions = {}
): FastifyPluginAsync {
  const maxBodyBytes =
    options.maxBodyBytes ?? ATLASCLOUD_WEBHOOK_MAX_BODY_BYTES;
  const verifier = options.verifier ?? new AtlasCloudWebhookVerifier();
  const sink = options.sink ?? registrySink;

  return async (app) => {
    // This parser is encapsulated by Fastify. Other routes retain their
    // existing parser and never see a reserialised body.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser(
      "*",
      { parseAs: "buffer", bodyLimit: maxBodyBytes },
      (_req, body, done) => done(null, body)
    );

    app.post<{ Body: AtlasCloudWebhookBody | Buffer }>(
      ATLASCLOUD_WEBHOOK_PATH,
      {
        bodyLimit: maxBodyBytes,
        config: { rateLimit: { max: 120, timeWindow: 60_000 } },
        schema: {
          // The body is intentionally a raw Buffer. It is parsed after
          // signature verification below, because parsing or reserialising it
          // first would invalidate AtlasCloud's signature.
          body: {},
          response: {
            200: {
              type: "object",
              required: ["status", "matched"],
              properties: {
                status: { type: "string", const: "accepted" },
                matched: { type: "boolean" }
              }
            }
          }
        }
      },
      async (req, reply) => {
        const body = Buffer.isBuffer(req.body)
          ? req.body
          : (req.body as AtlasCloudWebhookBody | undefined)?.raw;
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
        const envelope = decoded as Record<string, unknown>;
        const sessionId = isString(envelope.session_id)
          ? envelope.session_id
          : null;
        if (!sessionId || sessionId !== verification.headers.webhookId) {
          return reply.status(400).send({ error: "Session ID mismatch" });
        }
        const status = envelope.status;
        if (status !== "OK" && status !== "ERROR") {
          return reply.status(400).send({ error: "Invalid webhook status" });
        }

        const payload = isRecord(envelope.payload)
          ? (envelope.payload as Record<string, unknown>)
          : null;
        const error = isString(envelope.error) ? envelope.error : null;
        const payloadStatus =
          payload && isString(payload.status) ? payload.status : null;
        const failed =
          status === "ERROR" ||
          (payloadStatus !== null &&
            FAILED_PAYLOAD_STATUSES.has(payloadStatus.toLowerCase()));

        // A delivery this process cannot match is a duplicate, a prediction
        // another replica submitted, or one whose run already finished by
        // poll. All three are acknowledged: retrying them changes nothing.
        const matched = failed
          ? sink.reject(
              sessionId,
              error ?? payloadStatus ?? "AtlasCloud reported a failure"
            )
          : sink.resolve(sessionId, resultOf(payload, error));
        return reply.send({ status: "accepted", matched });
      }
    );
  };
}

export const atlasCloudWebhookRoute = createAtlasCloudWebhookRoute();

export default atlasCloudWebhookRoute;
