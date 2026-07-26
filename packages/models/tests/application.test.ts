import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";

import { eq } from "drizzle-orm";

import { getDb, initTestDb } from "../src/db.js";
import { applicationVersions } from "../src/schema/applications.js";
import {
  Application,
  deriveCapabilities,
  listApplicationVersions,
  publishApplication,
  releaseApplicationVersion,
  releasedApplicationRelease,
  releasedApplicationVersion
} from "../src/application.js";
import { Workflow } from "../src/workflow.js";
import { WorkflowVersion } from "../src/workflow-version.js";

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

const nodeNamed = (id: string) => ({ id, type: "nodetool.text.Concat" });

/** The workflow the app's operation names — publishing pins its graph. */
const createWorkflow = (
  id = "wf1",
  userId = "u1",
  nodeId = "n1"
): Promise<Workflow> =>
  Workflow.create<Workflow>({
    id,
    user_id: userId,
    name: "Demo workflow",
    graph: { nodes: [nodeNamed(nodeId)], edges: [] }
  });

describe("Application model", () => {
  beforeEach(() => {
    initTestDb();
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
  beforeEach(async () => {
    initTestDb();
    await createWorkflow();
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

  it("pins each operation to a workflow version written at publish time", async () => {
    const app = await createApp();

    const release = await publishApplication(app);

    const pinnedVersion = release.document.operations[0]!.workflowVersion;
    expect(pinnedVersion).toBe(1);
    expect(release.workflows).toEqual([
      {
        workflowId: "wf1",
        version: 1,
        graphHash: expect.any(String),
        graph: { nodes: [nodeNamed("n1")], edges: [] }
      }
    ]);
    expect(release.capabilities.workflows[0]).toMatchObject({
      workflowId: "wf1",
      version: 1
    });
    const stored = await WorkflowVersion.findByVersion("wf1", 1);
    expect(stored?.save_type).toBe("publish");
    expect(stored?.graph).toEqual({ nodes: [nodeNamed("n1")], edges: [] });
  });

  it("keeps the release unchanged when the workflow is edited afterwards", async () => {
    const app = await createApp();
    const release = await publishApplication(app);
    const hashAtPublish = release.capabilities.workflows[0]!.graphHash;

    const workflow = (await Workflow.get<Workflow>("wf1"))!;
    workflow.graph = { nodes: [nodeNamed("edited")], edges: [] };
    await workflow.save();

    const served = await releasedApplicationRelease(app.id);
    expect(served?.workflows[0]!.graph).toEqual({
      nodes: [nodeNamed("n1")],
      edges: []
    });
    expect(served?.workflows[0]!.graphHash).toBe(hashAtPublish);
    expect(served?.document.operations[0]!.workflowVersion).toBe(1);

    // Publishing again picks the edit up as a new pin, leaving v1 alone.
    const next = await publishApplication(app);
    expect(next.workflows[0]!.version).toBe(2);
    expect(next.workflows[0]!.graph).toEqual({
      nodes: [nodeNamed("edited")],
      edges: []
    });
    const first = (await listApplicationVersions(app.id)).find(
      (v) => v.version === 1
    );
    expect(first?.document.operations[0]!.workflowVersion).toBe(1);
  });

  it("pins a shared workflow's graph without writing to its history", async () => {
    const workflow = (await Workflow.get<Workflow>("wf1"))!;
    workflow.user_id = "someone-else";
    workflow.access = "public";
    await workflow.save();
    const app = await createApp();

    const release = await publishApplication(app);

    expect(release.workflows[0]).toMatchObject({
      workflowId: "wf1",
      version: null,
      graph: { nodes: [nodeNamed("n1")], edges: [] }
    });
    expect(await WorkflowVersion.listForWorkflow("wf1")).toEqual([]);
  });

  it("refuses to publish an operation whose workflow is gone", async () => {
    const app = await createApp();
    const workflow = (await Workflow.get<Workflow>("wf1"))!;
    await workflow.delete();

    await expect(publishApplication(app)).rejects.toThrow(
      /workflow wf1 bound to operation main was not found/
    );
  });

  it("reports no pinned graph on a snapshot published before pinning", async () => {
    const app = await createApp();
    await publishApplication(app);
    // Simulate a row written by the pre-pinning publish path.
    await getDb()
      .update(applicationVersions)
      .set({ workflow_graphs: null })
      .where(eq(applicationVersions.application_id, app.id));

    const served = await releasedApplicationRelease(app.id);
    expect(served?.workflows).toEqual([
      { workflowId: "wf1", version: null, graphHash: null, graph: null }
    ]);
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
