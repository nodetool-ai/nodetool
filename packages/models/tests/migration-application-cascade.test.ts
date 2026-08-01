/**
 * The migration that ties an application's children to the application.
 *
 * The rows seeded here are what a database written before the foreign keys
 * looks like: children of an app that was deleted, children with no owner of
 * their own, and two snapshots sharing a version number.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

import {
  MigrationRunner,
  SQLiteMigrationAdapter
} from "../src/migrations/index.js";

/** The last migration before the cascade. */
const BEFORE_CASCADE = "20260726_000002";
const CASCADE = "20260801_000000";

const createAdapter = (): SQLiteMigrationAdapter => {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  return new SQLiteMigrationAdapter(db);
};

const seedApplication = (
  adapter: SQLiteMigrationAdapter,
  id: string,
  userId: string
): Promise<void> =>
  adapter.execute(
    `INSERT INTO applications
       (id, user_id, project_id, name, description, document, created_at, updated_at)
     VALUES (?, ?, 'default', ?, '', '{}', ?, ?)`,
    [
      id,
      userId,
      `App ${id}`,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    ]
  );

const seedVersion = (
  adapter: SQLiteMigrationAdapter,
  fields: {
    id: string;
    applicationId: string;
    version: number;
    released?: number;
    createdAt?: string;
  }
): Promise<void> =>
  adapter.execute(
    `INSERT INTO application_versions
       (id, application_id, version, document, capabilities, released, created_at)
     VALUES (?, ?, ?, '{}', '{}', ?, ?)`,
    [
      fields.id,
      fields.applicationId,
      fields.version,
      fields.released ?? 0,
      fields.createdAt ?? "2026-01-01T00:00:00.000Z"
    ]
  );

const seedInvocation = (
  adapter: SQLiteMigrationAdapter,
  id: string,
  applicationId: string
): Promise<void> =>
  adapter.execute(
    `INSERT INTO application_invocations
       (id, application_id, invocation_id, operation_id, estimated_usd, status, created_at)
     VALUES (?, ?, ?, 'main', 0, 'running', '2026-01-01T00:00:00.000Z')`,
    [id, applicationId, `job-${id}`]
  );

describe("cascade_and_own_application_children", () => {
  let adapter: SQLiteMigrationAdapter;
  let runner: MigrationRunner;

  beforeEach(async () => {
    adapter = createAdapter();
    runner = new MigrationRunner(adapter);
    await runner.migrate({ target: BEFORE_CASCADE });
    await seedApplication(adapter, "kept", "owner");
  });

  it("deletes children whose application is gone and backfills the rest", async () => {
    await seedVersion(adapter, {
      id: "v-kept",
      applicationId: "kept",
      version: 1,
      released: 1
    });
    await seedVersion(adapter, {
      id: "v-orphan",
      applicationId: "deleted",
      version: 1
    });
    await seedInvocation(adapter, "i-kept", "kept");
    await seedInvocation(adapter, "i-orphan", "deleted");
    await adapter.execute(
      `INSERT INTO application_budgets
         (application_id, period, max_usd, created_at, updated_at)
       VALUES ('deleted', 'total', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );

    expect(await runner.migrate()).toContain(CASCADE);

    expect(
      await adapter.fetchall("SELECT id, user_id FROM application_versions")
    ).toEqual([{ id: "v-kept", user_id: "owner" }]);
    expect(
      await adapter.fetchall("SELECT id, user_id FROM application_invocations")
    ).toEqual([{ id: "i-kept", user_id: "owner" }]);
    expect(await adapter.fetchall("SELECT * FROM application_budgets")).toEqual(
      []
    );
  });

  it("collapses duplicate versions and extra released rows", async () => {
    await seedVersion(adapter, {
      id: "v-old",
      applicationId: "kept",
      version: 1,
      released: 1,
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    await seedVersion(adapter, {
      id: "v-new",
      applicationId: "kept",
      version: 1,
      released: 1,
      createdAt: "2026-01-02T00:00:00.000Z"
    });
    await seedVersion(adapter, {
      id: "v-two",
      applicationId: "kept",
      version: 2,
      released: 1
    });

    await runner.migrate();

    // The newest of the two v1 rows survives, and only one row stays released.
    const rows = await adapter.fetchall(
      "SELECT id, version, released FROM application_versions ORDER BY version"
    );
    expect(rows).toEqual([
      { id: "v-new", version: 1, released: 0 },
      { id: "v-two", version: 2, released: 1 }
    ]);
  });

  it("leaves the children unreachable once the parent is deleted", async () => {
    await seedVersion(adapter, {
      id: "v-kept",
      applicationId: "kept",
      version: 1
    });
    await seedInvocation(adapter, "i-kept", "kept");

    await runner.migrate();

    // better-sqlite3 enforces foreign keys, so the declared cascade fires.
    await adapter.execute("DELETE FROM applications WHERE id = 'kept'");

    expect(
      await adapter.fetchall("SELECT * FROM application_versions")
    ).toEqual([]);
    expect(
      await adapter.fetchall("SELECT * FROM application_invocations")
    ).toEqual([]);
  });

  it("refuses a duplicate version number afterwards", async () => {
    await seedVersion(adapter, {
      id: "v1",
      applicationId: "kept",
      version: 1
    });
    await runner.migrate();

    await expect(
      seedVersion(adapter, {
        id: "v1-again",
        applicationId: "kept",
        version: 1
      })
    ).rejects.toThrow(/UNIQUE/i);
  });
});
