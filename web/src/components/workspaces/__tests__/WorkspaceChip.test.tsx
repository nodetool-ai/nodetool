import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import WorkspaceChip from "../WorkspaceChip";

const renders = {
  id: "ws-renders",
  name: "Renders",
  path: "/home/me/renders",
  is_default: true
};

let isMobile = false;
let canManage = true;

jest.mock("@mui/material/useMediaQuery", () => ({
  __esModule: true,
  default: () => isMobile
}));

jest.mock("../../../hooks/useWorkspaces", () => ({
  useWorkspaces: () => ({
    workspaces: [renders],
    canManage,
    defaultWorkspace: renders,
    isLoading: false,
    error: null
  }),
  useWorkspaceCacheWriter: () => jest.fn()
}));

jest.mock("../../../hooks/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaceId: renders.id,
    workspace: renders,
    setWorkspaceId: jest.fn(),
    hasActiveWorkflow: false,
    canManage
  })
}));

const renderChip = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <WorkspaceChip />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("WorkspaceChip", () => {
  beforeEach(() => {
    isMobile = false;
    canManage = true;
  });

  it("shows the workspace name with no workflow open", () => {
    renderChip();
    expect(screen.getByText("Renders")).toBeInTheDocument();
  });

  it("drops the label on a phone but stays reachable by name", () => {
    isMobile = true;
    renderChip();
    expect(screen.queryByText("Renders")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: renders.path })
    ).toBeInTheDocument();
  });

  it("offers adding a folder only where the deployment allows it", async () => {
    canManage = false;
    renderChip();
    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Add workspace…")).not.toBeInTheDocument();
    expect(screen.getByText(renders.path)).toBeInTheDocument();
  });
});
