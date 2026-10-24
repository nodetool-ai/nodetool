import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { getPostgresClient, resolvePostgresClientOptions } from "./db.js";

const log = createLogger("nodetool.resource-change-channel");
const CHANNEL = "nodetool_resource_change";
export const NOTIFY_PAYLOAD_LIMIT = 7500;
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
      const next = outgoing.then(async () => {
        let notification = message;
        if (Buffer.byteLength(message, "utf8") > NOTIFY_PAYLOAD_LIMIT) {
          const id = randomUUID();
          await pool`INSERT INTO resource_change_outbox (id, payload, created_at) VALUES (${id}, ${message}, ${new Date().toISOString()})`;
          notification = JSON.stringify({ outbox_id: id });
        }
        await pool`SELECT pg_notify(${CHANNEL}, ${notification})`;
      });
      // Keep subsequent writes moving after a failed publication.
      outgoing = next.catch(() => {});
      return next;
    },
    stopListening,
    async close(): Promise<void> {
      clearInterval(timer);
      await stopListening();
      await Promise.all([incoming, outgoing]);
    }
  };
}
