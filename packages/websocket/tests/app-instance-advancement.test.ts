import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  initTestDb,
  publishApplication,
  getAppInstance,
  reserveAppRun,
  reserveInvocation,
  setApplicationBudget,
  settleAppRun
} from "@nodetool-ai/models";
import {
  advanceOwnedAppInstance,
  createOwnedAppInstance
} from "../src/lib/app-instances-service.js";

beforeEach(() => {
  initTestDb();
});
async function fixture() {
  await Workflow.create<Workflow>({
    id: "wf",
    user_id: "owner",
    name: "Target",
    graph: {
      nodes: [
        { id: "input", type: "nodetool.input.StringInput" },
        { id: "output", type: "nodetool.output.Output" }
      ],
      edges: []
    }
  });
  const document = createEmptyDocument();
  document.variables = [
    {
      id: "text",
      name: "Text",
      scope: "instance",
      persist: false,
      type: { type: "str" },
      default: "default"
    }
  ];
  document.operations = [
    {
      id: "op",
      name: "Run",
      workflowId: "wf",
      inputs: {},
      outputs: {},
      policy: "parallel"
    }
  ];
  const application = await Application.create<Application>({
    user_id: "owner",
    name: "App",
    document: JSON.stringify(document)
  });
  await publishApplication(application);
  const snapshot = { document, workflow_graphs: {}, script_documents: {} };
  const instance = await createOwnedAppInstance(
    "owner",
    {
      application_id: application.id,
      source_id: application.id,
      version: 1,
      snapshot,
      variables: {
        text: "working",
        __app_inputs: { "op:input": "entered" },
        __app_outputs: { "op:output": "previous" }
      }
    },
    true
  );
  return { application, instance, snapshot };
}
async function nextRelease(application: Application) {
  const document = application.toDocument();
  document.variables.push({
    id: "extra",
    name: "Extra",
    scope: "instance",
    persist: false,
    default: 7
  });
  application.document = JSON.stringify(document);
  await application.save();
  await publishApplication(application);
}
describe("explicit app instance release advancement", () => {
  it("advances an application working copy created before its first release", async () => {
    const document = createEmptyDocument();
    const application = await Application.create<Application>({
      user_id: "owner",
      name: "Unpublished app",
      document: JSON.stringify(document)
    });
    const instance = await createOwnedAppInstance(
      "owner",
      {
        application_id: application.id,
        source_id: `application:${application.id}`,
        snapshot: { document, workflow_graphs: {}, script_documents: {} }
      },
      true
    );
    expect(instance.version).toBeNull();
    await publishApplication(application);
    const advanced = await advanceOwnedAppInstance("owner", {
      id: instance.id,
      expected_revision: instance.revision,
      version: 1
    });
    expect(advanced.version).toBe(1);
    expect(advanced.id).toBe(instance.id);
    expect(advanced.revision).toBe(instance.revision + 1);
  });
  it.each([false, true])(
    "refuses stale snapshot reservation with configured budget=%s",
    async (budgeted) => {
      const { application, instance } = await fixture();
      await nextRelease(application);
      await advanceOwnedAppInstance("owner", {
        id: instance.id,
        expected_revision: instance.revision,
        version: 2
      });
      if (budgeted) {
        await setApplicationBudget(application.id, {
          period: "total",
          maxUsd: 10,
          maxInvocations: 10
        });
      }
      await expect(
        reserveInvocation({
          applicationId: application.id,
          userId: "owner",
          version: 1,
          invocationId: "stale",
          operationId: "op",
          appRunFields: {
            instance_id: instance.id,
            origin: "ui",
            instance_revision: instance.revision,
            snapshot: instance.snapshot,
            inputs: {},
            trace_id: "a".repeat(32),
            root_span_id: null
          }
        })
      ).rejects.toThrow("revision changed");
    }
  );

  it("keeps v1 pinned, advances server-resolved v2 and blocks older completion even with a newer revision override", async () => {
    const { application, instance } = await fixture();
    const reservation = await reserveAppRun({
      userId: "owner",
      instanceId: instance.id,
      operationId: "op",
      invocationId: "old",
      origin: "ui"
    });
    expect(reservation.allowed).toBe(true);
    if (!reservation.allowed) {
      throw new Error(reservation.reason);
    }
    await nextRelease(application);
    expect((await getAppInstance("owner", instance.id))?.version).toBe(1);
    const advanced = await advanceOwnedAppInstance("owner", {
      id: instance.id.slice(0, 12),
      expected_revision: instance.revision,
      version: 2
    });
    expect(advanced.version).toBe(2);
    expect(advanced.variables).toEqual({ ...instance.variables, extra: 7 });
    const completed = await settleAppRun("owner", reservation.run.id, {
      status: "completed",
      outputs: { text: "old write" },
      expectedRevision: advanced.revision
    });
    expect(completed.version).toBe(1);
    expect(completed.state_conflict).toBe(1);
    expect(await getAppInstance("owner", instance.id)).toEqual(advanced);
    const future = await reserveAppRun({
      userId: "owner",
      instanceId: instance.id,
      operationId: "op",
      invocationId: "new",
      origin: "ui"
    });
    if (!future.allowed) {
      throw new Error(future.reason);
    }
    expect(future.run.version).toBe(2);
    expect(future.run.snapshot).toEqual(advanced.snapshot);
  });
  it("rejects stale revision, missing release, foreign owner and incompatible variable types without a partial write", async () => {
    const { application, instance } = await fixture();
    await nextRelease(application);
    await expect(
      advanceOwnedAppInstance("owner", {
        id: instance.id,
        expected_revision: 10,
        version: 2
      })
    ).rejects.toThrow("revision changed");
    await expect(
      advanceOwnedAppInstance("owner", {
        id: instance.id,
        expected_revision: 0,
        version: 999
      })
    ).rejects.toThrow("version not found");
    await expect(
      advanceOwnedAppInstance("other", {
        id: instance.id,
        expected_revision: 0,
        version: 2
      })
    ).rejects.toThrow("not found");
    const document = application.toDocument();
    document.variables[0]!.type = { type: "int" };
    application.document = JSON.stringify(document);
    await application.save();
    await publishApplication(application);
    await expect(
      advanceOwnedAppInstance("owner", {
        id: instance.id,
        expected_revision: 0,
        version: 3
      })
    ).rejects.toThrow("incompatible");
    expect(await getAppInstance("owner", instance.id)).toEqual(instance);
  });
  it("rejects incompatible reserved port maps and changed bindings without dropping values", async () => {
    const { application, instance } = await fixture();
    const document = application.toDocument();
    document.operations[0]!.inputs.input = {
      from: "constant",
      value: "new binding"
    };
    application.document = JSON.stringify(document);
    await application.save();
    await publishApplication(application);
    await expect(
      advanceOwnedAppInstance("owner", {
        id: instance.id,
        expected_revision: 0,
        version: 2
      })
    ).rejects.toThrow("op:input");
    expect(await getAppInstance("owner", instance.id)).toEqual(instance);
  });
  it("refreezes changed secondary targets instead of reusing the same draft preview", async () => {
    const { application, snapshot } = await fixture();
    const input = {
      application_id: application.id,
      source_id: `preview:${application.id}:same-definition`,
      snapshot
    };
    const first = await createOwnedAppInstance("owner", input, true);
    const workflow = await Workflow.find("owner", "wf");
    if (!workflow) {
      throw new Error("Missing fixture workflow");
    }
    workflow.graph = {
      nodes: [{ id: "changed", type: "nodetool.input.StringInput" }],
      edges: []
    };
    await workflow.save();
    const second = await createOwnedAppInstance("owner", input, true);
    expect(second.id).not.toBe(first.id);
    expect(second.source_id).not.toBe(first.source_id);
    expect(second.snapshot.workflow_graphs.wf?.nodes[0]?.id).toBe("changed");
    expect(await createOwnedAppInstance("owner", input, true)).toEqual(second);
  });
  it("freezes a distinct owner preview without changing the published default", async () => {
    const { application, instance, snapshot } = await fixture();
    snapshot.document.variables[0]!.default = "edited draft";
    const preview = await createOwnedAppInstance(
      "owner",
      {
        application_id: application.id,
        source_id: `preview:${application.id}:frozen-draft`,
        version: null,
        snapshot
      },
      true
    );
    expect(preview.id).not.toBe(instance.id);
    expect(preview.version).toBeNull();
    expect(preview.snapshot.document.variables[0]!.default).toBe(
      "edited draft"
    );
    expect(await getAppInstance("owner", instance.id)).toEqual(instance);
    await expect(
      createOwnedAppInstance("other", {
        application_id: application.id,
        source_id: "preview:foreign",
        snapshot
      })
    ).rejects.toThrow("not found");
    await expect(
      advanceOwnedAppInstance("owner", {
        id: preview.id,
        expected_revision: 0,
        version: 1
      })
    ).rejects.toThrow("application working instance");
  });
});
