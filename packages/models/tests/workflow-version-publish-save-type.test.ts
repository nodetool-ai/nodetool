/**
 * Publishing an app writes a `save_type: "publish"` row into the bound
 * workflow's version history. Databases that ran the 2026-01 autosave
 * migration carry a CHECK constraint that lists only the older save types, so
 * that insert failed and the publish with it. Fresh SQLite databases start
 * from the baseline, which has no constraint, so only a migrated database
 * shows the bug.
 */
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";

import { closeDb } from "../src/db.js";
import { Application, publishApplication } from "../src/application.js";
import { Project } from "../src/project.js";
import { Workflow } from "../src/workflow.js";
import { WorkflowVersion } from "../src/workflow-version.js";
import { SQLiteMigrationAdapter, migrations } from "../src/migrations/index.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";

const FIX_VERSION = "20261201_000001";
const fix = migrations.find((m) => m.version === FIX_VERSION);

afterEach(async () => {
  await closeDb();
});

describe("publish save type on a Postgres database built by the migration chain", () => {
  it("publishes an app over the owner's workflow", async () => {
    await initPgliteTestDb();
    await Project.create<Project>({ id: "p1", user_id: "u1", name: "P" });
    await Workflow.create<Workflow>({
      id: "wf1",
      user_id: "u1",
      name: "Demo workflow",
      graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }], edges: [] }
    });
    const document = createEmptyDocument("Demo");
    document.operations = [
      { id: "main", name: "Run", workflowId: "wf1", inputs: {}, outputs: {}, policy: "replace" }
    ];
    const app = await Application.create<Application>({
      user_id: "u1",
      project_id: "p1",
      name: "Demo app",
      document: JSON.stringify(document)
    });

    const release = await publishApplication(app);

    expect(release.document.operations[0]!.workflowVersion).toBe(1);
    expect((await WorkflowVersion.findByVersion("wf1", 1))?.save_type).toBe("publish");
  }, 60_000);
});

/** The table as the 2026-01 migrations left it on SQLite, with one row and its indexes. */
function migratedSqliteDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE nodetool_workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT,
      description TEXT,
      graph TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    ALTER TABLE nodetool_workflow_versions
      ADD COLUMN save_type TEXT DEFAULT 'manual' CHECK(save_type IN ('autosave', 'manual', 'checkpoint', 'restore'));
    ALTER TABLE nodetool_workflow_versions ADD COLUMN autosave_metadata TEXT DEFAULT '{}';
    CREATE INDEX idx_wv_workflow_id ON nodetool_workflow_versions (workflow_id);
    CREATE INDEX idx_nodetool_workflow_versions_save_type
      ON nodetool_workflow_versions (workflow_id, save_type, created_at);
    INSERT INTO nodetool_workflow_versions
      (id, workflow_id, user_id, graph, version, save_type, created_at)
    VALUES ('v1', 'wf1', 'u1', '{}', 1, 'autosave', '2026-02-01');
  `);
  return db;
}

const insertPublish = (db: Database.Database): void => {
  db.prepare(
    `INSERT INTO nodetool_workflow_versions
       (id, workflow_id, user_id, graph, version, save_type, created_at)
     VALUES ('v2', 'wf1', 'u1', '{}', 2, 'publish', '2026-03-01')`
  ).run();
};

describe("allow_publish_workflow_save_type on a migrated SQLite database", () => {
  it("is in the built-in migration list", () => {
    expect(fix?.name).toBe("allow_publish_workflow_save_type");
  });

  it("rejects a publish row before the migration", () => {
    expect(() => insertPublish(migratedSqliteDb())).toThrow(/CHECK constraint failed/);
  });

  it("accepts a publish row afterwards and keeps rows, defaults and indexes", async () => {
    const db = migratedSqliteDb();
    await fix!.up(new SQLiteMigrationAdapter(db));

    insertPublish(db);
    const rows = db
      .prepare("SELECT id, save_type, autosave_metadata FROM nodetool_workflow_versions ORDER BY id")
      .all();
    expect(rows).toEqual([
      { id: "v1", save_type: "autosave", autosave_metadata: "{}" },
      { id: "v2", save_type: "publish", autosave_metadata: "{}" }
    ]);
    const indexes = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'nodetool_workflow_versions' AND sql IS NOT NULL")
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(indexes.sort()).toEqual([
      "idx_nodetool_workflow_versions_save_type",
      "idx_wv_workflow_id"
    ]);
  });

  it("leaves a table without the constraint untouched and can run twice", async () => {
    const db = migratedSqliteDb();
    const adapter = new SQLiteMigrationAdapter(db);
    await fix!.up(adapter);
    const before = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'nodetool_workflow_versions'")
      .get();
    await fix!.up(adapter);
    expect(
      db.prepare("SELECT sql FROM sqlite_master WHERE name = 'nodetool_workflow_versions'").get()
    ).toEqual(before);
  });
});
