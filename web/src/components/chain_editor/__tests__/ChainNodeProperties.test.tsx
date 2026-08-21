import React from "react";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { ChainNodeProperties } from "../ChainNodeProperties";

const render = (ui: React.ReactElement) =>
  rtlRender(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);
import type { ChainNode } from "../chainTypes";
import type {
  NodeMetadata,
  Property,
  TypeMetadata
} from "../../../stores/ApiTypes";

const strType: TypeMetadata = { type: "str", type_args: [], optional: false };
const intType: TypeMetadata = { type: "int", type_args: [], optional: false };

const makeProperty = (name: string, type: TypeMetadata): Property =>
  ({
    name,
    type,
    default: "",
    description: "",
    required: false
  }) as Property;

const makeMetadata = (
  title: string,
  outputs: Array<{ name: string; type: TypeMetadata }>
): NodeMetadata =>
  ({
    title,
    description: "",
    namespace: "test",
    node_type: `test.${title}`,
    properties: [],
    outputs: outputs.map((o) => ({ ...o, stream: false })),
    layout: "default",
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    recommended_models: [],
    required_settings: []
  }) as NodeMetadata;

const makeChainNode = (
  id: string,
  title: string,
  outputs: Array<{ name: string; type: TypeMetadata }>
): ChainNode => ({
  id,
  nodeType: `test.${title}`,
  metadata: makeMetadata(title, outputs),
  properties: {},
  selectedOutput: outputs[0]?.name ?? "",
  inputMappings: {},
  expanded: false
});

describe("ChainNodeProperties", () => {
  const properties = [makeProperty("text", strType)];
  const previousNodes = [
    makeChainNode("prev-1", "Text Source", [{ name: "output", type: strType }]),
    makeChainNode("prev-2", "Number Source", [{ name: "output", type: intType }])
  ];

  it("renders each field exactly once", () => {
    render(
      <ChainNodeProperties
        nodeId="n1"
        nodeType="test.Target"
        properties={properties}
        values={{}}
        inputMappings={{}}
        previousNodes={previousNodes}
        onUpdate={jest.fn()}
        onSetInputMapping={jest.fn()}
      />
    );

    // One editor for the field, one connect affordance — no duplicate list.
    expect(screen.getAllByText(/text/i)).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: /connect text to a previous step/i
      })
    ).toBeInTheDocument();
  });

  it("opens a source picker with compatible sources selectable and incompatible ones disabled", async () => {
    const onSetInputMapping = jest.fn();
    const user = userEvent.setup();

    render(
      <ChainNodeProperties
        nodeId="n1"
        nodeType="test.Target"
        properties={properties}
        values={{}}
        inputMappings={{}}
        previousNodes={previousNodes}
        onUpdate={jest.fn()}
        onSetInputMapping={onSetInputMapping}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /connect text to a previous step/i })
    );

    const menu = await screen.findByRole("menu");
    const compatible = within(menu).getByText("1 · Text Source");
    expect(
      within(menu).getByText("2 · Number Source").closest("li")
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(compatible);
    expect(onSetInputMapping).toHaveBeenCalledWith("text", {
      sourceNodeId: "prev-1",
      sourceOutput: "output"
    });
  });

  it("shows a wired field as a source pill with a disconnect action instead of an editor", async () => {
    const onSetInputMapping = jest.fn();
    const user = userEvent.setup();

    render(
      <ChainNodeProperties
        nodeId="n1"
        nodeType="test.Target"
        properties={properties}
        values={{}}
        inputMappings={{
          text: { sourceNodeId: "prev-1", sourceOutput: "output" }
        }}
        previousNodes={previousNodes}
        onUpdate={jest.fn()}
        onSetInputMapping={onSetInputMapping}
      />
    );

    expect(screen.getByText("1 · Text Source")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /change source for text/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /disconnect text/i }));
    expect(onSetInputMapping).toHaveBeenCalledWith("text", null);
  });

  it("offers the connect affordance even when no previous output fits, and says so", async () => {
    const user = userEvent.setup();

    render(
      <ChainNodeProperties
        nodeId="n1"
        nodeType="test.Target"
        properties={[makeProperty("count", intType)]}
        values={{}}
        inputMappings={{}}
        previousNodes={[previousNodes[0]]}
        onUpdate={jest.fn()}
        onSetInputMapping={jest.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /connect count/i }));
    expect(
      screen.getByText("No compatible outputs in previous steps")
    ).toBeInTheDocument();
  });

  it("hides the connect affordance on the first node, which has no earlier step", () => {
    render(
      <ChainNodeProperties
        nodeId="n1"
        nodeType="test.Target"
        properties={[makeProperty("count", intType)]}
        values={{}}
        inputMappings={{}}
        previousNodes={[]}
        onUpdate={jest.fn()}
        onSetInputMapping={jest.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /connect count/i })
    ).not.toBeInTheDocument();
  });
});
