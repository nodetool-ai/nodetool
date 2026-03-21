import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import "../builtin/searchNodes";
import type { NodeMetadata } from "../../../stores/ApiTypes";

describe("ui_search_nodes tool", () => {
  it("accepts boolean-like string flags", async () => {
    const node = {
      node_type: "nodetool.constant.String",
      title: "String",
      namespace: "nodetool.constant",
      description: "Long description that should not be included.",
      expose_as_tool: false,
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
    } as unknown as NodeMetadata;

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
          ({
            nodeMetadata: {
              "nodetool.constant.String": node,
            },
          }) as unknown as FrontendToolState,
      },
    );

    const typed = result as {
      ok: boolean;
      query: string;
      results: Array<Record<string, unknown>>;
    };
    expect(typed.ok).toBe(true);
    expect(typed.query).toBe("string");
    expect(typed.results.length).toBeGreaterThan(0);
    const first = typed.results[0];
    expect(first).not.toHaveProperty("description");
    expect(first).toHaveProperty("properties");
    expect(first).toHaveProperty("outputs");
    const firstProperty = (first.properties as Array<Record<string, unknown>>)[0];
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
