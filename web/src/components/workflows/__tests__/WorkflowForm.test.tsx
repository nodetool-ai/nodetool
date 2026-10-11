import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { Workflow } from "../../../stores/ApiTypes";
import { stub } from "../../../test-utils/doubles";
import WorkflowForm from "../WorkflowForm";

const saveWorkflow = jest.fn(async () => undefined);
let liveWorkflow: Workflow;

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  __esModule: true,
  useWorkflowManager: <T,>(selector: (state: unknown) => T) =>
    selector({
      saveWorkflow,
      getNodeStore: () => ({ getState: () => ({ getWorkflow: () => liveWorkflow }) })
    })
}));
jest.mock("../../workspaces/WorkspaceSelect", () => ({
  __esModule: true,
  default: () => null
}));

const workflow = (name: string): Workflow =>
  stub<Workflow>({
    id: "wf-1",
    name,
    description: "old description",
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    tags: [],
    graph: { nodes: [], edges: [] }
  });

describe("WorkflowForm", () => {
  beforeEach(() => {
    saveWorkflow.mockClear();
  });

  it("keeps a rename made elsewhere and saves without a version snapshot", () => {
    const { unmount } = render(
      <ThemeProvider theme={mockTheme}>
        <WorkflowForm workflow={workflow("Old name")} onClose={jest.fn()} />
      </ThemeProvider>
    );
    // The tab renames the workflow while the form still holds "Old name".
    liveWorkflow = workflow("Renamed in tab");

    fireEvent.change(screen.getByDisplayValue("old description"), {
      target: { name: "description", value: "new description" }
    });
    unmount();

    expect(saveWorkflow).toHaveBeenCalledTimes(1);
    expect(saveWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Renamed in tab",
        description: "new description"
      }),
      { snapshot: false }
    );
  });
});
