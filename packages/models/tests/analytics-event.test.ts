import { beforeEach, describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getPortableDb, initTestDb } from "../src/db.js";
import {
  pruneAnalyticsEvents,
  recordAnalyticsEvents,
  type AnalyticsEventInput
} from "../src/analytics-event.js";
import { analyticsDaily, analyticsEvents } from "../src/schema/analytics.js";

const event = (overrides: Partial<AnalyticsEventInput> = {}): AnalyticsEventInput => ({
  schemaVersion: 1,
  event: "workflow_run",
  clientType: "local_desktop",
  anonymousId: "3b241101-e2bb-4255-8caf-4136c566a962",
  sessionId: "6fa459ea-ee8a-4ca4-894e-db77e160355e",
  timestamp: "2026-10-17T21:00:00.000Z",
  appVersion: "0.8.4",
  platform: "macos",
  properties: { nodeCountBucket: "6-20", executionMode: "local" },
  ...overrides
});

beforeEach(() => {
  initTestDb();
});

describe("analytics tables", () => {
  it("have no column that could hold identity or request metadata", () => {
    const forbidden =
      /user|account|org|workspace|project|workflow_id|job|ip|address|agent|header|host|email|name|path|url|created_at|received_at/i;
    for (const table of [analyticsEvents, analyticsDaily]) {
      for (const column of Object.keys(getTableColumns(table))) {
        expect(column, column).not.toMatch(forbidden);
      }
    }
  });
});

describe("recordAnalyticsEvents", () => {
  it("stores raw rows with only a received date", async () => {
    await recordAnalyticsEvents([event()], new Date("2026-10-17T21:43:12.345Z"));
    const rows = await getPortableDb().select().from(analyticsEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: "workflow_run",
      client_type: "local_desktop",
      event_hour: "2026-10-17T21:00:00.000Z",
      received_day: "2026-10-17",
      properties: '{"executionMode":"local","nodeCountBucket":"6-20"}'
    });
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("counts per day and property set without any ID", async () => {
    await recordAnalyticsEvents([event(), event(), event({ platform: "linux" })]);
    await recordAnalyticsEvents([
      event({ properties: { executionMode: "local", nodeCountBucket: "6-20" } })
    ]);
    const daily = await getPortableDb().select().from(analyticsDaily);
    const counts = Object.fromEntries(daily.map((row) => [row.platform, row.count]));
    expect(counts).toEqual({ macos: 3, linux: 1 });
    expect(JSON.stringify(daily)).not.toContain("3b241101");
  });
});

describe("pruneAnalyticsEvents", () => {
  it("removes raw events after the retention window and keeps counts", async () => {
    await recordAnalyticsEvents([event()], new Date("2026-08-01T10:00:00Z"));
    await recordAnalyticsEvents([event()], new Date("2026-10-15T10:00:00Z"));
    const removed = await pruneAnalyticsEvents(30, new Date("2026-10-17T00:00:00Z"));
    expect(removed).toBe(1);
    expect(await getPortableDb().select().from(analyticsEvents)).toHaveLength(1);
    const daily = await getPortableDb().select().from(analyticsDaily);
    expect(daily.reduce((sum, row) => sum + row.count, 0)).toBe(2);
  });

  it("rejects a nonsensical window", async () => {
    await expect(pruneAnalyticsEvents(-1)).rejects.toThrow();
  });
});
