import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { ALL_PROJECTS, useAssetGridStore } from "../../../stores/AssetGridStore";
import WorkflowTree from "../WorkflowTree";

const workflowsByProject: Record<string, { id: string; name: string }[]> = {
  "project-a": [{ id: "wf-a", name: "Alpha workflow" }],
  "project-b": [{ id: "wf-b", name: "Beta workflow" }]
};

const load = jest.fn(
  async (_cursor?: string, _limit?: number, projectId?: string) => ({
    workflows: projectId
      ? workflowsByProject[projectId] ?? []
      : Object.values(workflowsByProject).flat(),
    next: null
  })
);

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (state: { load: typeof load }) => T) =>
    selector({ load })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  useWorkspaceTabsStore: <T,>(
    selector: (state: { activeProjectId: string; personalProjectId: null }) => T
  ) => selector({ activeProjectId: "project-a", personalProjectId: null })
}));

const renderTree = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <WorkflowTree />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("WorkflowTree project scope", () => {
  beforeEach(() => {
    load.mockClear();
    useAssetGridStore.setState({ projectFilter: null, workflowFilter: null });
  });

  it("lists only the workspace project's workflows by default", async () => {
    renderTree();
    expect(await screen.findByText("Alpha workflow")).toBeInTheDocument();
    expect(screen.queryByText("Beta workflow")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("", 200, "project-a");
  });

  it("follows the explorer's project filter", async () => {
    renderTree();
    await screen.findByText("Alpha workflow");

    act(() => useAssetGridStore.getState().setProjectFilter("project-b"));

    expect(await screen.findByText("Beta workflow")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Alpha workflow")).not.toBeInTheDocument()
    );
    expect(load).toHaveBeenLastCalledWith("", 200, "project-b");
  });

  it("lists every workflow under All projects", async () => {
    useAssetGridStore.setState({ projectFilter: ALL_PROJECTS });
    renderTree();

    expect(await screen.findByText("Alpha workflow")).toBeInTheDocument();
    expect(screen.getByText("Beta workflow")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("", 200, undefined);
  });
});
