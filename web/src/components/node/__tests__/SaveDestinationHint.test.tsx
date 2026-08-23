import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SaveDestinationHint from "../SaveDestinationHint";
import { NodeData } from "../../../stores/NodeData";

const renders = { id: "ws-1", name: "Renders", path: "/home/me/renders" };

let currentWorkspace: typeof renders | undefined = renders;

jest.mock("../../../hooks/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaceId: currentWorkspace?.id,
    workspace: currentWorkspace,
    setWorkspaceId: jest.fn(),
    hasActiveWorkflow: true,
    canManage: true
  })
}));

const renderHint = (properties: Record<string, unknown>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <SaveDestinationHint data={{ properties } as unknown as NodeData} />
      </ThemeProvider>
    </QueryClientProvider>
  );

describe("SaveDestinationHint", () => {
  beforeEach(() => {
    currentWorkspace = renders;
  });

  it("names the workspace the file will land in", async () => {
    renderHint({ save_to_workspace: true });
    expect(await screen.findByText("Renders")).toBeInTheDocument();
  });

  it("falls back to a bare label while the list is still loading", () => {
    currentWorkspace = undefined;
    renderHint({ save_to_workspace: true });
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders nothing while the toggle is off", () => {
    const { container } = renderHint({ save_to_workspace: false });
    expect(container).toBeEmptyDOMElement();
  });
});
