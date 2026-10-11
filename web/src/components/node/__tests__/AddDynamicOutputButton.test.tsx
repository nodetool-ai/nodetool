import { makeNodeStore, nodeStoreRenderers } from "../../../test-utils/nodeStore";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import useMetadataStore from "../../../stores/MetadataStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";

const updateNodeData = jest.fn();
const { render } = nodeStoreRenderers(
  makeNodeStore({ updateNodeData })
);
import AddDynamicOutputButton from "../AddDynamicOutputButton";

describe("AddDynamicOutputButton", () => {
  beforeEach(() => {
    updateNodeData.mockClear();
  });

  it("opens the dialog and writes a new dynamic output to node data", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <AddDynamicOutputButton id="node-1" nodeType="test.Agent" dynamicOutputs={{}} />
      </ThemeProvider>
    );

    expect(screen.queryByText("Add Output")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add output" }));
    expect(screen.getByText("Add Output")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Name"), "summary");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(updateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: {
        summary: { type: "str", type_args: [], optional: false }
      }
    });
  });

  it("merges the new output alongside existing dynamic outputs", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <AddDynamicOutputButton
          nodeType="test.Agent"
          id="node-1"
          dynamicOutputs={{
            existing: { type: "int", type_args: [], optional: false }
          }}
        />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Add output" }));
    await user.type(screen.getByLabelText("Name"), "summary");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(updateNodeData).toHaveBeenCalledWith("node-1", {
      dynamic_outputs: {
        existing: { type: "int", type_args: [], optional: false },
        summary: { type: "str", type_args: [], optional: false }
      }
    });
  });

  it.each([
    ["an existing dynamic output", "existing"],
    ["a static output", "text"]
  ])("rejects the name of %s", async (_label, name) => {
    useMetadataStore.setState({
      metadata: {
        "test.Agent": stub<NodeMetadata>({
          node_type: "test.Agent",
          outputs: [{ name: "text", type: { type: "str" } }]
        })
      }
    });
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={mockTheme}>
        <AddDynamicOutputButton
          nodeType="test.Agent"
          id="node-1"
          dynamicOutputs={{
            existing: { type: "str", type_args: [], optional: false }
          }}
        />
      </ThemeProvider>
    );

    await user.click(screen.getByRole("button", { name: "Add output" }));
    await user.type(screen.getByLabelText("Name"), name);
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(updateNodeData).not.toHaveBeenCalled();
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    useMetadataStore.setState({ metadata: {} });
  });
});
