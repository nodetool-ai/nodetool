/**
 * Cross-instance control bus for running jobs.
 *
 * A workflow run executes on exactly one server instance, but with more than
 * one instance behind a proxy the client that wants to stop it can land on any
 * of them. `cancelJob` on a machine that does not own the run has no session to
 * reach — the persisted row is the durable signal, but a run polls nothing, so
 * it would keep burning provider spend until its detach grace elapsed.
 *
 * This bus carries the verb to whichever machine holds the session. Under
 * PostgreSQL it is `LISTEN`/`NOTIFY`; under SQLite — single process by
 * definition — an EventEmitter, so local dev and the tests drive the same code
 * path.
 *
 * **LISTEN needs a session-pooled or direct connection.** The application's own
 * client points at Supabase's transaction pooler (port 6543), which hands a
 * backend back to the pool between statements: a `LISTEN` issued there is
 * either rejected or silently attached to a connection nothing later notifies,
 * so the subscription looks healthy and never delivers. The listener therefore
 * opens its own client against a direct URL —
 * `NODETOOL_JOB_CONTROL_DATABASE_URL`, else `DIRECT_URL`, else
 * `DATABASE_DIRECT_URL` — and falls back to the pooled client with a loud
 * warning when none is configured.
 *
 * Control verbs only. A NOTIFY payload is capped at 8000 bytes and delivery is
 * best-effort: publishing never throws, subscribers may see a message twice (a
 * subscription re-established after a reconnect can overlap), and every handler
 * must be idempotent. Nothing that matters may depend on a message arriving:
 * the job row is the durable signal, and the owner polls it (see
 * `startJobCancelPoller` in the websocket package) so a dead bus costs latency,
 * not correctness.
 */

import { EventEmitter } from "node:events";

import { createLogger } from "@nodetool-ai/config";

import type { Sql } from "postgres";

import { getDbType, getPgClient } from "./db.js";

const log = createLogger("nodetool.models.job-control-bus");

/** Postgres channel names are identifiers: lowercase, no quoting needed. */
const CHANNEL = "nodetool_job_control";

export interface JobControlMessage {
  job_id: string;
  user_id: string;
  action: "cancel";
  /** Instance that published it, for logging. Null on a single machine. */
  origin: string | null;
}

export type JobControlHandler = (message: JobControlMessage) => void;

/** In-process fan-out: the whole bus under SQLite, unused under PostgreSQL. */
const localBus = new EventEmitter();
localBus.setMaxListeners(0);

const EVENT = "job-control";

/**
 * Isolate one subscriber's failure. Every host on this bus is fanning a verb
 * out to sessions it may not hold; one that throws must not take out the
 * publisher or the subscribers behind it.
 */
function guarded(handler: JobControlHandler): JobControlHandler {
  return (message) => {
    try {
      handler(message);
    } catch (err) {
      log.warn("Job control handler failed", {
        jobId: message.job_id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  };
}

function parseMessage(payload: string): JobControlMessage | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (typeof value !== "object" || value === null) return null;
    const { job_id, user_id, action, origin } = value as Record<
      string,
      unknown
    >;
    if (typeof job_id !== "string" || !job_id) return null;
    if (typeof user_id !== "string" || !user_id) return null;
    if (action !== "cancel") return null;
    return {
      job_id,
      user_id,
      action,
      origin: typeof origin === "string" ? origin : null
    };
  } catch {
    return null;
  }
}

/**
 * Broadcast a control verb to every instance, this one included.
 *
 * Under PostgreSQL the notify rides a pooled connection while the subscription
 * holds its own, so the publishing process is a distinct backend session and
 * receives the message through the normal delivery path — no local shortcut,
 * and therefore no double delivery.
 */
export async function publishJobControl(
  message: JobControlMessage
): Promise<void> {
  const payload = JSON.stringify(message);
  if (getDbType() !== "postgres") {
    localBus.emit(EVENT, message);
    return;
  }
  try {
    const sql = getPgClient();
    if (!sql) {
      log.warn("Job control publish skipped: no PostgreSQL client", {
        jobId: message.job_id
      });
      return;
    }
    await sql.notify(CHANNEL, payload);
  } catch (err) {
    // The row-level cancel the caller already persisted is the durable signal;
    // a lost notify costs latency, not correctness.
    log.warn("Job control publish failed", {
      jobId: message.job_id,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Receive control verbs. One subscription per process — every instance sees
 * every message and ignores the jobs it does not hold, so handlers must filter
 * and must tolerate a repeat.
 */
export async function subscribeJobControl(
  handler: JobControlHandler
): Promise<() => void> {
  if (getDbType() !== "postgres") {
    const listener = guarded(handler);
    localBus.on(EVENT, listener);
    return () => {
      localBus.off(EVENT, listener);
    };
  }

  const onNotify = (payload: string): void => {
    const message = parseMessage(payload);
    if (!message) {
      log.warn("Discarding malformed job control message");
      return;
    }
    guarded(handler)(message);
  };

  const listener = await openListenClient();
  if (!listener) return () => {};

  try {
    const subscription = await listener.sql.listen(CHANNEL, onNotify);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      void subscription
        .unlisten()
        .catch(() => {
          // Shutdown path — the connection is going away regardless.
        })
        .finally(() => listener.close());
    };
  } catch (err) {
    log.warn("Job control subscribe failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    listener.close();
    return () => {};
  }
}

/**
 * A connection that can hold a `LISTEN`.
 *
 * Prefers a dedicated client on a direct URL; `close` ends it. Falls back to
 * the shared pooled client — where LISTEN may never deliver — rather than
 * leaving the bus unsubscribed, because the fallback still works on a direct
 * or session-pooled `DATABASE_URL`, which is what a self-hosted deployment
 * normally has. `close` is then a no-op: the pooled client is not ours to end.
 */
async function openListenClient(): Promise<{
  sql: Sql;
  close: () => void;
} | null> {
  const directUrl =
    process.env["NODETOOL_JOB_CONTROL_DATABASE_URL"] ??
    process.env["DIRECT_URL"] ??
    process.env["DATABASE_DIRECT_URL"];

  if (directUrl) {
    try {
      const { default: postgres } = await import("postgres");
      // One connection, and only for LISTEN: `max: 1` keeps postgres.js from
      // opening a pool it will never use, and the client reconnects on its own.
      const sql = postgres(directUrl, { max: 1, connect_timeout: 10 });
      return {
        sql,
        close: () => {
          void sql.end({ timeout: 5 }).catch(() => {
            // Shutting down; nothing left to do about a failed close.
          });
        }
      };
    } catch (err) {
      log.warn("Job control listener could not open its direct connection", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  } else {
    log.warn(
      "Job control is listening on the pooled connection: set " +
        "NODETOOL_JOB_CONTROL_DATABASE_URL (or DIRECT_URL) to a direct or " +
        "session-pooled URL. Behind a transaction pooler LISTEN never " +
        "delivers, leaving cross-instance cancel to the slower row poller."
    );
  }

  const sql = getPgClient();
  if (!sql) {
    log.warn("Job control subscribe skipped: no PostgreSQL client");
    return null;
  }
  return { sql, close: () => {} };
}

/** Test hook: drop every in-process listener between cases. */
export function resetJobControlBusForTests(): void {
  localBus.removeAllListeners(EVENT);
}
