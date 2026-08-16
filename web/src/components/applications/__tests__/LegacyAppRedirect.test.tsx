/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    applications: {
      list: { query: jest.fn() },
      get: { query: jest.fn() }
    }
  }
}));

const openTab = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (state: { openTab: jest.Mock }) => T) =>
    selector({ openTab })
}));

import { trpcClient } from "../../../trpc/client";
import LegacyAppRedirect from "../LegacyAppRedirect";

const listQuery = trpcClient.applications.list.query as jest.Mock;
const getQuery = trpcClient.applications.get.query as jest.Mock;

const renderAt = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/miniapp/:workflowId"
              element={<LegacyAppRedirect />}
            />
            <Route path="/workspace" element={<div>workspace</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

const appWithWorkflow = (id: string, workflowId: string) => ({
  id,
  name: `App ${id}`,
  document: { operations: [{ id: "main", workflowId }] }
});

describe("LegacyAppRedirect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens the app tab that binds the workflow and lands on the workspace", async () => {
    listQuery.mockResolvedValue([{ id: "app-1" }, { id: "app-2" }]);
    getQuery.mockImplementation(async ({ id }: { id: string }) =>
      id === "app-1"
        ? appWithWorkflow("app-1", "other-wf")
        : appWithWorkflow("app-2", "wf-1")
    );

    renderAt("/miniapp/wf-1");

    await waitFor(() =>
      expect(openTab).toHaveBeenCalledWith({
        type: "application",
        ref: "app-2",
        mode: "edit",
        title: "App app-2"
      })
    );
    expect(await screen.findByText("workspace")).toBeInTheDocument();
  });

  it("shows a not-found state when no app binds the workflow", async () => {
    listQuery.mockResolvedValue([{ id: "app-1" }]);
    getQuery.mockResolvedValue(appWithWorkflow("app-1", "other-wf"));

    renderAt("/miniapp/wf-1");

    expect(await screen.findByText("App not found")).toBeInTheDocument();
    expect(openTab).not.toHaveBeenCalled();
  });
});
