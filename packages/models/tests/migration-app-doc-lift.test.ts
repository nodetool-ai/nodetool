/**
 * The one-time lift of `workflow.app_doc` into the applications table.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { APP_SCHEMA_VERSION } from "@nodetool-ai/app-runtime";
import {
  MigrationRunner,
  SQLiteMigrationAdapter,
  migrations
} from "../src/migrations/index.js";

/** The last migration before the lift. */
const BEFORE_LIFT = "20260726_000001";
const LIFT = "20260726_000002";

const createAdapter = (): SQLiteMigrationAdapter => {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  return new SQLiteMigrationAdapter(db);
};

const appDoc = (title: string, workflowId = "") => ({
  schemaVersion: 3,
  ui: { root: { props: { title } }, content: [{ type: "Button" }], zones: {} },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ],
  resources: [],
  variables: []
});

const seedWorkflow = async (
  adapter: SQLiteMigrationAdapter,
  id: string,
  doc: unknown
): Promise<void> => {
  await adapter.execute(
    `INSERT INTO nodetool_workflows
       (id, user_id, name, description, app_doc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      "u1",
      `Workflow ${id}`,
      "seeded",
      JSON.stringify(doc),
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z"
    ]
  );
};

describe("lift_workflow_app_docs_to_applications", () => {
  let adapter: SQLiteMigrationAdapter;
  let runner: MigrationRunner;

  beforeEach(async () => {
    adapter = createAdapter();
    runner = new MigrationRunner(adapter);
    await runner.migrate({ target: BEFORE_LIFT });
  });

  it("turns a seeded app_doc into an application and clears the column", async () => {
    await seedWorkflow(adapter, "wf1", appDoc("Greeter"));

    const applied = await runner.migrate();
    expect(applied).toContain(LIFT);

    const apps = await adapter.fetchall("SELECT * FROM applications");
    expect(apps).toHaveLength(1);
    expect(apps[0].name).toBe("Workflow wf1");
    expect(apps[0].user_id).toBe("u1");
    expect(apps[0].project_id).toBe("default");

    const document = JSON.parse(String(apps[0].document));
    // The lift parses through the app-runtime parser, so a v3 `app_doc` comes
    // out at today's schema version.
    expect(document.schemaVersion).toBe(APP_SCHEMA_VERSION);
    expect(document.ui.root.props.title).toBe("Greeter");
    // The empty `workflowId` binds to the workflow that hosted the document.
    expect(document.operations).toEqual([
      {
        id: "main",
        name: "Run",
        workflowId: "wf1",
        workflowVersion: undefined,
        inputs: {},
        outputs: {},
        policy: "replace",
        timeoutMs: undefined
      }
    ]);

    const workflow = await adapter.fetchone(
      "SELECT app_doc FROM nodetool_workflows WHERE id = ?",
      ["wf1"]
    );
    expect(workflow?.app_doc).toBeNull();

    // No application_versions row: a lifted app has no history to archive.
    const versions = await adapter.fetchall(
      "SELECT * FROM application_versions"
    );
    expect(versions).toHaveLength(0);
  });

  it("archives the app_doc as a draft version when an application already binds the workflow", async () => {
    const forked = appDoc("Newer app", "wf2");
    await adapter.execute(
      `INSERT INTO applications
         (id, user_id, project_id, name, description, document, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "app-existing",
        "u1",
        "p1",
        "Newer app",
        "",
        JSON.stringify(forked),
        "2026-02-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z"
      ]
    );
    await seedWorkflow(adapter, "wf2", appDoc("Older doc"));

    await runner.migrate();

    // The application wins: still one row, its draft untouched.
    const apps = await adapter.fetchall("SELECT * FROM applications");
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("app-existing");
    expect(JSON.parse(String(apps[0].document))).toEqual(forked);

    // The fork is visible in the version history as an unreleased draft.
    const versions = await adapter.fetchall(
      "SELECT * FROM application_versions"
    );
    expect(versions).toHaveLength(1);
    expect(versions[0].application_id).toBe("app-existing");
    expect(versions[0].version).toBe(1);
    expect(versions[0].released).toBe(0);
    const archived = JSON.parse(String(versions[0].document));
    expect(archived.ui.root.props.title).toBe("Older doc");
    expect(archived.operations[0].workflowId).toBe("wf2");
    expect(JSON.parse(String(versions[0].capabilities))).toEqual({
      workflows: [{ workflowId: "wf2" }],
      resources: []
    });

    const workflow = await adapter.fetchone(
      "SELECT app_doc FROM nodetool_workflows WHERE id = ?",
      ["wf2"]
    );
    expect(workflow?.app_doc).toBeNull();
  });

  it("numbers the archived draft after existing versions", async () => {
    await adapter.execute(
      `INSERT INTO applications
         (id, user_id, project_id, name, description, document, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "app-released",
        "u1",
        "p1",
        "Released app",
        "",
        JSON.stringify(appDoc("Released", "wf3")),
        "2026-02-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z"
      ]
    );
    await adapter.execute(
      `INSERT INTO application_versions
         (id, application_id, version, document, capabilities, released, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        "ver-1",
        "app-released",
        1,
        JSON.stringify(appDoc("Released", "wf3")),
        "{}",
        1,
        "2026-02-02T00:00:00.000Z"
      ]
    );
    await seedWorkflow(adapter, "wf3", appDoc("Fork"));

    await runner.migrate();

    const versions = await adapter.fetchall(
      "SELECT * FROM application_versions ORDER BY version"
    );
    expect(versions.map((v) => [v.version, v.released])).toEqual([
      [1, 1],
      [2, 0]
    ]);
  });

  it("is idempotent — a second run migrates nothing", async () => {
    await seedWorkflow(adapter, "wf4", appDoc("Once"));
    await runner.migrate();

    const lift = migrations.find((m) => m.version === LIFT);
    expect(lift).toBeDefined();
    await lift!.up(adapter);

    const apps = await adapter.fetchall("SELECT id FROM applications");
    expect(apps).toHaveLength(1);
    const versions = await adapter.fetchall(
      "SELECT id FROM application_versions"
    );
    expect(versions).toHaveLength(0);
  });

  it("clears an unparseable app_doc without creating an application", async () => {
    await adapter.execute(
      `INSERT INTO nodetool_workflows (id, user_id, name, app_doc)
       VALUES (?, ?, ?, ?)`,
      ["wf5", "u1", "Broken", "not json"]
    );

    await runner.migrate();

    expect(await adapter.fetchall("SELECT id FROM applications")).toHaveLength(
      0
    );
    const workflow = await adapter.fetchone(
      "SELECT app_doc FROM nodetool_workflows WHERE id = ?",
      ["wf5"]
    );
    expect(workflow?.app_doc).toBeNull();
  });
});
