import { FrontendToolRegistry } from "../frontendTools";
import { stub } from "../../../test-utils/doubles";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/searchNodes";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import { toolResult } from "../../../test-utils/toolResult";

/**
 * One entry of `ui_search_nodes`' `results`, as this suite reads it: the two
 * lists it asks the tool to include, and nothing it asserts is absent.
 */
interface SearchNodeEntry {
  properties: Array<Record<string, unknown>>;
  outputs: unknown[];
}

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

    const result = await FrontendToolRegistry.call(
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

    const typed = toolResult<{
      ok: boolean;
      query: string;
      results: SearchNodeEntry[];
    }>(result, "ok", "query", "results");
    expect(typed.ok).toBe(true);
    expect(typed.query).toBe("string");
    expect(typed.results.length).toBeGreaterThan(0);
    const first = typed.results[0];
    expect(first).not.toHaveProperty("description");
    expect(first).toHaveProperty("properties");
    expect(first).toHaveProperty("outputs");
    const firstProperty = first.properties[0];
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
