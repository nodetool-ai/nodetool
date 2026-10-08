/**
 * Picking an example brief rewrites the field and removes the button that was
 * clicked, so each idea step hands `ExampleBriefs` its field to focus (O5).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { WORKFLOW_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";

import mockTheme from "../../../__mocks__/themeMock";
import { WorkflowIdeaStep } from "../workflow/IdeaStep";
import { IdeaStep as ImageIdeaStep } from "../image/IdeaStep";

const sketchState = {
  document: { setup: { brief: "" } },
  setSetup: jest.fn()
};
jest.mock("../../sketch/state/useSketchStore", () => ({
  useSketchStore: (selector: (state: unknown) => unknown) =>
    selector(sketchState)
}));
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));
jest.mock("../../../hooks/workflow/useWorkflowSetup", () => ({
  useWorkflowSetupDocument: () => ({ brief: "" })
}));

const wrap = (node: React.ReactNode) =>
  render(<ThemeProvider theme={mockTheme}>{node}</ThemeProvider>);

it("focuses the workflow brief after an example is picked", async () => {
  const user = userEvent.setup();
  wrap(
    <WorkflowIdeaStep
      workflowId="w"
      onBriefChange={jest.fn()}
      browsingExamples={false}
      onBrowseExamples={jest.fn()}
      onStartFromExample={jest.fn()}
      onImport={jest.fn()}
      onStartBlank={jest.fn()}
    />
  );

  await user.click(
    screen.getByRole("button", { name: WORKFLOW_INSPIRATION_CHIPS[0].brief })
  );

  expect(screen.getByRole("textbox", { name: "The task" })).toHaveFocus();
});

it("focuses the image brief after an example is picked", async () => {
  const user = userEvent.setup();
  wrap(
    <ImageIdeaStep
      onStartBlank={jest.fn()}
      upload={{ error: null, clearError: jest.fn() } as never}
    />
  );
  const inspiration = screen.getByRole("group", { name: "Inspiration" });
  const [first] = Array.from(inspiration.querySelectorAll("button"));

  await user.click(first);

  expect(screen.getByRole("textbox", { name: "Your image" })).toHaveFocus();
});
