import { beforeEach, describe, expect, it } from "vitest";
import { createAppInstance, initTestDb, registerRunTrace, reserveAppRun } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";

const OWNER = "operation-filter-owner";

describe("list_runs operation filter", () => {
  beforeEach(() => { initTestDb(); });

  it("returns the requested operation before limiting and preserves owner isolation", async () => {
    const instance = await createAppInstance({
      userId: OWNER,
      sourceId: "operation-filter",
      snapshot: {
        document: {
          schemaVersion: 4, resources: [], variables: [],
          ui: { root: { props: {} }, content: [] },
          operations: ["requested", "unrelated"].map((id) => ({
            id, name: id, workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" as const
          }))
        },
        workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {}
      }
    });
    const ids: string[] = [];
    for (const operationId of ["requested", "unrelated"]) {
      const reservation = await reserveAppRun({
        userId: OWNER, instanceId: instance.id, operationId,
        invocationId: operationId, origin: "agent", inputs: {}
      });
      if (!reservation.allowed) { throw new Error(reservation.reason); }
      const run = await registerRunTrace(OWNER, {
        kind: "app", sourceId: reservation.run.id, origin: "agent", parents: []
      });
      ids.push(run.id);
    }
    const options = { kind: "app", instance_id: instance.id.slice(0, 12), operation_id: "requested", limit: 1 };
    const capability = createCapabilityRun({ context: new ProcessingContext({ userId: OWNER }), gate: UNGATED });
    const result = await capability.invoke("list_runs", options);
    expect(result).toMatchObject({ runs: [{
      id: ids[0].slice(0, 12),
      app: { instance_id: instance.id.slice(0, 12), operation_id: "requested" }
    }] });
    expect(result).toHaveProperty("runs.length", 1);
    const foreign = createCapabilityRun({ context: new ProcessingContext({ userId: "foreign" }), gate: UNGATED });
    await expect(foreign.invoke("list_runs", options)).rejects.toMatchObject({ code: "not_found" });
  });
});
