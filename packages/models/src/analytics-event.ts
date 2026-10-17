/**
 * Storage for anonymous product analytics received by the ingestion route.
 *
 * Callers pass envelopes that already passed `validateBatch` from
 * `@nodetool-ai/analytics`. This module stores the validated fields and
 * nothing else: it takes no request, header, IP address or user id. Raw rows
 * expire after {@link DEFAULT_ANALYTICS_RETENTION_DAYS}; the daily counts
 * carry no installation or session ID and are kept.
 *
 * See `schema/analytics.ts`.
 */

import { createHash, randomUUID } from "node:crypto";
import { count, lt, sql } from "drizzle-orm";
import { getPortableDb } from "./db.js";
import { analyticsDaily, analyticsEvents } from "./schema/analytics.js";

/** How long a raw event is kept before the retention sweep removes it. */
export const DEFAULT_ANALYTICS_RETENTION_DAYS = 30;

/** One validated analytics envelope, as the ingestion route hands it over. */
export interface AnalyticsEventInput {
  schemaVersion: number;
  event: string;
  clientType: string;
  anonymousId: string | null;
  sessionId: string | null;
  timestamp: string;
  appVersion: string;
  platform: string;
  properties: Record<string, string>;
}

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

/** Properties as JSON with sorted keys, so equal sets share one counter. */
function canonicalProperties(properties: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(properties).sort()) {
    sorted[key] = properties[key] ?? "";
  }
  return JSON.stringify(sorted);
}

/**
 * Store a validated batch: one raw row per event, and the matching daily
 * counters incremented. `receivedAt` only contributes its date.
 */
export async function recordAnalyticsEvents(
  events: readonly AnalyticsEventInput[],
  receivedAt: Date = new Date()
): Promise<void> {
  if (events.length === 0) return;
  const receivedDay = dayOf(receivedAt);
  const db = getPortableDb();

  await db.insert(analyticsEvents).values(
    events.map((event) => ({
      id: randomUUID().replace(/-/g, ""),
      schema_version: event.schemaVersion,
      event: event.event,
      client_type: event.clientType,
      anonymous_id: event.anonymousId,
      session_id: event.sessionId,
      event_hour: event.timestamp,
      app_version: event.appVersion,
      platform: event.platform,
      properties: canonicalProperties(event.properties),
      received_day: receivedDay
    }))
  );

  const counters = new Map<
    string,
    { row: typeof analyticsDaily.$inferInsert; increment: number }
  >();
  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const properties = canonicalProperties(event.properties);
    const key = [
      day,
      event.event,
      event.clientType,
      event.platform,
      event.appVersion,
      properties
    ].join("\n");
    const existing = counters.get(key);
    if (existing) {
      existing.increment += 1;
      continue;
    }
    counters.set(key, {
      increment: 1,
      row: {
        id: createHash("sha256").update(key).digest("hex").slice(0, 32),
        day,
        event: event.event,
        client_type: event.clientType,
        platform: event.platform,
        app_version: event.appVersion,
        properties,
        count: 1
      }
    });
  }
  for (const { row, increment } of counters.values()) {
    await db
      .insert(analyticsDaily)
      .values({ ...row, count: increment })
      .onConflictDoUpdate({
        target: analyticsDaily.id,
        set: { count: sql`${analyticsDaily.count} + ${increment}` }
      });
  }
}

/** Delete raw events received more than `retentionDays` ago. */
export async function pruneAnalyticsEvents(
  retentionDays: number = DEFAULT_ANALYTICS_RETENTION_DAYS,
  now: Date = new Date()
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error(`Invalid retention window: ${retentionDays}`);
  }
  const cutoff = dayOf(new Date(now.getTime() - retentionDays * 86_400_000));
  const db = getPortableDb();
  const [doomed] = await db
    .select({ n: count() })
    .from(analyticsEvents)
    .where(lt(analyticsEvents.received_day, cutoff));
  const total = Number(doomed?.n ?? 0);
  if (total === 0) return 0;
  await db.delete(analyticsEvents).where(lt(analyticsEvents.received_day, cutoff));
  return total;
}
