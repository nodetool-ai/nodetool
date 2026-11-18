/**
 * Ambient transactions (withTransaction) and access epochs, on SQLite and on
 * PostgreSQL through PGlite.
 */
import { afterEach, describe, expect, it } from "vitest";
import { closeDb, getPortableDb, inTransaction, initTestDb, withTransaction } from "../src/db.js";
import { bumpAccessEpochs, changingAccess, lockAccessEpochs } from "../src/access-epoch.js";
import { Workflow } from "../src/workflow.js";
import { accessEpochs } from "../src/schema/access-epochs.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";

function makeWorkflow(name: string) {
  return Workflow.create<Workflow>({
    user_id: "u1",
    name,
    description: "",
    tags: [],
    access: "private",
    graph: { nodes: [], edges: [] },
    run_mode: "workflow"
  });
}

async function names(): Promise<string[]> {
  return (await Workflow.paginate("u1", { limit: 100 }))[0].map((wf) => wf.name).sort();
}

const DIALECTS: [string, () => Promise<void>][] = [
  ["sqlite", async () => void initTestDb()],
  ["postgres", initPgliteTestDb]
];

describe.each(DIALECTS)("withTransaction on %s", { timeout: 30_000 }, (name, init) => {
  afterEach(async () => {
    await closeDb();
  });

  it("commits what the body wrote through model methods", async () => {
    await init();
    const result = await withTransaction(async () => {
      expect(inTransaction()).toBe(true);
      await makeWorkflow("a");
      await makeWorkflow("b");
      return "done";
    });
    expect(result).toBe("done");
    expect(inTransaction()).toBe(false);
    expect(await names()).toEqual(["a", "b"]);
  });

  it("rolls back every write when the body throws", async () => {
    await init();
    await makeWorkflow("before");
    await expect(
      withTransaction(async () => {
        await makeWorkflow("inside");
        await bumpAccessEpochs([{ kind: "workflow", id: "w1" }]);
        throw new Error("refused");
      })
    ).rejects.toThrow("refused");
    expect(await names()).toEqual(["before"]);
    expect(await getPortableDb().select().from(accessEpochs)).toEqual([]);
  });

  it("runs a nested call in the outer transaction", async () => {
    await init();
    await expect(
      withTransaction(async () => {
        await withTransaction(async () => {
          await makeWorkflow("nested");
        });
        throw new Error("outer fails");
      })
    ).rejects.toThrow("outer fails");
    expect(await names()).toEqual([]);
  });

  it("does not hand a finished transaction to work the body started (review F21)", async () => {
    await init();
    let later: Promise<void> = Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await withTransaction(async () => {
      // Work started inside the body that runs after the commit.
      later = gate.then(async () => {
        expect(inTransaction()).toBe(false);
        await expect(
          withTransaction(async () => {
            await makeWorkflow("after commit");
            throw new Error("refused");
          })
        ).rejects.toThrow("refused");
      });
    });
    release();
    await later;
    expect(await names()).toEqual([]);
  });

  it("counts access changes and reads them under a share lock", async () => {
    await init();
    const doc = { kind: "workflow", id: "w1" };
    const project = { kind: "project", id: "p1" };
    expect(await withTransaction(() => lockAccessEpochs([doc, project]))).toEqual(
      new Map([
        ["workflow:w1", 0],
        ["project:p1", 0]
      ])
    );
    await changingAccess([doc, doc], async () => undefined);
    await changingAccess([doc, project], async () => undefined);
    const epochs = await withTransaction(() => lockAccessEpochs([project, doc]));
    expect(epochs.get("workflow:w1")).toBe(2);
    expect(epochs.get("project:p1")).toBe(1);

    // On PostgreSQL a change of access that fails leaves the epoch as it
    // was. SQLite runs the change without a transaction, and an extra count
    // is harmless.
    await expect(
      changingAccess([doc], async () => {
        throw new Error("no");
      })
    ).rejects.toThrow("no");
    expect((await withTransaction(() => lockAccessEpochs([doc]))).get("workflow:w1")).toBe(
      name === "postgres" ? 2 : 3
    );
  });
});

describe("withTransaction on SQLite with other requests", () => {
  afterEach(async () => {
    await closeDb();
  });

  it("refuses a query from outside the body while the transaction is open", async () => {
    initTestDb();
    let release: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const open = withTransaction(async () => {
      await makeWorkflow("inside");
      // A body that waits on something other than the database lets other
      // requests run while it is open.
      await waiting;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(makeWorkflow("outside")).rejects.toThrow(/inside a transaction/);
    release();
    await open;
    expect(await names()).toEqual(["inside"]);
  });

  it("does not see a request that was already running when it was called", async () => {
    initTestDb();
    // The other request's next query is queued before the transaction is
    // asked for. The transaction starts on a later turn, after it ran.
    const other = (async () => {
      await makeWorkflow("other-1");
      await makeWorkflow("other-2");
    })();
    await expect(
      withTransaction(async () => {
        await makeWorkflow("inside");
        throw new Error("roll back");
      })
    ).rejects.toThrow("roll back");
    await other;
    expect(await names()).toEqual(["other-1", "other-2"]);
  });
});

describe("changes of access count", () => {
  afterEach(async () => {
    await closeDb();
  });

  it("increments the epoch of the document or project each change touches", async () => {
    initTestDb();
    const { WorkflowCollaborator } = await import("../src/workflow-collaborator.js");
    const { WorkflowShare } = await import("../src/workflow-share.js");
    const { DocumentCollaborator } = await import("../src/document-sharing.js");
    const { moveDocumentToProject } = await import("../src/project-membership.js");
    const { Project } = await import("../src/project.js");
    const epoch = async (kind: string, id: string) =>
      (await withTransaction(() => lockAccessEpochs([{ kind, id }]))).get(`${kind}:${id}`);

    await Project.create<Project>({ id: "p1", user_id: "u1", name: "One" });
    await Project.create<Project>({ id: "p2", user_id: "u1", name: "Two" });
    const wf = await makeWorkflow("shared");
    await WorkflowCollaborator.upsert({ workflowId: wf.id, userId: "u2", role: "editor", invitedBy: "u1" });
    // Adding a grant takes nothing away, so it does not count.
    expect(await epoch("workflow", wf.id)).toBe(0);
    await WorkflowCollaborator.setRole(wf.id, "u2", "viewer");
    await WorkflowCollaborator.remove(wf.id, "u2");
    const share = await WorkflowShare.ensure({ workflowId: wf.id, role: "viewer", createdBy: "u1" });
    await share.revoke();
    expect(await epoch("workflow", wf.id)).toBe(3);

    await DocumentCollaborator.remove("timeline", "t1", "u2");
    expect(await epoch("timeline", "t1")).toBe(1);

    const { ImageDocument } = await import("../src/image-document.js");
    const sketch = await ImageDocument.create<ImageDocument>({ user_id: "u1", project_id: "p1", name: "s" });
    expect(await moveDocumentToProject("u1", "sketch", sketch.id, "p2")).toBe(true);
    expect(await epoch("sketch", sketch.id)).toBe(1);
    expect(await Workflow.deleteOwned("u1", wf.id)).toBe(true);
    // The delete and the grant rows it removes each count.
    expect(await epoch("workflow", wf.id)).toBeGreaterThan(3);

    await Project.tombstoneOwned("u1", "p1");
    expect(await epoch("project", "p1")).toBe(1);
  });
});
