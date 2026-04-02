import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, Workflow } from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";

describe("HTTP API: workflow DSL export", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("exports a workflow as TypeScript DSL source", async () => {
    const created = (await Workflow.create({
      user_id: "user-1",
      name: "Export Me",
      access: "private",
      graph: {
        nodes: [
          {
            id: "const_1",
            type: "nodetool.constant.String",
            name: "Greeting",
            properties: { value: "hello" }
          },
          {
            id: "out_1",
            type: "nodetool.output.Output",
            name: "Output",
            properties: {}
          }
        ],
        edges: [
          {
            source: "const_1",
            sourceHandle: "output",
            target: "out_1",
            targetHandle: "value"
          }
        ]
      }
    })) as Workflow;

    const response = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${created.id}/dsl-export`, {
        headers: { "x-user-id": "user-1" }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain(
      'import { constant, output, workflow } from "@nodetool/dsl";'
    );
    expect(body).toContain("const greeting = constant.string({");
    expect(body).toContain(
      "export const exportMeWorkflow = workflow(outputNode);"
    );
  });
});
