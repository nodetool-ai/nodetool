import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { DEFAULT_OPERATION_ID } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { WorkflowFormWidget } from "../WorkflowFormWidget";
import type { WorkflowFormWidgetProps } from "../WorkflowFormWidget";
import type { WorkflowInputIO, WorkflowIO } from "../../workflowIO";
import type { AppRuntimeContextValue } from "../../runtime/AppRuntimeContext";

const PROMPT: WorkflowInputIO = {
  nodeId: "in1",
  nodeType: "nodetool.input.StringInput",
  name: "prompt",
  label: "Prompt",
  kind: "string",
  description: "What to write about"
};

const TITLE: WorkflowInputIO = {
  nodeId: "in2",
  nodeType: "nodetool.input.StringInput",
  name: "title",
  label: "Title",
  kind: "string",
  description: "Headline for the piece"
};

const PROMPT_KEY = `${DEFAULT_OPERATION_ID}:in1`;
const TITLE_KEY = `${DEFAULT_OPERATION_ID}:in2`;

const renderForm = (
  props: Partial<WorkflowFormWidgetProps> = {},
  io: WorkflowIO = { inputs: [PROMPT, TITLE], outputs: [] },
  overrides: Partial<AppRuntimeContextValue> = {}
) => {
  const runtime = makeTestRuntime(
    {},
    { io, ioFor: () => io, ...overrides }
  );
  render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <WorkflowFormWidget id="form-1" {...props} />
      </runtime.wrapper>
    </ThemeProvider>
  );
  return runtime;
};

describe("WorkflowFormWidget", () => {
  it("renders one control per workflow input", () => {
    renderForm({ label: "Brief" });
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("writes a change to that input's own slot and no other", async () => {
    const { store } = renderForm();
    await userEvent.type(screen.getByLabelText("Prompt"), "hi");

    expect(store.getState().inputs[PROMPT_KEY]?.value).toBe("hi");
    expect(store.getState().inputs[TITLE_KEY]).toBeUndefined();
  });

  it("dispatches the widget's change events", async () => {
    const { value } = renderForm({
      events: [{ trigger: "change", kind: "run" }]
    });
    await userEvent.type(screen.getByLabelText("Title"), "x");

    expect(value.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run", operationId: DEFAULT_OPERATION_ID })
    );
  });

  it("shows each input's description by default", () => {
    renderForm();
    expect(screen.getByText("What to write about")).toBeInTheDocument();
    expect(screen.getByText("Headline for the piece")).toBeInTheDocument();
  });

  it("hides descriptions when showDescriptions is 'no'", () => {
    renderForm({ showDescriptions: "no" });
    expect(screen.queryByText("What to write about")).toBeNull();
    expect(screen.queryByText("Headline for the piece")).toBeNull();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
  });

  it("says so when the operation has no inputs", () => {
    renderForm({}, { inputs: [], outputs: [] });
    expect(screen.getByText("This operation has no inputs.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("lists the inputs as a hint in design mode instead of rendering controls", () => {
    renderForm({ label: "Brief" }, { inputs: [PROMPT, TITLE], outputs: [] }, {
      designMode: true
    });
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByText("Prompt — string")).toBeInTheDocument();
    expect(screen.getByText("Title — string")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
