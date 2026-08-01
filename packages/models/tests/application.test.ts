import { describe, it, expect, beforeEach } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";

import { eq } from "drizzle-orm";

import { getDb, initTestDb } from "../src/db.js";
import { applicationVersions } from "../src/schema/applications.js";
import {
  applicationBudgets,
  applicationInvocations
} from "../src/schema/application-budgets.js";
import {
  Application,
  ApplicationIdInUseError,
  InvalidApplicationIdError,
  deriveCapabilities,
  normalizeApplicationId,
  listApplicationVersions,
  publishApplication,
  releaseApplicationVersion,
  releasedApplicationRelease,
  releasedApplicationVersion
} from "../src/application.js";
import {
  listInvocations,
  recordInvocation,
  setApplicationBudget
} from "../src/application-budget.js";
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

describe("application ids", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("accepts a client-supplied id and refuses a second claim on it", async () => {
    await Application.createUnique({
      id: "my-app",
      user_id: "u1",
      document: JSON.stringify(documentWith())
    });

    // Even for the same user: `save()` upserts, `createUnique` does not.
    await expect(
      Application.createUnique({ id: "my-app", user_id: "u1" })
    ).rejects.toThrow(ApplicationIdInUseError);
    // And most of all not for anyone else.
    await expect(
      Application.createUnique({ id: "my-app", user_id: "u2" })
    ).rejects.toThrow(ApplicationIdInUseError);
  });

  it("rejects an id that is not a plain identifier", () => {
    expect(() => normalizeApplicationId("../etc/passwd")).toThrow(
      InvalidApplicationIdError
    );
    expect(() => normalizeApplicationId("")).toThrow(InvalidApplicationIdError);
    expect(normalizeApplicationId("  app_1.b-2  ")).toBe("app_1.b-2");
  });
});

describe("deleting an application", () => {
  beforeEach(async () => {
    initTestDb();
    await createWorkflow();
  });

  const countIn = async (
    table:
      | typeof applicationVersions
      | typeof applicationInvocations
      | typeof applicationBudgets,
    applicationId: string
  ): Promise<number> => {
    const rows = await getDb().select().from(table);
    return rows.filter(
      (r: Record<string, unknown>) => r.application_id === applicationId
    ).length;
  };

  const childCounts = async (applicationId: string) => ({
    versions: await countIn(applicationVersions, applicationId),
    invocations: await countIn(applicationInvocations, applicationId),
    budgets: await countIn(applicationBudgets, applicationId)
  });

  it("takes its versions, ledger and budget with it", async () => {
    const app = await createApp();
    await publishApplication(app);
    await setApplicationBudget(app.id, { period: "total", maxUsd: 5 });
    await recordInvocation({ applicationId: app.id, invocationId: "job-1" });
    expect(await childCounts(app.id)).toEqual({
      versions: 1,
      invocations: 1,
      budgets: 1
    });

    await app.delete();

    expect(await childCounts(app.id)).toEqual({
      versions: 0,
      invocations: 0,
      budgets: 0
    });
  });

  it("leaves a recreated id with none of the deleted app's data", async () => {
    const app = await Application.createUnique({
      id: "shared-id",
      user_id: "u1",
      document: JSON.stringify(documentWith())
    });
    await publishApplication(app);
    await recordInvocation({ applicationId: app.id, invocationId: "job-1" });
    await app.delete();

    // The attack the cascade closes: claim the id someone else gave up.
    const impostor = await Application.createUnique({
      id: "shared-id",
      user_id: "u2",
      document: JSON.stringify(documentWith())
    });

    expect(await listApplicationVersions(impostor.id)).toEqual([]);
    expect(await releasedApplicationVersion(impostor.id)).toBeNull();
    expect(await listInvocations(impostor.id)).toEqual([]);
  });

  it("does not touch another application's rows", async () => {
    const app = await createApp();
    const other = await createApp();
    await publishApplication(other);

    await app.delete();

    expect(await listApplicationVersions(other.id)).toHaveLength(1);
  });
});

describe("release transitions", () => {
  beforeEach(async () => {
    initTestDb();
    await createWorkflow();
  });

  it("keeps at most one released row and one row per version", async () => {
    const app = await createApp();
    await publishApplication(app);
    await publishApplication(app);
    await publishApplication(app);

    const rows = await getDb()
      .select()
      .from(applicationVersions)
      .where(eq(applicationVersions.application_id, app.id));
    expect(rows.map((r: Record<string, unknown>) => r.version).sort()).toEqual([
      1, 2, 3
    ]);
    expect(
      rows.filter((r: Record<string, unknown>) => Number(r.released) === 1)
    ).toHaveLength(1);
  });

  it("refuses a second snapshot with the same version number", async () => {
    const app = await createApp();
    const published = await publishApplication(app);

    await expect(
      getDb()
        .insert(applicationVersions)
        .values({
          id: "dupe",
          application_id: app.id,
          user_id: "u1",
          version: published.version,
          document: JSON.stringify(documentWith()),
          capabilities: "{}",
          released: 0,
          created_at: new Date().toISOString()
        })
    ).rejects.toThrow();
  });

  it("stamps each snapshot with the owner that published it", async () => {
    const app = await createApp();
    await publishApplication(app);

    expect(await listApplicationVersions(app.id, 50, "u1")).toHaveLength(1);
    expect(await listApplicationVersions(app.id, 50, "u2")).toEqual([]);
    expect(await releasedApplicationVersion(app.id, "u2")).toBeNull();
  });

  it("leaves the current release standing when the rollback target is missing", async () => {
    const app = await createApp();
    await publishApplication(app);
    const current = await publishApplication(app);

    expect(await releaseApplicationVersion(app.id, 99)).toBeNull();

    // The old code cleared the flag before finding out there was nothing to
    // promote, leaving the published app serving no version at all.
    expect((await releasedApplicationVersion(app.id))?.version).toBe(
      current.version
    );
  });

  it("does not roll back to another owner's snapshot", async () => {
    const app = await createApp();
    await publishApplication(app);
    await publishApplication(app);

    expect(await releaseApplicationVersion(app.id, 1, "u2")).toBeNull();
    expect((await releasedApplicationVersion(app.id))?.version).toBe(2);
  });
});
