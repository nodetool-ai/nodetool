import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { WorkflowInputWidget } from "../WorkflowInputWidget";
import type { WorkflowInputIO } from "../../workflowIO";

const INPUT: WorkflowInputIO = {
  nodeId: "in1",
  nodeType: "nodetool.input.StringInput",
  name: "prompt",
  label: "Prompt",
  kind: "string"
};

/** The same node id in a second operation's graph, with a different name. */
const BATCH_INPUT: WorkflowInputIO = {
  nodeId: "in1",
  nodeType: "nodetool.input.StringInput",
  name: "photos",
  label: "Photos",
  kind: "string"
};

const renderWidget = (binding: string, label?: string) => {
  const io = { inputs: [INPUT], outputs: [] };
  const { wrapper: Wrapper } = makeTestRuntime(
    {},
    {
      io,
      ioFor: (operationId?: string) =>
        operationId === "batch" ? { inputs: [BATCH_INPUT], outputs: [] } : io
    }
  );
  render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>
        <WorkflowInputWidget id="in-prompt" binding={binding} label={label} />
      </Wrapper>
    </ThemeProvider>
  );
};

describe("WorkflowInputWidget", () => {
  it("resolves an ID-form binding to its input node", () => {
    renderWidget("op:main/in:in1");
    expect(screen.queryByText(/Unknown workflow input/)).toBeNull();
    expect(screen.getByLabelText("Prompt")).toBeInTheDocument();
  });

  it("still resolves a legacy name binding", () => {
    renderWidget("prompt");
    expect(screen.queryByText(/Unknown workflow input/)).toBeNull();
  });

  it("resolves against the graph of the operation the binding names", () => {
    renderWidget("op:batch/in:in1");
    expect(screen.queryByText(/Unknown workflow input/)).toBeNull();
    expect(screen.getByLabelText("Photos")).toBeInTheDocument();
  });

  it("prefers the widget's own label over the input node's name", () => {
    // PropertyLabel title-cases whatever name it is given.
    renderWidget("op:main/in:in1", "Your brief");
    expect(screen.getByLabelText("Your Brief")).toBeInTheDocument();
  });

  it("reports a binding that matches no input", () => {
    renderWidget("op:main/in:missing");
    expect(screen.getByText(/Unknown workflow input/)).toBeInTheDocument();
  });
});
