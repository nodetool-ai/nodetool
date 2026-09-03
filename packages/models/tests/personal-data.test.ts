/**
 * Erasure and export, exercised against a database seeded from the registry
 * itself.
 *
 * The seeding is generic on purpose: it walks `PERSONAL_DATA_REGISTRY`, reads
 * each table's columns from Drizzle, and writes one row per table reachable
 * from the subject. A table added to the registry is therefore seeded and
 * asserted on without anyone editing this file — the same reason the registry
 * exists in the first place.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Table, count, eq, getTableColumns, getTableName, is } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import * as schema from "../src/schema/index.js";
import { getDb, initTestDb } from "../src/db.js";
import {
  PERSONAL_DATA_REGISTRY,
  WITHHELD_VALUE,
  type PersonalDataEntry
} from "../src/personal-data-registry.js";
import {
  erasePersonalData,
  exportPersonalData,
  type ErasureObjectStore
} from "../src/personal-data.js";
import { predictions } from "../src/schema/predictions.js";
import { secrets } from "../src/schema/secrets.js";
import { userEvents } from "../src/schema/user-events.js";
import { workflowCollaborators } from "../src/schema/workflow-sharing.js";
import { UserEventType, recordUserEvent } from "../src/user-event.js";

const SUBJECT = "user-subject";
const OTHER = "user-other";

interface ColumnMeta {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  columnType: string;
}

const tablesByName = new Map<string, SQLiteTable>();
for (const value of Object.values(schema)) {
  if (!is(value as object, Table)) continue;
  tablesByName.set(getTableName(value as unknown as Table), value as SQLiteTable);
}

function columnsOf(table: SQLiteTable): ColumnMeta[] {
  return Object.values(getTableColumns(table)).map(
    (column) => column as unknown as ColumnMeta
  );
}

/** A value SQLite accepts for a required column, by Drizzle column type. */
function filler(column: ColumnMeta, tag: string): unknown {
  switch (column.columnType) {
    case "SQLiteInteger":
    case "SQLiteReal":
      return 1;
    case "SQLiteBoolean":
      return false;
    case "SQLiteCustomColumn":
      // Every custom column here is `jsonText`, which JSON-stringifies.
      return {};
    default:
      return `${tag}-${column.name}`;
  }
}

/** Ids the seeded rows are wired to, so foreign keys resolve. */
function links(tag: string): Record<string, string> {
  return {
    application_id: `${tag}-application`,
    run_id: `${tag}-job`,
    grant_id: `${tag}-grant`,
    workflow_id: `${tag}-workflow`,
    image_document_id: `${tag}-image-document`,
    js_script_id: `${tag}-js-script`,
    timeline_id: `${tag}-timeline-sequence`,
    project_id: `${tag}-project`,
    thread_id: `${tag}-thread`
  };
}

/** Ids the parents must be created with, so the links above point at them. */
function parentIds(tag: string): Record<string, string> {
  return {
    applications: `${tag}-application`,
    nodetool_jobs: `${tag}-job`,
    mcp_oauth_grants: `${tag}-grant`,
    nodetool_workflows: `${tag}-workflow`,
    image_documents: `${tag}-image-document`,
    js_scripts: `${tag}-js-script`,
    timeline_sequences: `${tag}-timeline-sequence`,
    projects: `${tag}-project`,
    nodetool_threads: `${tag}-thread`
  };
}

/** Parents before children, so a foreign key never dangles at insert time. */
const SEED_ORDER = [
  "nodetool_workflows",
  "projects",
  "nodetool_threads",
  "applications",
  "nodetool_jobs",
  "mcp_oauth_grants",
  "image_documents",
  "js_scripts",
  "timeline_sequences"
];

function orderedEntries(): PersonalDataEntry[] {
  return [...PERSONAL_DATA_REGISTRY].sort((a, b) => {
    const ia = SEED_ORDER.indexOf(a.table);
    const ib = SEED_ORDER.indexOf(b.table);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * Write one row per registry table, reachable from `userId`.
 *
 * `not-personal` tables are seeded too — erasure must leave them alone, and a
 * test that never creates them cannot notice if it does not.
 */
async function seedUser(userId: string, tag: string): Promise<void> {
  const db = getDb();
  const link = links(tag);
  const parents = parentIds(tag);

  for (const entry of orderedEntries()) {
    const table = tablesByName.get(entry.table);
    if (!table) throw new Error(`No schema table for ${entry.table}`);

    const row: Record<string, unknown> = {};
    for (const column of columnsOf(table)) {
      if (column.name === "id" && parents[entry.table]) {
        row.id = parents[entry.table];
        continue;
      }
      if (column.name === "id") {
        row.id = `${tag}-${entry.table}`;
        continue;
      }
      if (link[column.name] !== undefined) {
        row[column.name] = link[column.name];
        continue;
      }
      if (column.name === "user_id" || column.name === "created_by") {
        row[column.name] = userId;
        continue;
      }
      if (column.notNull && !column.hasDefault) {
        row[column.name] = filler(column, tag);
      }
    }

    // The columns the assertions below actually look at.
    if (entry.table === "nodetool_predictions") {
      row.parameters = { prompt: "a private prompt" };
      row.metadata = { note: "private" };
      row.logs = "a private log line";
      row.cost = 1.25;
      row.model = "gpt-4o-mini";
      row.created_at = "2026-01-01T00:00:00.000Z";
    }
    if (entry.table === "run_events") {
      row.payload = { prompt: "a private prompt", output: "a private answer" };
      row.event_time = "2026-01-01T00:00:00.000Z";
    }
    if (entry.table === "nodetool_secrets") {
      row.key = "OPENAI_API_KEY";
      row.encrypted_value = "ciphertext-never-exported";
    }
    if (entry.table === "nodetool_user_events") {
      row.event_type = UserEventType.SIGN_IN;
    }
    if (entry.table === "nodetool_user_subscriptions") {
      row.user_id = userId;
    }

    await db.insert(table).values(row);
  }
}

/** How many rows the subject still has in `entry`'s table. */
async function remaining(entry: PersonalDataEntry, tag: string): Promise<number> {
  const table = tablesByName.get(entry.table);
  if (!table || entry.reach.kind === "none") return 0;
  const columns = getTableColumns(table) as Record<string, never>;
  const column = columns[entry.reach.column];
  const value =
    entry.reach.kind === "direct" ? SUBJECT : links(tag)[entry.reach.column];
  const [row] = await getDb()
    .select({ value: count() })
    .from(table)
    .where(eq(column, value));
  return Number((row as { value: number } | undefined)?.value ?? 0);
}

async function rowCount(table: SQLiteTable): Promise<number> {
  const [row] = await getDb().select({ value: count() }).from(table);
  return Number((row as { value: number } | undefined)?.value ?? 0);
}

describe("erasePersonalData", () => {
  beforeEach(async () => {
    initTestDb();
    await seedUser(SUBJECT, "s");
    await seedUser(OTHER, "o");
  });

  it("seeds a row in every registered table", async () => {
    // Positive control: the assertions below are vacuous against an empty DB.
    const empty: string[] = [];
    for (const entry of PERSONAL_DATA_REGISTRY) {
      const table = tablesByName.get(entry.table);
      if (table && (await rowCount(table)) === 0) empty.push(entry.table);
    }
    expect(empty).toEqual([]);
    expect(PERSONAL_DATA_REGISTRY.length).toBeGreaterThanOrEqual(40);
  });

  it("removes the subject's rows from every delete table", async () => {
    await erasePersonalData(SUBJECT);
    const left: string[] = [];
    for (const entry of PERSONAL_DATA_REGISTRY) {
      if (entry.disposition !== "delete") continue;
      if ((await remaining(entry, "s")) !== 0) left.push(entry.table);
    }
    expect(left).toEqual([]);
  });

  it("reaches the run-scoped tables that have no user_id", async () => {
    // The failure this guards: deleting nodetool_jobs first, which orphans
    // run_events and leaves prompt text unreachable and undeleted.
    const indirect = PERSONAL_DATA_REGISTRY.filter(
      (entry) => entry.reach.kind === "indirect"
    );
    expect(indirect.map((entry) => entry.table).sort()).toEqual([
      "application_budgets",
      "mcp_oauth_tokens",
      "run_events",
      "run_inbox_messages",
      "trigger_inputs"
    ]);
    await erasePersonalData(SUBJECT);
    for (const entry of indirect) {
      expect([entry.table, await remaining(entry, "s")]).toEqual([
        entry.table,
        0
      ]);
    }
  });

  it("redacts a prediction's payload and keeps its billing columns", async () => {
    await erasePersonalData(SUBJECT);
    const [row] = await getDb()
      .select()
      .from(predictions)
      .where(eq(predictions.user_id, SUBJECT));
    const prediction = row as Record<string, unknown>;
    expect(prediction).toBeDefined();
    expect(prediction.parameters).toBeNull();
    expect(prediction.metadata).toBeNull();
    expect(prediction.logs).toBeNull();
    expect(prediction.cost).toBe(1.25);
    expect(prediction.model).toBe("gpt-4o-mini");
    expect(prediction.user_id).toBe(SUBJECT);
  });

  it("keeps consent and data-subject-request events, drops the rest", async () => {
    await recordUserEvent({
      userId: SUBJECT,
      eventType: UserEventType.CONSENT_GIVEN,
      metadata: { policy: "privacy", policy_version: "2026-01" }
    });
    await recordUserEvent({
      userId: SUBJECT,
      eventType: UserEventType.DATA_ERASURE_REQUESTED,
      metadata: { request_id: "dsr-1" }
    });

    await erasePersonalData(SUBJECT, { requestId: "dsr-1" });

    const rows = (await getDb()
      .select()
      .from(userEvents)
      .where(eq(userEvents.user_id, SUBJECT))) as { event_type: string }[];
    const types = rows.map((row) => row.event_type).sort();
    expect(types).toEqual([
      "consent_given",
      "data_erasure_completed",
      "data_erasure_requested"
    ]);
    // The sign_in row seeded for the subject is operational, so it went.
    expect(types).not.toContain("sign_in");
  });

  it("purges the evidence only when explicitly told to", async () => {
    await recordUserEvent({
      userId: SUBJECT,
      eventType: UserEventType.CONSENT_GIVEN,
      metadata: { policy: "privacy" }
    });
    await erasePersonalData(SUBJECT, { purgeComplianceEvidence: true });
    const [row] = await getDb()
      .select({ value: count() })
      .from(userEvents)
      .where(eq(userEvents.user_id, SUBJECT));
    expect(Number((row as { value: number }).value)).toBe(0);
  });

  it("leaves every other user's rows alone", async () => {
    await erasePersonalData(SUBJECT);
    const missing: string[] = [];
    for (const entry of PERSONAL_DATA_REGISTRY) {
      if (entry.reach.kind === "none") continue;
      const table = tablesByName.get(entry.table);
      if (!table) continue;
      const columns = getTableColumns(table) as Record<string, never>;
      const value =
        entry.reach.kind === "direct" ? OTHER : links("o")[entry.reach.column];
      const [row] = await getDb()
        .select({ value: count() })
        .from(table)
        .where(eq(columns[entry.reach.column], value));
      if (Number((row as { value: number }).value) !== 1) {
        missing.push(entry.table);
      }
    }
    expect(missing).toEqual([]);
  });

  it("leaves the infrastructure tables alone", async () => {
    await erasePersonalData(SUBJECT);
    for (const entry of PERSONAL_DATA_REGISTRY) {
      if (entry.disposition !== "not-personal") continue;
      const table = tablesByName.get(entry.table);
      if (!table) continue;
      expect([entry.table, await rowCount(table)]).toEqual([entry.table, 2]);
    }
  });

  it("is idempotent", async () => {
    const first = await erasePersonalData(SUBJECT);
    expect(first.deleted).toBeGreaterThan(0);
    expect(first.redacted).toBe(1);

    const second = await erasePersonalData(SUBJECT);
    expect(second.deleted).toBe(0);
    expect(second.redacted).toBe(0);
    expect(second.retained).toBe(first.retained);

    const left: string[] = [];
    for (const entry of PERSONAL_DATA_REGISTRY) {
      if (entry.disposition !== "delete") continue;
      if ((await remaining(entry, "s")) !== 0) left.push(entry.table);
    }
    expect(left).toEqual([]);
  });

  it("reports what it did, per table", async () => {
    const report = await erasePersonalData(SUBJECT);
    const byTable = new Map(report.tables.map((row) => [row.table, row]));
    expect(byTable.get("nodetool_messages")?.deleted).toBe(1);
    expect(byTable.get("run_events")?.deleted).toBe(1);
    expect(byTable.get("nodetool_predictions")?.redacted).toBe(1);
    expect(byTable.get("nodetool_credit_ledger")?.retained).toBe(1);
    expect(byTable.get("nodetool_credit_ledger")?.deleted).toBe(0);
    // Every actionable registry entry appears in the report exactly once.
    expect(report.tables.length).toBe(
      PERSONAL_DATA_REGISTRY.filter(
        (entry) => entry.disposition !== "not-personal"
      ).length
    );
  });

  it("says the blobs were skipped when no object store is injected", async () => {
    const report = await erasePersonalData(SUBJECT);
    expect(report.objectKeysDeleted).toBeNull();
  });

  it("deletes the subject's stored objects through the injected store", async () => {
    const asked: string[] = [];
    const store: ErasureObjectStore = {
      async deleteObjectsForUser(userId) {
        asked.push(userId);
        return [`${userId}/asset-1.png`, `${userId}/asset-1_thumb.jpg`];
      }
    };
    const report = await erasePersonalData(SUBJECT, { objectStore: store });
    expect(asked).toEqual([SUBJECT]);
    expect(report.objectKeysDeleted).toEqual([
      "user-subject/asset-1.png",
      "user-subject/asset-1_thumb.jpg"
    ]);
  });
});

describe("exportPersonalData", () => {
  beforeEach(async () => {
    initTestDb();
    await seedUser(SUBJECT, "s");
    await seedUser(OTHER, "o");
    // Someone else, collaborating on the subject's workflow. Reachable from
    // the subject through `workflow_id`, and not theirs to receive — so every
    // assertion below runs against a database where the leak is possible.
    await getDb().insert(workflowCollaborators).values({
      id: "collab-foreign",
      workflow_id: "s-workflow",
      user_id: OTHER,
      role: "viewer",
      invited_by: SUBJECT,
      created_at: "2026-01-01T00:00:00.000Z"
    });
  });

  it("returns a row for every exported table", async () => {
    const dump = await exportPersonalData(SUBJECT);
    const empty = PERSONAL_DATA_REGISTRY.filter(
      (entry) => entry.exported && dump.tables[entry.table]?.rowCount !== 1
    ).map((entry) => entry.table);
    expect(empty).toEqual([]);
    expect(Object.keys(dump.tables).length).toBeGreaterThanOrEqual(30);
  });

  it("never emits a secret, a token or a hash in plaintext", async () => {
    const dump = await exportPersonalData(SUBJECT);
    const serialized = JSON.stringify(dump);

    expect(dump.tables.nodetool_secrets.rows[0].key).toBe("OPENAI_API_KEY");
    expect(dump.tables.nodetool_secrets.rows[0].encrypted_value).toBe(
      WITHHELD_VALUE
    );
    expect(serialized).not.toContain("ciphertext-never-exported");

    // Every column any entry marked withheld is blanked, not just the ones
    // this test names.
    for (const entry of PERSONAL_DATA_REGISTRY) {
      for (const column of entry.withheldColumns ?? []) {
        const rows = dump.tables[entry.table]?.rows ?? [];
        for (const row of rows) {
          expect([entry.table, column, row[column]]).toEqual([
            entry.table,
            column,
            WITHHELD_VALUE
          ]);
        }
      }
    }
    // The seeded plaintext for those columns must be gone from the payload.
    expect(serialized).not.toContain("s-secret_hash");
    expect(serialized).not.toContain("s-token");
  });

  it("still confirms the withheld records exist", async () => {
    const dump = await exportPersonalData(SUBJECT);
    expect(dump.tables.nodetool_secrets.withheldColumns).toEqual([
      "encrypted_value"
    ]);
    expect(dump.tables.nodetool_oauth_credentials.rows[0].provider).toBe(
      "s-provider"
    );
  });

  it("excludes other users' data reachable through the sharing tables", async () => {
    const dump = await exportPersonalData(SUBJECT);
    const rows = dump.tables.nodetool_workflow_collaborators.rows;
    expect(rows.map((row) => row.user_id)).toEqual([SUBJECT]);
    expect(JSON.stringify(dump)).not.toContain("collab-foreign");

    // …and erasure still removes it, because it points at a deleted graph.
    await erasePersonalData(SUBJECT);
    const [row] = await getDb()
      .select({ value: count() })
      .from(workflowCollaborators)
      .where(eq(workflowCollaborators.workflow_id, "s-workflow"));
    expect(Number((row as { value: number }).value)).toBe(0);
  });

  it("carries no row belonging to another user", async () => {
    const dump = await exportPersonalData(SUBJECT);
    const leaked: string[] = [];
    for (const [table, payload] of Object.entries(dump.tables)) {
      for (const row of payload.rows) {
        if (row.user_id !== undefined && row.user_id !== SUBJECT) {
          leaked.push(`${table}.user_id=${String(row.user_id)}`);
        }
        if (row.created_by !== undefined && row.created_by !== SUBJECT) {
          leaked.push(`${table}.created_by=${String(row.created_by)}`);
        }
      }
    }
    expect(leaked).toEqual([]);
    expect(JSON.stringify(dump)).not.toContain(OTHER);
  });

  it("says which tables it left out and why", async () => {
    const dump = await exportPersonalData(SUBJECT);
    const excluded = dump.excluded.map((row) => row.table).sort();
    expect(excluded).toEqual([
      "mcp_oauth_clients",
      "mcp_oauth_tokens",
      "nodetool_team_tasks",
      "run_inbox_messages",
      "worker_instances",
      "worker_profiles"
    ]);
    expect(dump.excluded.every((row) => row.reason.length > 40)).toBe(true);
  });

  it("caps a table and says so", async () => {
    const dump = await exportPersonalData(SUBJECT, { maxRowsPerTable: 1 });
    expect(dump.tables.nodetool_messages.rowCount).toBe(1);
    expect(dump.tables.nodetool_messages.truncated).toBe(true);
  });

  it("exports the encrypted secret column as present but blanked", async () => {
    const [row] = await getDb()
      .select()
      .from(secrets)
      .where(eq(secrets.user_id, SUBJECT));
    expect((row as Record<string, unknown>).encrypted_value).toBe(
      "ciphertext-never-exported"
    );
  });
});
