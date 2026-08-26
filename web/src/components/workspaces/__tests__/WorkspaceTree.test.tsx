import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import WorkspaceTree from "../WorkspaceTree";
import { useWorkspaceExplorerStore } from "../../../stores/WorkspaceExplorerStore";

const defaultWorkspace = {
  id: "ws-default",
  name: "Default",
  path: "/data/workspaces/u1",
  is_default: true
};
const renders = {
  id: "ws-renders",
  name: "Renders",
  path: "/home/me/renders",
  is_default: false
};

const listFiles = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workspace: {
      listFiles: { query: (input: unknown) => listFiles(input) }
    }
  }
}));

jest.mock("../../../hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    workspaces: [defaultWorkspace, renders],
    canManage: true,
    defaultWorkspace,
    isLoading: false,
    error: null
  }),
  useWorkspaceCacheWriter: () => jest.fn()
}));

// No WorkflowManagerProvider and no workflow: the tree must still resolve a
// workspace and list it. Jest maps the workflow-manager context to a mock whose
// current workflow is always null, so a tree that reads it renders its old
// "No workflow selected" state here and these tests go red.
const renderTree = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <WorkspaceTree />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("WorkspaceTree", () => {
  beforeEach(() => {
    listFiles.mockReset();
    listFiles.mockResolvedValue([
      { name: "notes.md", path: "notes.md", is_dir: false, size: 12 }
    ]);
    useWorkspaceExplorerStore.getState().setBrowsedWorkspaceId(null);
  });

  it("lists the default workspace's files with no workflow open", async () => {
    renderTree();
    expect(await screen.findByText("notes.md")).toBeInTheDocument();
    expect(listFiles).toHaveBeenCalledWith({ id: "ws-default", path: "." });
  });

  it("browses the workspace the user picked, not a workflow's", async () => {
    renderTree();
    await screen.findByText("notes.md");

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByText(renders.path));

    await waitFor(() => {
      expect(listFiles).toHaveBeenCalledWith({ id: "ws-renders", path: "." });
    });
    expect(useWorkspaceExplorerStore.getState().browsedWorkspaceId).toBe(
      "ws-renders"
    );
  });
});
