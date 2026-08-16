/**
 * Webhook ingestion route — `POST /api/webhooks/:token`.
 *
 * The public entry point for `webhook` trigger registrations. The path token
 * identifies the registration; the `x-webhook-secret` header authenticates the
 * caller against the sha256 hash stored in `config_json.webhook_secret_hash`
 * by `registration-sync.ts`. There is no session: the route sits on the
 * server's public-route allowlist, so this handler is the only authentication
 * boundary.
 *
 * A valid delivery appends one durable trigger input carrying
 * `{ body, headers, query, method }` and notifies the dispatcher so the run
 * starts without waiting for the next poll.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { createLogger } from "@nodetool-ai/config";
import { getDb, TriggerRegistration } from "@nodetool-ai/models";

const log = createLogger("nodetool.websocket.webhook-route");

/** Header carrying the registration's shared secret. */
export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";
/** Header a sender may use to make retries idempotent. */
export const WEBHOOK_DELIVERY_ID_HEADER = "x-webhook-id";
/** Default cap on a delivery body. */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

/**
 * The durable sink a delivery is written to. `TriggerWakeupService`
 * (`@nodetool-ai/kernel`) satisfies this structurally.
 */
export interface WebhookTriggerSink {
  deliverTriggerInput(opts: {
    runId: string;
    nodeId: string;
    inputId: string;
    payload: unknown;
    cursor?: string;
  }): Promise<boolean>;
}

export interface WebhookRouteOptions {
  /** Durable sink for the incoming event. */
  wakeupService: WebhookTriggerSink;
  /**
   * Called after a *new* input is stored, so the in-process dispatcher can
   * pick it up immediately instead of on its next poll. Duplicates do not
   * notify.
   */
  notify?: () => void;
  /** Body cap in bytes; oversized deliveries get Fastify's 413. */
  maxBodyBytes?: number;
}

/** What the content-type parser hands the handler. */
interface WebhookBody {
  raw: string;
  json?: unknown;
}

interface WebhookRegistrationConfig {
  webhook_token?: unknown;
  webhook_secret_hash?: unknown;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** Constant-time comparison of two hex sha256 digests. */
function secretMatches(provided: string, expectedHash: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  // A malformed stored hash can never authenticate anything.
  if (expected.length !== 32) return false;
  return timingSafeEqual(Buffer.from(hashSecret(provided), "hex"), expected);
}

/**
 * Look up the webhook registration a token belongs to. Tokens live inside
 * `config_json`, which is opaque TEXT in both dialects, so the filter runs in
 * memory over the (small) set of webhook registrations.
 */
async function findByToken(token: string): Promise<TriggerRegistration | null> {
  const rows = await getDb().query.triggerRegistrations.findMany({
    where: (t, { eq }) => eq(t.kind, "webhook")
  });
  for (const row of rows) {
    const reg = new TriggerRegistration(row as Record<string, unknown>);
    const config = (reg.config_json ?? {}) as WebhookRegistrationConfig;
    if (config.webhook_token === token) return reg;
  }
  return null;
}

/**
 * Idempotency key for a delivery: the sender's own delivery id when it sends
 * one, otherwise a hash of token + body + the current minute. The minute
 * bucket makes a retried identical body within the same minute one event,
 * while an identical body sent later is a genuine second event.
 */
function idempotencyKey(
  token: string,
  deliveryId: string | undefined,
  rawBody: string
): string {
  if (deliveryId) return `webhook:${token}:${deliveryId}`;
  const minute = Math.floor(Date.now() / 60_000);
  const digest = createHash("sha256")
    .update(`${token}\n${minute}\n${rawBody}`)
    .digest("hex");
  return `webhook:${token}:${digest}`;
}

/** Request headers minus the shared secret, which must not be persisted. */
function sanitizeHeaders(
  headers: Record<string, unknown>
) {
  const out: Record<string, unknown> = { ...headers };
  delete out[WEBHOOK_SECRET_HEADER];
  return out;
}

export function createWebhookRoute(
  options: WebhookRouteOptions
): FastifyPluginAsync {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return async (app) => {
    // One parser for every content type: keep the raw string (needed for the
    // idempotency hash and for non-JSON senders) and parse JSON when it is
    // JSON. Parsers are encapsulated per plugin scope, so this does not touch
    // the rest of the server.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser(
      "*",
      { parseAs: "string", bodyLimit: maxBodyBytes },
      (_req, body, done) => {
        const raw = typeof body === "string" ? body : String(body);
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          // Not JSON — the raw string is the payload.
        }
        done(null, { raw, json } satisfies WebhookBody);
      }
    );

    app.post<{ Params: { token: string }; Body: WebhookBody }>(
      "/api/webhooks/:token",
      {
        bodyLimit: maxBodyBytes,
        config: {
          rateLimit: {
            max: 120,
            timeWindow: 60_000
          }
        }
      },
      async (req, reply) => {
        const token = req.params.token;
        const registration = await findByToken(token);
        if (!registration) {
          return reply.status(404).send({ error: "Unknown webhook token" });
        }

        const config = (registration.config_json ??
          {}) as WebhookRegistrationConfig;
        const secretHash =
          typeof config.webhook_secret_hash === "string"
            ? config.webhook_secret_hash
            : "";
        const provided = req.headers[WEBHOOK_SECRET_HEADER];
        if (
          typeof provided !== "string" ||
          !secretMatches(provided, secretHash)
        ) {
          return reply.status(401).send({ error: "Invalid webhook secret" });
        }

        if (registration.enabled !== 1) {
          return reply.status(410).send({ error: "Webhook trigger disabled" });
        }

        const body = req.body ?? { raw: "" };
        const deliveryId = req.headers[WEBHOOK_DELIVERY_ID_HEADER];
        const inputId = idempotencyKey(
          token,
          typeof deliveryId === "string" && deliveryId ? deliveryId : undefined,
          body.raw
        );

        const created = await options.wakeupService.deliverTriggerInput({
          runId: registration.workflow_id,
          nodeId: registration.node_id,
          inputId,
          payload: {
            body: body.json ?? body.raw,
            headers: sanitizeHeaders(req.headers as Record<string, unknown>),
            query: req.query ?? {},
            method: req.method
          }
        });

        if (created) {
          options.notify?.();
        } else {
          log.debug("Duplicate webhook delivery ignored", { inputId });
        }

        return reply.send({
          status: "accepted",
          input_id: inputId,
          duplicate: !created
        });
      }
    );
  };
}
