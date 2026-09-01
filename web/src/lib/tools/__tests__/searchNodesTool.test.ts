import { FrontendToolRegistry } from "../frontendTools";
import { stub } from "../../../test-utils/doubles";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/searchNodes";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import { callTool } from "../../../test-utils/frontendTools";

/** What `ui_search_nodes` answers. */
type SearchNodesResult = {
  ok: boolean;
  query: string;
  results: Array<{
    properties?: Array<Record<string, unknown>>;
    outputs?: Array<Record<string, unknown>>;
  }>;
};

describe("ui_search_nodes tool", () => {
  it("accepts boolean-like string flags", async () => {
    const node = stub<NodeMetadata>({
      node_type: "nodetool.constant.String",
      title: "String",
      namespace: "nodetool.constant",
      description: "Long description that should not be included.",
      properties: [
        {
          name: "value",
          type: { type: "str" },
          title: "Value",
          required: false,
          default: "",
          description: "Property description that should not be included.",
        },
      ],
      outputs: [{ name: "output", type: { type: "str" }, stream: false }],
    });

    const result = await callTool<SearchNodesResult>(
      "ui_search_nodes",
      {
        query: "string",
        include_properties: "true",
        include_outputs: "true",
        strict_match: "false",
      },
      "toolcall-1",
      {
        getState: () =>
          stub<FrontendToolState>({
            nodeMetadata: {
              "nodetool.constant.String": node,
            },
          }),
      },
    );
    expect(result.ok).toBe(true);
    expect(result.query).toBe("string");
    expect(result.results.length).toBeGreaterThan(0);
    const first = result.results[0];
    expect(first).not.toHaveProperty("description");
    expect(first).toHaveProperty("properties");
    expect(first).toHaveProperty("outputs");
    const firstProperty = first.properties?.[0];
    expect(firstProperty).toEqual(
      expect.objectContaining({
        name: "value",
      }),
    );
    expect(firstProperty).not.toHaveProperty("title");
    expect(firstProperty).not.toHaveProperty("default");
    expect(firstProperty).not.toHaveProperty("description");
  });
});
