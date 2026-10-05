import { afterEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { Application } from "../src/application.js";
import {
  createAppInstance,
  getAppInstance,
  reserveAppRun,
  settleAppRun,
  updateAppInstance
} from "../src/app-instance.js";
import {
  reserveInvocation,
  setApplicationBudget
} from "../src/application-budget.js";
import { closeDb, initTestDb } from "../src/db.js";
import { initPgliteTestDb } from "./helpers/pglite-test-db.js";

afterEach(async () => {
  await closeDb();
});
describe.each(["sqlite", "postgres"] as const)(
  "%s instance advancement boundary",
  (dialect) => {
    it("keeps old results historical and refuses stale metered and unmetered reservations", async () => {
      if (dialect === "postgres") {
        await initPgliteTestDb();
      } else {
        initTestDb();
      }
      const application = await Application.create<Application>({
        user_id: "owner",
        name: "App"
      });
      const document = createEmptyDocument();
      document.variables = [
        { id: "text", name: "Text", scope: "instance", persist: false }
      ];
      document.operations = [
        {
          id: "op",
          name: "Run",
          workflowId: "wf",
          policy: "parallel",
          inputs: {},
          outputs: {}
        }
      ];
      const snapshot = {
        document,
        workflow_graphs: { wf: { nodes: [], edges: [] } },
        script_documents: {}
      };
      const instance = await createAppInstance({
        userId: "owner",
        applicationId: application.id,
        version: 1,
        snapshot,
        variables: { text: "old" }
      });
      const reserved = await reserveAppRun({
        userId: "owner",
        instanceId: instance.id,
        operationId: "op",
        invocationId: "old",
        origin: "ui"
      });
      if (!reserved.allowed) {
        throw new Error(reserved.reason);
      }
      const advanced = await updateAppInstance("owner", instance.id, {
        expectedRevision: 0,
        version: 2,
        snapshot,
        variables: { text: "new" }
      });
      const completed = await settleAppRun("owner", reserved.run.id, {
        status: "completed",
        expectedRevision: advanced.revision,
        outputs: { text: "late" }
      });
      expect(completed.state_conflict).toBe(1);
      expect(completed.version).toBe(1);
      expect(await getAppInstance("owner", instance.id)).toEqual(advanced);
      for (const budgeted of [false, true]) {
        if (budgeted) {
          await setApplicationBudget(application.id, { maxUsd: 10 });
        }
        await expect(
          reserveInvocation({
            applicationId: application.id,
            userId: "owner",
            version: 1,
            invocationId: `stale-${budgeted}`,
            operationId: "op",
            appRunFields: {
              instance_id: instance.id,
              instance_revision: 0,
              origin: "ui",
              snapshot,
              inputs: {},
              trace_id: "a".repeat(32),
              root_span_id: null
            }
          })
        ).rejects.toThrow("revision changed");
      }
    }, 60_000);
  }
);
