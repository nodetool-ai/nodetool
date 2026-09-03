import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { ModelObserver } from "../src/base-model.js";
import { getRawDb, initTestDb } from "../src/db.js";
import { SQLiteMigrationAdapter, migrations } from "../src/migrations/index.js";
import { userEvents } from "../src/schema/user-events.js";
import {
  DEFAULT_USER_EVENT_RETENTION_DAYS,
  MAX_USER_EVENT_STRING_LENGTH,
  NEVER_PRUNED_USER_EVENT_TYPES,
  USER_EVENT_METADATA_ALLOWLIST,
  UserEventType,
  deleteUserEventsForUser,
  isNeverPrunedUserEventType,
  isUserEventType,
  listUserEvents,
  pruneUserEvents,
  recordUserEvent,
  sanitizeUserEventMetadata
} from "../src/user-event.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The compliance-evidence event types, written out rather than read from
 * `NEVER_PRUNED_USER_EVENT_TYPES`. Deriving this from the production constant
 * would make the carve-out tests agree with whatever the constant says —
 * dropping a type from it would shrink the test instead of failing it.
 */
const EXPECTED_NEVER_PRUNED = [
  "consent_given",
  "consent_withdrawn",
  "terms_accepted",
  "data_export_requested",
  "data_erasure_requested",
  "data_erasure_completed"
] as const;

/** ISO timestamp `days` in the past. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * `initTestDb()` already creates the table from the schema SQL in `db.ts`.
 * Running the migration on top of it is what pins the two definitions
 * together: if `create_user_events` ever stops being idempotent, or drifts
 * from the `db.ts` shape, every test below fails here rather than in
 * production on a database that took the migration path.
 */
async function setupDb(): Promise<void> {
  initTestDb();
  const migration = migrations.find((m) => m.name === "create_user_events");
  if (!migration) {
    throw new Error("create_user_events migration is missing from versions.ts");
  }
  await migration.up(new SQLiteMigrationAdapter(getRawDb()));
}

describe("user_events schema", () => {
  beforeEach(() => setupDb());
  afterEach(() => ModelObserver.clear());

  it("has exactly the seven privacy-scoped columns and no more", () => {
    expect(Object.keys(getTableColumns(userEvents)).sort()).toEqual([
      "created_at",
      "event_type",
      "id",
      "metadata",
      "subject_id",
      "subject_type",
      "user_id"
    ]);
  });

  it("carries no IP address, user agent, or free-text column", () => {
    const columns = Object.keys(getTableColumns(userEvents));
    for (const forbidden of [
      "ip",
      "ip_address",
      "user_agent",
      "note",
      "notes",
      "description",
      "message",
      "comment",
      "prompt",
      "content",
      "body",
      "text"
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });
});

describe("user event vocabulary", () => {
  it("recognizes every declared type and nothing else", () => {
    for (const type of Object.values(UserEventType)) {
      expect(isUserEventType(type)).toBe(true);
    }
    expect(isUserEventType("page_view")).toBe(false);
    expect(isUserEventType("node_dragged")).toBe(false);
    expect(isUserEventType(undefined)).toBe(false);
  });

  it("gives every event type an explicit metadata allowlist", () => {
    for (const type of Object.values(UserEventType)) {
      expect(USER_EVENT_METADATA_ALLOWLIST[type]).toBeDefined();
      expect(Array.isArray(USER_EVENT_METADATA_ALLOWLIST[type])).toBe(true);
    }
  });

  it("marks exactly the consent, policy and DSR types as never pruned", () => {
    expect([...NEVER_PRUNED_USER_EVENT_TYPES].sort()).toEqual(
      [...EXPECTED_NEVER_PRUNED].sort()
    );
    for (const type of EXPECTED_NEVER_PRUNED) {
      expect(isNeverPrunedUserEventType(type)).toBe(true);
    }
    // Auth and audit-trail events are on the 180-day clock, not exempt.
    for (const type of [
      UserEventType.SIGN_IN,
      UserEventType.ACCESS_TOKEN_ISSUED,
      UserEventType.WORKFLOW_DELETED,
      UserEventType.APP_PUBLISHED
    ]) {
      expect(isNeverPrunedUserEventType(type)).toBe(false);
    }
  });

  it("allowlists no key that reads as free text", () => {
    const freeText = [
      "note",
      "notes",
      "description",
      "message",
      "comment",
      "prompt",
      "content",
      "body",
      "text",
      "query",
      "input",
      "output",
      "graph",
      "value",
      "secret_value",
      "ip",
      "ip_address",
      "user_agent"
    ];
    for (const [type, keys] of Object.entries(
      USER_EVENT_METADATA_ALLOWLIST
    )) {
      for (const key of keys) {
        expect(
          freeText.includes(key),
          `${type} allowlists free-text key "${key}"`
        ).toBe(false);
      }
    }
  });
});

describe("sanitizeUserEventMetadata", () => {
  it("keeps allowlisted scalars and drops everything else", () => {
    const kept = sanitizeUserEventMetadata(UserEventType.SIGN_IN, {
      method: "oauth",
      provider: "google",
      // Not on sign_in's allowlist — the smuggling case this table exists to
      // prevent.
      prompt: "write me a poem about my medical history",
      email: "someone@example.com",
      graph: { nodes: [] }
    });
    expect(kept).toEqual({ method: "oauth", provider: "google" });
  });

  it("drops non-scalar values on allowlisted keys", () => {
    expect(
      sanitizeUserEventMetadata(UserEventType.APP_DEPLOYED, {
        application_id: { id: "nested" },
        version: [1, 2, 3],
        target: null
      })
    ).toBeNull();
  });

  it("drops non-finite numbers and empty strings", () => {
    expect(
      sanitizeUserEventMetadata(UserEventType.WORKFLOW_SHARED, {
        recipient_count: Number.NaN,
        share_scope: ""
      })
    ).toBeNull();

    expect(
      sanitizeUserEventMetadata(UserEventType.WORKFLOW_SHARED, {
        recipient_count: 0,
        share_scope: "link"
      })
    ).toEqual({ recipient_count: 0, share_scope: "link" });
  });

  it("drops a string long enough to be prose rather than a fact", () => {
    const prose = "a".repeat(MAX_USER_EVENT_STRING_LENGTH + 1);
    expect(
      sanitizeUserEventMetadata(UserEventType.SIGN_IN, { method: prose })
    ).toBeNull();

    const atLimit = "b".repeat(MAX_USER_EVENT_STRING_LENGTH);
    expect(
      sanitizeUserEventMetadata(UserEventType.SIGN_IN, { method: atLimit })
    ).toEqual({ method: atLimit });
  });

  it("scopes the allowlist per event type", () => {
    // `provider` is a sign_in fact, not a workflow_deleted one.
    expect(
      sanitizeUserEventMetadata(UserEventType.WORKFLOW_DELETED, {
        provider: "google",
        soft_delete: true
      })
    ).toEqual({ soft_delete: true });
  });

  it("returns null for absent or empty metadata", () => {
    expect(sanitizeUserEventMetadata(UserEventType.SIGN_OUT, undefined)).toBeNull();
    expect(sanitizeUserEventMetadata(UserEventType.SIGN_OUT, null)).toBeNull();
    expect(sanitizeUserEventMetadata(UserEventType.SIGN_OUT, {})).toBeNull();
  });
});

describe("recordUserEvent", () => {
  beforeEach(() => setupDb());
  afterEach(() => ModelObserver.clear());

  it("stores only the allowlisted metadata, not what the caller passed", async () => {
    const recorded = await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SECRET_WRITTEN,
      subjectType: "secret",
      subjectId: "secret-1",
      metadata: {
        secret_name: "OPENAI_API_KEY",
        secret_value: "sk-live-should-never-be-logged",
        note: "rotated after the incident"
      }
    });

    expect(recorded).not.toBeNull();
    const [stored] = await listUserEvents("user-a");
    expect(stored.metadata).toEqual({ secret_name: "OPENAI_API_KEY" });
    expect(JSON.stringify(stored)).not.toContain("sk-live");
    expect(JSON.stringify(stored)).not.toContain("rotated after");
  });

  it("stores null metadata when nothing survives the allowlist", async () => {
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN,
      metadata: { utm_source: "newsletter", session_duration_ms: 44012 }
    });

    const [stored] = await listUserEvents("user-a");
    expect(stored.metadata).toBeNull();
  });

  it("drops a subject id long enough to be prose", async () => {
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.ASSET_DELETED,
      subjectType: "asset",
      subjectId: "x".repeat(MAX_USER_EVENT_STRING_LENGTH + 1)
    });

    const [stored] = await listUserEvents("user-a");
    expect(stored.subject_type).toBe("asset");
    expect(stored.subject_id).toBeNull();
  });

  it("refuses an unknown event type", async () => {
    const recorded = await recordUserEvent({
      userId: "user-a",
      // Behavioral analytics has no business in this table.
      eventType: "page_view" as never
    });
    expect(recorded).toBeNull();
    expect(await listUserEvents("user-a")).toHaveLength(0);
  });

  it("refuses an event with no user id", async () => {
    const recorded = await recordUserEvent({
      userId: "",
      eventType: UserEventType.SIGN_IN
    });
    expect(recorded).toBeNull();
  });

  it("never throws into the caller when the write fails", async () => {
    // A sign-out must not fail because the audit table is unreachable.
    getRawDb().exec("DROP TABLE nodetool_user_events");

    await expect(
      recordUserEvent({ userId: "user-a", eventType: UserEventType.SIGN_OUT })
    ).resolves.toBeNull();
  });
});

describe("listUserEvents", () => {
  beforeEach(async () => {
    await setupDb();
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN,
      createdAt: daysAgo(10)
    });
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.WORKFLOW_DELETED,
      subjectType: "workflow",
      subjectId: "wf-1",
      createdAt: daysAgo(5)
    });
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.CONSENT_GIVEN,
      metadata: { policy: "marketing", policy_version: "2026-01" },
      createdAt: daysAgo(1)
    });
    await recordUserEvent({
      userId: "user-b",
      eventType: UserEventType.SIGN_IN,
      createdAt: daysAgo(2)
    });
  });
  afterEach(() => ModelObserver.clear());

  it("returns one user's events, newest first", async () => {
    const rows = await listUserEvents("user-a");
    expect(rows.map((r) => r.event_type)).toEqual([
      "consent_given",
      "workflow_deleted",
      "sign_in"
    ]);
    expect(rows.every((r) => r.user_id === "user-a")).toBe(true);
  });

  it("honors the limit", async () => {
    const rows = await listUserEvents("user-a", { limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].event_type).toBe("consent_given");
  });

  it("filters by event type", async () => {
    const rows = await listUserEvents("user-a", {
      eventTypes: [UserEventType.SIGN_IN, UserEventType.CONSENT_GIVEN]
    });
    expect(rows.map((r) => r.event_type)).toEqual([
      "consent_given",
      "sign_in"
    ]);
  });

  it("filters by time range", async () => {
    const rows = await listUserEvents("user-a", {
      since: daysAgo(7),
      until: daysAgo(2)
    });
    expect(rows.map((r) => r.event_type)).toEqual(["workflow_deleted"]);
  });

  it("round-trips the subject columns and metadata", async () => {
    const [deleted] = await listUserEvents("user-a", {
      eventTypes: [UserEventType.WORKFLOW_DELETED]
    });
    expect(deleted.subject_type).toBe("workflow");
    expect(deleted.subject_id).toBe("wf-1");

    const [consent] = await listUserEvents("user-a", {
      eventTypes: [UserEventType.CONSENT_GIVEN]
    });
    expect(consent.metadata).toEqual({
      policy: "marketing",
      policy_version: "2026-01"
    });
  });

  it("returns nothing for a user with no events", async () => {
    expect(await listUserEvents("nobody")).toEqual([]);
  });
});

describe("deleteUserEventsForUser", () => {
  beforeEach(() => setupDb());
  afterEach(() => ModelObserver.clear());

  it("removes one user's rows, including the never-pruned ones, and counts them", async () => {
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN
    });
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.CONSENT_GIVEN,
      metadata: { policy: "marketing" }
    });
    await recordUserEvent({
      userId: "user-b",
      eventType: UserEventType.SIGN_IN
    });

    expect(await deleteUserEventsForUser("user-a")).toBe(2);
    expect(await listUserEvents("user-a")).toEqual([]);
    expect(await listUserEvents("user-b")).toHaveLength(1);
  });

  it("returns 0 when the user has no events", async () => {
    expect(await deleteUserEventsForUser("nobody")).toBe(0);
  });
});

describe("pruneUserEvents", () => {
  beforeEach(() => setupDb());
  afterEach(() => {
    ModelObserver.clear();
    vi.useRealTimers();
  });

  it("drops auth and audit-trail events past the retention window", async () => {
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN,
      createdAt: daysAgo(400)
    });
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.WORKFLOW_DELETED,
      createdAt: daysAgo(200)
    });
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.ACCESS_TOKEN_REVOKED,
      createdAt: daysAgo(10)
    });

    expect(await pruneUserEvents()).toBe(2);
    expect((await listUserEvents("user-a")).map((r) => r.event_type)).toEqual([
      "access_token_revoked"
    ]);
  });

  it("never prunes consent, policy or DSR events, however old", async () => {
    for (const eventType of EXPECTED_NEVER_PRUNED) {
      await recordUserEvent({
        userId: "user-a",
        eventType,
        createdAt: daysAgo(5000)
      });
    }
    // One prunable neighbour of the same age, so a sweep that ignored the
    // carve-out would have taken everything.
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN,
      createdAt: daysAgo(5000)
    });

    expect(await pruneUserEvents()).toBe(1);

    const survivors = await listUserEvents("user-a", { limit: 100 });
    expect(survivors.map((r) => r.event_type).sort()).toEqual(
      [...EXPECTED_NEVER_PRUNED].sort()
    );
    for (const row of survivors) {
      expect(isNeverPrunedUserEventType(row.event_type)).toBe(true);
    }
  });

  it("defaults to a 180-day window", async () => {
    expect(DEFAULT_USER_EVENT_RETENTION_DAYS).toBe(180);

    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN,
      createdAt: daysAgo(179)
    });
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_OUT,
      createdAt: daysAgo(181)
    });

    expect(await pruneUserEvents()).toBe(1);
    expect((await listUserEvents("user-a")).map((r) => r.event_type)).toEqual([
      "sign_in"
    ]);
  });

  it("honors an explicit window and reports 0 when nothing is stale", async () => {
    await recordUserEvent({
      userId: "user-a",
      eventType: UserEventType.SIGN_IN,
      createdAt: daysAgo(10)
    });

    expect(await pruneUserEvents(30)).toBe(0);
    expect(await pruneUserEvents(7)).toBe(1);
  });

  it("rejects a nonsensical retention window", async () => {
    await expect(pruneUserEvents(-1)).rejects.toThrow(/Invalid retention/);
    await expect(pruneUserEvents(Number.NaN)).rejects.toThrow(
      /Invalid retention/
    );
  });
});
