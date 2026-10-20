/**
 * `POST /api/analytics/v1/events` — the one door for anonymous product
 * analytics. See docs/analytics.md.
 *
 * Browser clients (Cloud, local web, the desktop renderer) post here
 * same-origin, so no third party is contacted from the browser. Every batch
 * is validated against the shared schema in `@nodetool-ai/analytics`, then:
 *
 * - **ingest** (`NODETOOL_ANALYTICS_INGEST=1`): stored through
 *   `recordAnalyticsEvents` — raw rows for 30 days, daily counts after;
 * - **relay** (the default): forwarded to `NODETOOL_ANALYTICS_ENDPOINT`
 *   (default analytics.nodetool.ai) with the validated body only, so no
 *   browser header, cookie, Origin, Referer or user agent travels on;
 * - **off** (`NODETOOL_ANALYTICS_RELAY=0` without ingest): accepted and
 *   discarded, so clients stop retrying.
 *
 * The handler never reads `req.ip`, the headers or the session. The route is
 * exempt from auth, so it never resolves a user, and the server runs with
 * Fastify's logger off, so the body is not logged.
 */
import type { FastifyPluginAsync } from "fastify";
import {
  ANALYTICS_INGEST_PATH,
  ANALYTICS_SCHEMA_VERSION,
  DEFAULT_ANALYTICS_ENDPOINT,
  canonicalEnvelope,
  createFetchTransport,
  validateBatch,
  type AnalyticsBatch,
  type AnalyticsTransport
} from "@nodetool-ai/analytics";
import { createLogger } from "@nodetool-ai/config";
import {
  DEFAULT_ANALYTICS_RETENTION_DAYS,
  pruneAnalyticsEvents,
  recordAnalyticsEvents
} from "@nodetool-ai/models";
import { parseJsonBodies } from "../lib/json-body.js";

const log = createLogger("nodetool.websocket.analytics");

type Env = Readonly<Record<string, string | undefined>>;

/** Events older than this are refused, so a stale offline queue is dropped. */
const MAX_EVENT_AGE_MS = 7 * 24 * 3_600_000;

/** A batch is at most 50 small envelopes. Anything bigger is not ours. */
export const ANALYTICS_BODY_LIMIT = 64 * 1024;

const PRUNE_INTERVAL_MS = 24 * 3_600_000;

/** Per client. A browser flushes its queue a few times a minute at most. */
const ANALYTICS_RATE_LIMIT = { max: 60, timeWindow: "1 minute" };

export type AnalyticsRouteMode = "ingest" | "relay" | "off";

const truthy = (value: string | undefined): boolean =>
  ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");

const falsy = (value: string | undefined): boolean =>
  ["0", "false", "no", "off"].includes(value?.trim().toLowerCase() ?? "");

export function analyticsRouteMode(env: Env = process.env): AnalyticsRouteMode {
  if (truthy(env["NODETOOL_ANALYTICS_INGEST"])) return "ingest";
  if (falsy(env["NODETOOL_ANALYTICS_RELAY"])) return "off";
  return "relay";
}

/** The relay target: an https URL, or the default analytics host. */
export function analyticsRelayEndpoint(env: Env = process.env): string {
  const configured = env["NODETOOL_ANALYTICS_ENDPOINT"]?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // Fall through to the default.
    }
    log.warn("Ignoring NODETOOL_ANALYTICS_ENDPOINT: it must be an https URL");
  }
  return DEFAULT_ANALYTICS_ENDPOINT;
}

export interface AnalyticsRouteOptions {
  env?: Env;
  /** Relay transport override, for tests. */
  relay?: AnalyticsTransport;
  /** Storage override, for tests. Defaults to `recordAnalyticsEvents`. */
  store?: (batch: AnalyticsBatch, receivedAt: Date) => Promise<void>;
  now?: () => Date;
}

/**
 * Validate a request body and reduce it to the canonical batch. Pure, so the
 * relay, the ingest path and the backend emitter share one gate.
 */
export function acceptAnalyticsBatch(
  body: unknown,
  now: Date
): { ok: true; batch: AnalyticsBatch } | { ok: false; reason: string } {
  const result = validateBatch(body, { now, maxAgeMs: MAX_EVENT_AGE_MS });
  if (!result.ok) return result;
  return {
    ok: true,
    batch: {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      events: result.value.events.map(canonicalEnvelope)
    }
  };
}

const analyticsRoute =
  (options: AnalyticsRouteOptions = {}): FastifyPluginAsync =>
  async (app) => {
    const env = options.env ?? process.env;
    const now = options.now ?? (() => new Date());
    const mode = analyticsRouteMode(env);
    const relay =
      options.relay ??
      createFetchTransport({ url: analyticsRelayEndpoint(env), timeoutMs: 5_000 });
    const store =
      options.store ??
      ((batch: AnalyticsBatch, receivedAt: Date) =>
        recordAnalyticsEvents(batch.events, receivedAt));

    if (mode === "ingest" && !options.store) {
      const prune = (): void => {
        pruneAnalyticsEvents(DEFAULT_ANALYTICS_RETENTION_DAYS).catch((error: unknown) => {
          log.warn("Analytics retention sweep failed", { error: String(error) });
        });
      };
      prune();
      const timer = setInterval(prune, PRUNE_INTERVAL_MS);
      timer.unref();
      app.addHook("onClose", async () => clearInterval(timer));
    }

    // `server.ts` hands every route a raw Buffer. Parse `application/json`
    // here and nothing else: a `text/plain` body is a POST any website can
    // send without a preflight.
    parseJsonBodies(app);

    app.post(
      ANALYTICS_INGEST_PATH,
      {
        bodyLimit: ANALYTICS_BODY_LIMIT,
        // The route is public and writes rows in ingest mode, so it gets a
        // tighter limit than the global one.
        config: { rateLimit: ANALYTICS_RATE_LIMIT },
        // Only the outer shape here: Fastify's validator coerces types, and
        // the strict check (exact keys, enums, no coercion) is validateBatch.
        schema: { body: { type: "object" } }
      },
      async (req, reply) => {
        // Only the body is read. No IP, header, cookie or user is touched.
        const accepted = acceptAnalyticsBatch(req.body, now());
        if (!accepted.ok) {
          return reply.status(400).send({ error: "invalid_batch", reason: accepted.reason });
        }
        if (mode === "ingest") {
          try {
            await store(accepted.batch, now());
          } catch (error) {
            log.warn("Storing analytics batch failed", { error: String(error) });
            return reply.status(503).send({ error: "unavailable" });
          }
        } else if (mode === "relay") {
          // Fire and forget: the browser does not wait on the analytics host.
          void relay.send(accepted.batch).catch(() => undefined);
        }
        return reply.status(202).send({ accepted: accepted.batch.events.length });
      }
    );
  };

export default analyticsRoute;
export { analyticsRoute as createAnalyticsRoute };
