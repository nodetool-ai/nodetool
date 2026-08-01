import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { bindingField, conditionField, variableField } from "../puck/fields";
import { BuilderWorkflowProvider } from "../puck/BuilderWorkflowContext";
import type { OperationBinding } from "@nodetool-ai/app-runtime";

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

describe("bindings target the app's declared operations", () => {
  const operation = (id: string, name: string): OperationBinding => ({
    id,
    name,
    workflowId: `wf-${id}`,
    inputs: {},
    outputs: {},
    policy: "replace"
  });

  const stateWith = (
    inputs: WorkflowState["inputs"],
    outputs: WorkflowState["outputs"] = []
  ): WorkflowState => ({
    inputs,
    outputs,
    variables: [],
    nodes: [],
    resources: []
  });

  const promptInput = stateWith([
    {
      nodeId: "i1",
      nodeType: "nodetool.input.StringInput",
      name: "prompt",
      label: "Prompt",
      kind: "string"
    }
  ]);

  const renderWithOperations = (
    element: React.ReactElement,
    operations: OperationBinding[],
    states: Map<string, WorkflowState>
  ) =>
    render(
      <ThemeProvider theme={mockTheme}>
        <BuilderWorkflowProvider
          value={states.get(operations[0].id) ?? emptyState}
          operations={operations}
          states={states}
        >
          {element}
        </BuilderWorkflowProvider>
      </ThemeProvider>
    );

  it("writes the generated operation id of a blank app, not `main`", async () => {
    const onChange = jest.fn();
    const ops = [operation("operation_1", "Operation 1")];
    renderWithOperations(
      bindingField("write").render({ ...fieldProps, onChange }),
      ops,
      new Map([["operation_1", promptInput]])
    );

    await userEvent.click(
      screen.getByPlaceholderText(/Search inputs and node properties/i)
    );
    await userEvent.click(await screen.findByRole("option", { name: "Prompt" }));

    expect(onChange).toHaveBeenCalledWith("op:operation_1/in:i1");
  });

  it("binds a widget to the operation the author picks", async () => {
    const onChange = jest.fn();
    const ops = [operation("draft", "Draft"), operation("publish", "Publish")];
    const states = new Map([
      ["draft", promptInput],
      [
        "publish",
        stateWith([
          {
            nodeId: "i2",
            nodeType: "nodetool.input.StringInput",
            name: "slug",
            label: "Slug",
            kind: "string"
          }
        ])
      ]
    ]);
    renderWithOperations(
      bindingField("write").render({ ...fieldProps, onChange }),
      ops,
      states
    );

    await userEvent.click(screen.getByRole("combobox", { name: /Operation/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Publish" }));

    await userEvent.click(
      screen.getByPlaceholderText(/Search inputs and node properties/i)
    );
    await userEvent.click(await screen.findByRole("option", { name: "Slug" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith("op:publish/in:i2")
    );
  });

  it("resolves a legacy `main` binding onto the app's sole operation", () => {
    const ops = [operation("operation_1", "Operation 1")];
    const states = new Map([
      [
        "operation_1",
        stateWith([], [
          {
            nodeId: "o1",
            nodeType: "nodetool.output.StringOutput",
            name: "result",
            label: "Result"
          }
        ])
      ]
    ]);
    renderWithOperations(
      bindingField("read").render({ ...fieldProps, value: "op:main/out:o1" }),
      ops,
      states
    );

    // The stored token names an operation the app does not have; it resolves to
    // the only one, so the picker shows the bound output instead of nothing.
    expect(screen.getByRole("combobox", { name: /Bind to/i })).toHaveTextContent(
      "output · Result"
    );
  });

  it("offers no operation chooser to a single-operation app", () => {
    renderWithOperations(
      bindingField("write").render(fieldProps),
      [operation("operation_1", "Operation 1")],
      new Map([["operation_1", promptInput]])
    );
    expect(
      screen.queryByRole("combobox", { name: /Operation/i })
    ).not.toBeInTheDocument();
  });
});
