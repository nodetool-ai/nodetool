import { describe, expect, it, vi } from "vitest";

vi.mock("@nodetool-ai/models", () => ({ Workflow: {}, WorkflowShare: {} }));

import { parseSharedGraph } from "../src/lib/public-workflow-share.js";

describe("public graph credential redaction", () => {
  it.each(["data", "properties", "dynamic_properties"])(
    "redacts nested snapshots and arrays in %s without mutating the source",
    (propertyBag) => {
      const properties = {
        token: "FAKE_TEST_SECRET",
        max_tokens: 512,
        author: "author",
        prompt: "unchanged",
        values: [
          null,
          false,
          0,
          "text",
          [{ password: "FAKE_TEST_SECRET", label: "keep" }]
        ],
        workflow_json: {
          id: "workflow-id",
          name: "Workflow",
          graph: {
            nodes: [
              {
                id: "app",
                type: "nodetool.workflows.app_node.App",
                data: {
                  properties: {
                    app_json: {
                      operation_id: "operation-id",
                      constants: { api_key: "FAKE_TEST_SECRET", count: 0 },
                      graph: {
                        nodes: [
                          {
                            id: "bot",
                            type: "messaging.discord.DiscordBotTrigger",
                            properties: {
                              token: "FAKE_TEST_SECRET",
                              message: "hello"
                            }
                          }
                        ],
                        edges: []
                      }
                    }
                  }
                }
              }
            ],
            edges: []
          }
        }
      };
      const graph = {
        nodes: [{ id: "outer", type: "Workflow", [propertyBag]: properties }],
        edges: []
      };
      const original = structuredClone(graph);
      const expected = JSON.parse(
        JSON.stringify(graph).replaceAll("FAKE_TEST_SECRET", "")
      );
      expect(parseSharedGraph(graph)).toEqual(expected);
      expect(graph).toEqual(original);
    }
  );

  it("redacts a large graph", () => {
    const graph = {
      nodes: Array.from({ length: 10000 }, (_, i) => ({
        id: String(i),
        type: "Bot",
        data: { token: "FAKE_TEST_SECRET", count: i }
      })),
      edges: []
    };
    const result = parseSharedGraph(graph);
    expect(result?.nodes).toHaveLength(10000);
    expect(JSON.stringify(result)).not.toContain("FAKE_TEST_SECRET");
    expect(result?.nodes[9999].data).toEqual({ token: "", count: 9999 });
  });
});
