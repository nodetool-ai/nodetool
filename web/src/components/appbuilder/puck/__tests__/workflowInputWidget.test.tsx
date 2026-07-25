import React from "react";
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

const renderWidget = (binding: string) => {
  const { wrapper: Wrapper } = makeTestRuntime(
    {},
    { io: { inputs: [INPUT], outputs: [] } }
  );
  render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>
        <WorkflowInputWidget id="in-prompt" binding={binding} />
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

  it("reports a binding that matches no input", () => {
    renderWidget("op:main/in:missing");
    expect(screen.getByText(/Unknown workflow input/)).toBeInTheDocument();
  });
});
