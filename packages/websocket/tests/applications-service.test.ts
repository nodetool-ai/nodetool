/**
 * Application ids are supplied by the client, and everything an app owns —
 * snapshots, ledger, budget — is keyed on that id alone. These tests cover the
 * two halves that keep one user's data out of another's app: deleting an app
 * takes its children with it, and an id that is taken cannot be claimed again.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  initTestDb,
  listApplicationVersions,
  listInvocations,
  publishApplication,
  recordInvocation,
  setApplicationBudget
} from "@nodetool-ai/models";
import type { CreateApplicationInput } from "@nodetool-ai/protocol/api-schemas/applications.js";

import {
  createApplication,
  deleteApplication
} from "../src/lib/applications-service.js";

const USER = "user-1";
const OTHER = "user-2";

const appDocument = () => {
  const doc = createEmptyDocument("Demo");
  doc.operations = [
    {
      id: "main",
      name: "Run",
      workflowId: "wf1",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return doc;
};

/** The parsed input the transports hand the service. */
const input = (fields: {
  id?: string;
  name: string;
}): CreateApplicationInput => ({
  ...fields,
  description: "",
  projectId: "default",
  document: appDocument()
});

const seedWorkflow = () =>
  Workflow.create<Workflow>({
    id: "wf1",
    user_id: USER,
    name: "Demo workflow",
    graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }], edges: [] }
  });

describe("applications service", () => {
  beforeEach(async () => {
    await initTestDb();
    await seedWorkflow();
  });

  it("returns the caller's own app when a create repeats its id", async () => {
    const first = await createApplication(
      USER,
      input({ id: "my-app", name: "Mine" })
    );
    const again = await createApplication(
      USER,
      input({ id: "my-app", name: "Renamed" })
    );

    expect(again.id).toBe(first.id);
    expect(again.name).toBe("Mine");
  });

  it("refuses an id another user already holds", async () => {
    await createApplication(OTHER, input({ id: "taken", name: "Theirs" }));

    await expect(
      createApplication(USER, input({ id: "taken", name: "Mine" }))
    ).rejects.toThrow(/not found/i);

    const app = await Application.findById("taken");
    expect(app?.user_id).toBe(OTHER);
    expect(app?.name).toBe("Theirs");
  });

  it("refuses an id that is not a plain identifier", async () => {
    await expect(
      createApplication(USER, input({ id: "../../etc/passwd", name: "Sneaky" }))
    ).rejects.toThrow(/invalid application id/i);
  });

  it("deletes the app's versions, ledger and budget with it", async () => {
    const created = await createApplication(
      USER,
      input({ id: "doomed", name: "Doomed" })
    );
    const app = (await Application.findById(created.id))!;
    await publishApplication(app);
    await setApplicationBudget(app.id, { period: "total", maxUsd: 5 });
    await recordInvocation({ applicationId: app.id, invocationId: "job-1" });

    await deleteApplication(USER, app.id);

    expect(await listApplicationVersions(app.id)).toEqual([]);
    expect(await listInvocations(app.id)).toEqual([]);

    // The id is free again, but it comes with none of the old app's data.
    const reclaimed = await createApplication(
      OTHER,
      input({ id: "doomed", name: "Theirs now" })
    );
    expect(await listApplicationVersions(reclaimed.id)).toEqual([]);
    expect(await listInvocations(reclaimed.id)).toEqual([]);
  });

  it("does not delete another user's app", async () => {
    await createApplication(OTHER, input({ id: "theirs", name: "Theirs" }));

    await expect(deleteApplication(USER, "theirs")).rejects.toThrow(
      /not found/i
    );
    expect(await Application.findById("theirs")).not.toBeNull();
  });
});
