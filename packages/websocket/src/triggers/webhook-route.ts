/**
 * Webhook ingestion route — `POST /api/webhooks/:token`.
 *
 * The public entry point for webhook triggers (Task 9). A world event maps to a
 * registration by URL token, is authenticated against the registration's hashed
 * secret, and is appended as one durable, idempotent `trigger_input`. The
 * dispatcher (running in the same process) picks it up and starts a run.
 *
 * This route is on the server's public-route allowlist (`server.ts`): it carries
 * no session and authenticates per-registration via the `x-webhook-secret`
 * header, not the platform auth hook.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { TriggerRegistration } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";
import { getTriggerWakeupService, notifyDispatcher } from "./dispatcher.js";

const log = createLogger("nodetool.websocket.triggers.webhook-route");

/** Bodies larger than this are rejected with 413. */
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function sha256Buf(value: Buffer | string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** The raw request body as a Buffer (the server parses all bodies as buffers). */
function rawBody(req: FastifyRequest): Buffer {
  const body = req.body;
  if (Buffer.isBuffer(body)) return body;
  if (body == null) return Buffer.alloc(0);
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

/**
 * Verify the registration's secret against the `x-webhook-secret` header.
 * Returns true when no secret is configured (open webhook) or when the header's
 * SHA-256 matches the stored hash (constant-time). Missing/wrong header when a
 * secret is configured returns false.
 */
function secretOk(
  config: Record<string, unknown> | null,
  header: string | undefined
): boolean {
  const stored = config?.secret_hash;
  if (typeof stored !== "string" || stored.length === 0) return true; // open
  if (header == null) return false;

  const provided = sha256Buf(header); // 32 bytes
  let expected: Buffer;
  try {
    expected = Buffer.from(stored, "hex");
  } catch {
    return false;
  }
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(provided, expected);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Idempotency key for the delivery. `x-webhook-id` (scoped by token) when the
 * sender supplies one; otherwise a hash of token + raw body + the current
 * minute, so an accidental retry within the same minute collapses to one input.
 */
function computeInputId(
  token: string,
  webhookId: string | undefined,
  body: Buffer
): string {
  if (webhookId != null && webhookId.length > 0) {
    return `${token}:${webhookId}`;
  }
  const minuteBucket = Math.floor(Date.now() / 60_000);
  return createHash("sha256")
    .update(token)
    .update("\0")
    .update(body)
    .update("\0")
    .update(String(minuteBucket))
    .digest("hex");
}

function isJsonContentType(contentType: string | undefined): boolean {
  return typeof contentType === "string" && contentType.includes("json");
}

/** Parse the body per content-type: JSON when declared (falling back to raw
 *  string on a parse error), otherwise the raw string. */
function parseBody(body: Buffer, contentType: string | undefined): unknown {
  const text = body.toString("utf8");
  if (!isJsonContentType(contentType)) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const webhookRoute: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/webhooks/:token",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { token } = req.params as { token: string };

      const registrations = await TriggerRegistration.findByKind("webhook");
      const reg = registrations.find(
        (r) =>
          (r.config_json as Record<string, unknown> | null)?.token === token
      );

      if (!reg) {
        return reply.status(404).send({ error: "Unknown webhook token" });
      }
      if (reg.enabled !== 1) {
        return reply.status(410).send({ error: "Webhook disabled" });
      }

      const config = reg.config_json as Record<string, unknown> | null;
      const secretHeader = firstHeader(req.headers["x-webhook-secret"]);
      if (!secretOk(config, secretHeader)) {
        // Nothing is stored on an auth failure.
        return reply.status(401).send({ error: "Invalid webhook secret" });
      }

      const body = rawBody(req);
      if (body.byteLength > MAX_BODY_BYTES) {
        return reply.status(413).send({ error: "Payload too large" });
      }

      const contentType = firstHeader(req.headers["content-type"]);
      const payload = {
        body: parseBody(body, contentType),
        headers: req.headers,
        query: req.query,
        method: req.method
      };

      const inputId = computeInputId(
        token,
        firstHeader(req.headers["x-webhook-id"]),
        body
      );

      const created = await getTriggerWakeupService().deliverTriggerInput({
        runId: reg.workflow_id,
        nodeId: reg.node_id,
        inputId,
        payload
      });

      if (!created) {
        // Idempotent replay — the input already exists, no second run.
        return reply.status(200).send({ status: "accepted", duplicate: true });
      }

      // Fire-and-forget: same-process dispatch happens immediately, and the
      // dispatcher's poll recovers it anyway if no dispatcher is wired yet.
      void notifyDispatcher().catch((error) => {
        log.warn(
          `notifyDispatcher failed after webhook ${reg.workflow_id}/${reg.node_id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });

      return reply.status(200).send({ status: "accepted" });
    }
  );
};

export default webhookRoute;
