import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { bindingField, variableField } from "../puck/fields";
import { BuilderWorkflowProvider } from "../puck/BuilderWorkflowContext";
import { WorkflowState } from "../workflowState";

const renderField = (
  element: React.ReactElement,
  state: WorkflowState
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <BuilderWorkflowProvider value={state}>{element}</BuilderWorkflowProvider>
    </ThemeProvider>
  );

const emptyState: WorkflowState = {
  inputs: [],
  outputs: [],
  variables: [],
  nodes: []
};

// Minimal stand-in for the props Puck passes to a custom field's render.
const fieldProps = {
  value: "",
  onChange: () => {},
  readOnly: false,
  name: "binding",
  id: "binding",
  field: { type: "custom" as const, render: () => <span /> }
};

describe("binding fields", () => {
  it("write binding tells the user to add an Input node when there are none", () => {
    const field = bindingField("write");
    renderField(field.render(fieldProps), emptyState);
    expect(
      screen.getByText(/Add an Input node — or any node with properties/i)
    ).toBeInTheDocument();
  });

  it("write binding offers existing input nodes (no hint)", () => {
    const field = bindingField("write");
    renderField(field.render(fieldProps), {
      inputs: [
        {
          nodeId: "i1",
          nodeType: "nodetool.input.StringInput",
          name: "prompt",
          label: "Prompt",
          kind: "string"
        }
      ],
      outputs: [],
      variables: [],
      nodes: []
    });
    expect(
      screen.queryByText(/Add an Input node/i)
    ).not.toBeInTheDocument();
  });

  it("variable field prompts to add a Set Variable node when there are none", () => {
    const field = variableField();
    renderField(field.render(fieldProps), emptyState);
    expect(
      screen.getByText(/Add a Set Variable node/i)
    ).toBeInTheDocument();
  });
});
