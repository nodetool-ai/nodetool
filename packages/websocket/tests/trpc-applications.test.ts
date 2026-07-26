import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  ModelObserver,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";

import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Real DB, real resolvers: the release path is only worth testing end to end,
// since the point of it is that what the server serves is not the draft.
const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

const node = (id: string) => ({ id, type: "nodetool.text.Concat" });

async function seedApp(userId = "user-1") {
  await Workflow.create<Workflow>({
    id: "wf1",
    user_id: userId,
    name: "Demo workflow",
    graph: { nodes: [node("n1")], edges: [] }
  });
  const document = createEmptyDocument("Demo");
  document.operations = [
    {
      id: "main",
      name: "Run",
      workflowId: "wf1",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return Application.create<Application>({
    user_id: userId,
    project_id: "p1",
    name: "Demo app",
    document: JSON.stringify(document)
  });
}

describe("applications router releases", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("releasedDocument serves the pinned snapshot, not the draft", async () => {
    const app = await seedApp();
    const caller = createCaller(makeCtx("user-1"));
    await caller.applications.publish({ id: app.id });

    // Both the workflow and the app's draft move on after the release.
    const workflow = (await Workflow.get<Workflow>("wf1"))!;
    workflow.graph = { nodes: [node("edited")], edges: [] };
    await workflow.save();
    const draft = await caller.applications.get({ id: app.id });
    await caller.applications.update({
      id: app.id,
      baseUpdatedAt: draft.updatedAt,
      document: {
        ...draft.document,
        variables: [
          {
            id: "v1",
            name: "added later",
            scope: "instance",
            persist: false
          }
        ]
      }
    });

    const release = await caller.applications.releasedDocument({ id: app.id });
    expect(release?.version).toBe(1);
    expect(release?.released).toBe(true);
    expect(release?.document.variables).toEqual([]);
    expect(release?.document.operations[0]!.workflowVersion).toBe(1);
    expect(release?.workflows).toEqual([
      {
        workflowId: "wf1",
        version: 1,
        graphHash: expect.any(String),
        graph: { nodes: [expect.objectContaining({ id: "n1" })], edges: [] }
      }
    ]);
    expect(release?.capabilities.workflows[0]).toMatchObject({
      workflowId: "wf1",
      version: 1
    });
  });

  it("releasedDocument is null before the first publish", async () => {
    const app = await seedApp();
    const caller = createCaller(makeCtx("user-1"));
    expect(
      await caller.applications.releasedDocument({ id: app.id })
    ).toBeNull();
  });

  it("releasedDocument does not serve another user's app", async () => {
    const app = await seedApp();
    const caller = createCaller(makeCtx("user-2"));
    await expect(
      caller.applications.releasedDocument({ id: app.id })
    ).rejects.toThrow(/not found/i);
  });

  it("rollback serves the earlier snapshot's graphs again", async () => {
    const app = await seedApp();
    const caller = createCaller(makeCtx("user-1"));
    await caller.applications.publish({ id: app.id });

    const workflow = (await Workflow.get<Workflow>("wf1"))!;
    workflow.graph = { nodes: [node("edited")], edges: [] };
    await workflow.save();
    await caller.applications.publish({ id: app.id });
    expect(
      (await caller.applications.releasedDocument({ id: app.id }))
        ?.workflows[0]!.graph?.nodes[0]
    ).toMatchObject({ id: "edited" });

    await caller.applications.release({ id: app.id, version: 1 });
    const back = await caller.applications.releasedDocument({ id: app.id });
    expect(back?.version).toBe(1);
    expect(back?.workflows[0]!.graph?.nodes[0]).toMatchObject({ id: "n1" });
  });
});
