import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SaveDestinationHint from "../SaveDestinationHint";
import { NodeData } from "../../../stores/NodeData";

const workspaces = [
  { id: "ws-1", name: "Renders", path: "/home/me/renders" }
];

let currentWorkspaceId: string | undefined = "ws-1";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    workspace: { list: { query: jest.fn(async () => ({ workspaces })) } }
  }
}));

jest.mock("../../../hooks/useCurrentWorkspace", () => ({
  useCurrentWorkspace: () => ({
    workspaceId: currentWorkspaceId,
    setWorkspaceId: jest.fn(),
    hasActiveWorkflow: true
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
    currentWorkspaceId = "ws-1";
  });

  it("names the workspace the file will land in", async () => {
    renderHint({ save_to_workspace: true });
    expect(await screen.findByText("Renders")).toBeInTheDocument();
  });

  it("says so when no workspace is assigned", () => {
    currentWorkspaceId = undefined;
    renderHint({ save_to_workspace: true });
    expect(
      screen.getByText(/No workspace yet — pick one in the toolbar/)
    ).toBeInTheDocument();
  });

  it("renders nothing while the toggle is off", () => {
    const { container } = renderHint({ save_to_workspace: false });
    expect(container).toBeEmptyDOMElement();
  });
});
