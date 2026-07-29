import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { bindingField, conditionField, variableField } from "../puck/fields";
import { BuilderWorkflowProvider } from "../puck/BuilderWorkflowContext";
import { WorkflowState } from "../workflowState";

jest.mock("@puckeditor/core", () => ({
  useGetPuck: () => () => ({
    selectedItem: null,
    appState: { data: { content: [], root: {} } },
    config: { components: {} },
    dispatch: () => {}
  })
}));

const renderField = (element: React.ReactElement, state: WorkflowState) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <BuilderWorkflowProvider value={state}>{element}</BuilderWorkflowProvider>
    </ThemeProvider>
  );

const emptyState: WorkflowState = {
  inputs: [],
  outputs: [],
  variables: [],
  nodes: [],
    resources: []
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

  it("write binding offers a searchable field (no hint) once inputs exist", () => {
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
      nodes: [],
    resources: []
    });
    expect(screen.queryByText(/Add an Input node/i)).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Search inputs and node properties/i)
    ).toBeInTheDocument();
  });

  it("variable field prompts to add a Set Variable node when there are none", () => {
    const field = variableField();
    renderField(field.render(fieldProps), emptyState);
    expect(
      screen.getByText(/Add a Set Variable node/i)
    ).toBeInTheDocument();
  });
});

describe("execution + logic vocabulary", () => {
  const stateWithOutput: WorkflowState = {
    inputs: [],
    outputs: [
      {
        nodeId: "o1",
        nodeType: "nodetool.output.StringOutput",
        name: "result",
        label: "Result"
      }
    ],
    variables: [],
    nodes: [],
    resources: []
  };

  it("offers the run's activity field as a read binding", async () => {
    const field = bindingField("read");
    renderField(field.render(fieldProps), stateWithOutput);
    await userEvent.click(screen.getByRole("combobox", { name: /Bind to/i }));
    expect(
      await screen.findByRole("option", { name: "run · activity" })
    ).toBeInTheDocument();
  });

  it("still tells the user to add an Output node when there is nothing to bind", () => {
    const field = bindingField("read");
    renderField(field.render(fieldProps), emptyState);
    expect(
      screen.getByText(/Add an Output node or Set Variable node/i)
    ).toBeInTheDocument();
  });

  it("offers the new condition operators once a binding is picked", async () => {
    const field = conditionField("Visible when");
    renderField(
      field.render({
        ...fieldProps,
        value: { binding: "op:main/out:o1", op: "contains" }
      }),
      stateWithOutput
    );
    await userEvent.click(screen.getByRole("combobox", { name: /Condition/i }));
    for (const label of ["contains", "is at least", "is at most"]) {
      expect(
        await screen.findByRole("option", { name: label })
      ).toBeInTheDocument();
    }
    // `contains` compares against a literal, so the value box is offered.
    expect(screen.getByLabelText("Value")).toBeInTheDocument();
  });
});
