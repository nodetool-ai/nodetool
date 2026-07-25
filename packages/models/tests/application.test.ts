import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";

import { getRawDb, initTestDb } from "../src/db.js";
import {
  Application,
  deriveCapabilities,
  listApplicationVersions,
  publishApplication,
  releaseApplicationVersion,
  releasedApplicationVersion
} from "../src/application.js";

const documentWith = (workflowId = "wf1") => {
  const doc = createEmptyDocument("Demo");
  doc.operations = [
    {
      id: "main",
      name: "Run",
      workflowId,
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return doc;
};

const createApp = (
  userId = "u1",
  projectId = "p1",
  name = "Demo app"
): Promise<Application> =>
  Application.create<Application>({
    user_id: userId,
    project_id: projectId,
    name,
    document: JSON.stringify(documentWith())
  });

describe("Application model", () => {
  beforeEach(() => {
    initTestDb();
    getRawDb().exec(`
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        document TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS application_versions (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        document TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        released INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
  });

  it("round-trips the document through the row", async () => {
    const app = await createApp();
    expect(app.toDocument().operations[0]).toMatchObject({ workflowId: "wf1" });
    expect(app.toResponse().name).toBe("Demo app");
  });

  it("refuses to save a document the parser rejects", async () => {
    await expect(
      Application.create<Application>({
        user_id: "u1",
        document: JSON.stringify({ schemaVersion: 99, ui: { root: {}, content: [] } })
      })
    ).rejects.toThrow(/not valid at schema version/);
  });

  it("listByProject scopes by user before applying limit", async () => {
    await createApp("other", "p1", "Theirs");
    await createApp("u1", "p1", "Mine");

    const apps = await Application.listByProject("p1", "u1", 1);

    expect(apps).toHaveLength(1);
    expect(apps[0]!.name).toBe("Mine");
  });

  it("updateFieldsIfUnchanged rejects a stale write", async () => {
    const app = await createApp();
    const original = app.updated_at;

    const first = await Application.updateFieldsIfUnchanged(app.id, original, {
      name: "Renamed"
    });
    expect(first?.name).toBe("Renamed");

    const stale = await Application.updateFieldsIfUnchanged(app.id, original, {
      name: "Clobbered"
    });
    expect(stale).toBeNull();
  });
});

describe("application releases", () => {
  beforeEach(() => {
    initTestDb();
    getRawDb().exec(`
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        document TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS application_versions (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        document TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        released INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
  });

  it("publishes monotonic versions and moves the release pointer", async () => {
    const app = await createApp();

    const first = await publishApplication(app);
    expect(first.version).toBe(1);
    expect(first.released).toBe(true);

    const second = await publishApplication(app);
    expect(second.version).toBe(2);

    const current = await releasedApplicationVersion(app.id);
    expect(current?.version).toBe(2);
    expect(await listApplicationVersions(app.id)).toHaveLength(2);
  });

  it("rolls back by moving the pointer to an earlier version", async () => {
    const app = await createApp();
    await publishApplication(app);
    await publishApplication(app);

    const rolledBack = await releaseApplicationVersion(app.id, 1);
    expect(rolledBack?.version).toBe(1);
    expect((await releasedApplicationVersion(app.id))?.version).toBe(1);
  });

  it("reports no release before the first publish", async () => {
    const app = await createApp();
    expect(await releasedApplicationVersion(app.id)).toBeNull();
  });

  it("returns null when rolling back to a version that does not exist", async () => {
    const app = await createApp();
    expect(await releaseApplicationVersion(app.id, 7)).toBeNull();
  });
});

describe("deriveCapabilities", () => {
  it("summarizes what a release may invoke and touch", () => {
    const doc = documentWith();
    doc.operations.push({
      id: "publish",
      name: "Publish",
      workflowId: "wf2",
      workflowVersion: 3,
      inputs: {},
      outputs: {},
      policy: "queue"
    });
    doc.resources = [
      {
        id: "r1",
        name: "Shots",
        kind: "storyboard",
        scope: {},
        operations: ["read", "update"]
      },
      {
        id: "r2",
        name: "More shots",
        kind: "storyboard",
        scope: {},
        operations: ["read", "delete"]
      }
    ];

    expect(deriveCapabilities(doc)).toEqual({
      workflows: [
        { workflowId: "wf1", version: undefined },
        { workflowId: "wf2", version: 3 }
      ],
      resources: [
        { kind: "storyboard", operations: ["read", "update", "delete"] }
      ]
    });
  });

  it("is empty for a document with no bindings", () => {
    expect(deriveCapabilities(createEmptyDocument())).toEqual({
      workflows: [],
      resources: []
    });
  });
});
