import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Anonymous product analytics received by the ingestion route
 * (`POST /api/analytics/v1/events` with `NODETOOL_ANALYTICS_INGEST=1`).
 *
 * Every row passed `validateBatch` from `@nodetool-ai/analytics` first, so it
 * holds only allowlisted events, enum property values and random client IDs.
 * There is deliberately no user, account, project or workflow column, and no
 * IP address, user agent, header or receive timestamp: `event_hour` is the
 * client's hour-truncated time and `received_day` is a date only, used for
 * the 30-day retention sweep.
 */
export const analyticsEvents = sqliteTable(
  "nodetool_analytics_events",
  {
    id: text("id").primaryKey(),
    schema_version: integer("schema_version").notNull(),
    event: text("event").notNull(),
    client_type: text("client_type").notNull(),
    anonymous_id: text("anonymous_id"),
    session_id: text("session_id"),
    event_hour: text("event_hour").notNull(),
    app_version: text("app_version").notNull(),
    platform: text("platform").notNull(),
    properties: text("properties").notNull(),
    received_day: text("received_day").notNull()
  },
  (table) => [
    index("idx_analytics_event_received_day").on(table.received_day),
    index("idx_analytics_event_name_hour").on(table.event, table.event_hour)
  ]
);

/**
 * Daily counts per event, client, platform, version and property set. Kept
 * after the raw rows expire, and carries no anonymous or session ID, so
 * long-term reporting needs no per-installation history. `id` is a hash of
 * the other key columns, which makes the counter an upsert.
 */
export const analyticsDaily = sqliteTable(
  "nodetool_analytics_daily",
  {
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    event: text("event").notNull(),
    client_type: text("client_type").notNull(),
    platform: text("platform").notNull(),
    app_version: text("app_version").notNull(),
    properties: text("properties").notNull(),
    count: integer("count").notNull()
  },
  (table) => [index("idx_analytics_daily_day_event").on(table.day, table.event)]
);
