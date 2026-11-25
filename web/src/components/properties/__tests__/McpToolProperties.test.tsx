import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import type { Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { NodeProvider } from "../../../contexts/NodeContext";
import { createNodeStore } from "../../../stores/NodeStore";
import { McpServerProperty, McpToolProperty } from "../McpToolProperties";

jest.mock("../../node/PropertyLabel", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../inputs/Select", () => ({
  __esModule: true,
  default: ({
    options,
    onChange
  }: {
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <ul>
      {options.map((option) => (
        <li key={option.value}>
          <button onClick={() => onChange(option.value)}>{option.label}</button>
        </li>
      ))}
    </ul>
  )
}));

const schema = { type: "object", properties: { name: { type: "string" } } };
jest.mock("../../../serverState/useExternalMcpCatalog", () => ({
  useExternalMcpCatalog: () => ({
    isLoading: false,
    error: null,
    data: {
      servers: [
        {
          id: "home",
          name: "Home",
          error: null,
          tools: [{ name: "set_light", input_schema: schema }]
        },
        { id: "notes", name: "Notes", error: null, tools: [] }
      ]
    }
  })
}));

const property = (name: string) =>
  ({
    name,
    type: { type: "str", optional: false, type_args: [] },
    required: true
  }) as unknown as Property;

const mcpNode = (properties: Record<string, unknown>): Node<NodeData> => ({
  id: "n",
  type: "lib.mcp.CallMcpTool",
  position: { x: 0, y: 0 },
  data: {
    properties,
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

const mount = (properties: Record<string, unknown>, which: "server" | "tool") => {
  const store = createNodeStore(undefined, { nodes: [mcpNode(properties)], edges: [] });
  const Component = which === "server" ? McpServerProperty : McpToolProperty;
  render(
    <NodeProvider createStore={() => store}>
      <Component
        property={property(which)}
        propertyIndex="0"
        nodeId="n"
        nodeType="lib.mcp.CallMcpTool"
        value={String(properties[which] ?? "")}
        onChange={() => undefined}
      />
    </NodeProvider>
  );
  return store;
};

describe("Call MCP Tool pickers", () => {
  it("lists the user's servers and clears the tool when the server changes", () => {
    const store = mount(
      { server: "home", tool: "set_light", input_schema: schema },
      "server"
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Home",
      "Notes"
    ]);
    fireEvent.click(screen.getByText("Notes"));
    expect(store.getState().findNode("n")?.data.properties).toMatchObject({
      server: "notes",
      tool: "",
      input_schema: {}
    });
  });

  it("lists only the picked server's tools and stores the schema with the pick", () => {
    const store = mount({ server: "home", tool: "", input_schema: {} }, "tool");
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "set_light"
    ]);
    act(() => {
      fireEvent.click(screen.getByText("set_light"));
    });
    expect(store.getState().findNode("n")?.data.properties).toMatchObject({
      tool: "set_light",
      input_schema: schema
    });
  });

  it("lists no tools before a server is picked", () => {
    mount({ server: "", tool: "", input_schema: {} }, "tool");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
