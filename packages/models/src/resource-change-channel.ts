import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { getPostgresClient, resolvePostgresClientOptions } from "./db.js";

const log = createLogger("nodetool.resource-change-channel");
const CHANNEL = "nodetool_resource_change";
export const NOTIFY_PAYLOAD_LIMIT = 7500;
/**
 * Most messages held waiting for the next flush. Beyond this the oldest are
 * dropped and one resync marker is sent so every replica refetches once.
 */
export const MAX_PENDING_NOTIFICATIONS = 5000;
/** Sent in place of dropped messages. Receivers treat it as a full resync. */
export const RESYNC_MESSAGE = JSON.stringify({ type: "resource_resync" });
const pointerSchema = z.object({ outbox_id: z.string().uuid() });

export function resolveResourceChangeListenerUrl(
  databaseUrl: string,
  directUrl?: string
): string {
  const url = directUrl?.trim() || databaseUrl;
  if (new URL(url).port === "6543") {
    throw new Error(
      "Cross-instance resource changes require DIRECT_URL or a session-mode DATABASE_URL. LISTEN cannot use transaction-pooler port 6543."
    );
  }
  return url;
}

/**
 * Packs JSON messages into groups that each encode to at most `limit` bytes.
 * A group of one stays in the original single-envelope form, so replicas that
 * predate batching can still read it. Larger groups encode as a JSON array.
 * A single message above the limit gets a group of its own, which the sender
 * moves through the outbox. Order is preserved.
 */
export function packResourceChangeMessages(
  messages: readonly string[],
  limit: number = NOTIFY_PAYLOAD_LIMIT
): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let bytes = 2;
  for (const message of messages) {
    const size = Buffer.byteLength(message, "utf8");
    const added = size + (current.length > 0 ? 1 : 0);
    if (current.length > 0 && bytes + added > limit) {
      groups.push(current);
      current = [];
      bytes = 2;
    }
    bytes += size + (current.length > 0 ? 1 : 0);
    current.push(message);
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/** Encodes one packed group: the bare message for one, a JSON array otherwise. */
export function encodeResourceChangeGroup(group: readonly string[]): string {
  return group.length === 1 ? (group[0] as string) : `[${group.join(",")}]`;
}

interface PendingMessage {
  message: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export interface ResourceChangeChannel {
  publish(message: string): Promise<void>;
  stopListening(): Promise<void>;
  close(): Promise<void>;
}

/** Uses the normal write pool and one dedicated, reconnecting LISTEN connection. */
export async function openResourceChangeChannel(
  listenerUrl: string,
  receive: (message: string) => void,
  resync: () => void
): Promise<ResourceChangeChannel> {
  resolveResourceChangeListenerUrl(listenerUrl);
  const { default: postgres } = await import("postgres");
  const pool = getPostgresClient();
  // Fail before accepting sockets if the deployment omitted the migration.
  await pool`SELECT id FROM resource_change_outbox LIMIT 0`;
  const listener = postgres(listenerUrl, {
    ...resolvePostgresClientOptions(listenerUrl),
    max: 1,
    connection: { application_name: "nodetool_resource_change" }
  });
  let listening = false;
  let stopped = false;
  let incoming = Promise.resolve();
  let outgoing = Promise.resolve();
  let pending: PendingMessage[] = [];
  let flushScheduled = false;
  let overflowed = false;
  let stopping: Promise<void> | undefined;
  const sweep = async (): Promise<void> => {
    await pool`DELETE FROM resource_change_outbox WHERE created_at < ${new Date(Date.now() - 60_000).toISOString()}`;
  };
  try {
    await listener.listen(
      CHANNEL,
      (message) => {
        incoming = incoming
          .then(async () => {
            if (stopped) {
              return;
            }
            const parsed: unknown = JSON.parse(message);
            const pointer = pointerSchema.safeParse(parsed);
            if (!pointer.success) {
              receive(message);
              return;
            }
            const rows = await pool<
              { payload: string }[]
            >`SELECT payload FROM resource_change_outbox WHERE id = ${pointer.data.outbox_id}`;
            const row = rows[0];
            if (stopped) {
              return;
            }
            if (row) {
              receive(row.payload);
            } else {
              resync();
            }
          })
          .catch((error: unknown) => {
            log.error("Resource change receive failed", {
              error: String(error)
            });
            if (!stopped) {
              resync();
            }
          });
      },
      () => {
        if (listening && !stopped) {
          resync();
        }
        listening = true;
      }
    );
  } catch (error) {
    await listener.end({ timeout: 1 });
    throw error;
  }
  const notify = async (group: readonly string[]): Promise<void> => {
    const message = encodeResourceChangeGroup(group);
    let notification = message;
    if (Buffer.byteLength(message, "utf8") > NOTIFY_PAYLOAD_LIMIT) {
      const id = randomUUID();
      await pool`INSERT INTO resource_change_outbox (id, payload, created_at) VALUES (${id}, ${message}, ${new Date().toISOString()})`;
      notification = JSON.stringify({ outbox_id: id });
    }
    await pool`SELECT pg_notify(${CHANNEL}, ${notification})`;
  };
  // Sends everything queued so far as few notifications as possible. Messages
  // that arrive while a flush is in flight wait for the next one, so a slow
  // database batches more instead of building a chain of single notifies.
  const flush = async (): Promise<void> => {
    const batch = pending;
    pending = [];
    const resync = overflowed;
    overflowed = false;
    if (batch.length === 0 && !resync) {
      return;
    }
    const messages = batch.map((entry) => entry.message);
    if (resync) {
      messages.push(RESYNC_MESSAGE);
    }
    let offset = 0;
    for (const group of packResourceChangeMessages(messages)) {
      const entries = batch.slice(offset, offset + group.length);
      offset += group.length;
      try {
        await notify(group);
        for (const entry of entries) entry.resolve();
      } catch (error) {
        for (const entry of entries) entry.reject(error);
      }
    }
  };
  const scheduleFlush = (): void => {
    if (flushScheduled) {
      return;
    }
    flushScheduled = true;
    setImmediate(() => {
      flushScheduled = false;
      outgoing = outgoing.then(flush, flush);
    });
  };
  const timer = setInterval(() => {
    void sweep().catch((error: unknown) => {
      log.error("Resource change outbox sweep failed", {
        error: String(error)
      });
    });
  }, 60_000);
  timer.unref();
  const stopListening = (): Promise<void> => {
    stopped = true;
    stopping ??= listener.end({ timeout: 5 });
    return stopping;
  };
  return {
    publish(message: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        pending.push({ message, resolve, reject });
        if (pending.length > MAX_PENDING_NOTIFICATIONS) {
          // The database is not keeping up. Drop the oldest message and have
          // receivers resync once instead of queueing without limit.
          pending.shift()?.resolve();
          if (!overflowed) {
            log.warn("Resource change queue full, dropping oldest messages", {
              limit: MAX_PENDING_NOTIFICATIONS
            });
          }
          overflowed = true;
        }
        scheduleFlush();
      });
    },
    stopListening,
    async close(): Promise<void> {
      clearInterval(timer);
      await stopListening();
      outgoing = outgoing.then(flush, flush);
      await Promise.all([incoming, outgoing]);
    }
  };
}
