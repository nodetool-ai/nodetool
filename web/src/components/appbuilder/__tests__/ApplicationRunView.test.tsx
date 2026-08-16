/**
 * Running an app renders its release, not the canvas — and falls back to the
 * draft only while nothing is published.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import type { Data } from "@puckeditor/core";

import type { Workflow } from "../../../stores/ApiTypes";

const fetchWorkflow = jest.fn();
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (s: { fetchWorkflow: unknown }) => T) =>
    selector({ fetchWorkflow })
}));

const useApplication = jest.fn();
const useReleasedApplicationDocument = jest.fn();
jest.mock("../../../hooks/useApplications", () => ({
  useApplication: (id: string) => useApplication(id),
  useReleasedApplicationDocument: (id: string) =>
    useReleasedApplicationDocument(id)
}));

jest.mock("../AppRuntimeView", () => ({
  __esModule: true,
  default: ({
    workflow,
    data
  }: {
    workflow: Workflow;
    data: Data;
  }) => (
    <div data-testid="runtime">
      <span data-testid="workflow">{workflow.id}</span>
      <span data-testid="title">{String(data.root?.props?.title ?? "")}</span>
    </div>
  )
}));

import ApplicationRunView from "../ApplicationRunView";

const ui = (title: string) => ({
  root: { props: { title } },
  content: [{ type: "Text", props: { id: "t1" } }],
  zones: {}
});

const appDocument = (title: string) => ({
  schemaVersion: 3,
  ui: ui(title),
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-1",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ],
  resources: [],
  variables: []
});

const liveWorkflow: Workflow = {
  id: "wf-1",
  name: "Workflow",
  description: "",
  graph: { nodes: [], edges: [] },
  access: "private",
  created_at: "",
  updated_at: ""
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <ApplicationRunView applicationId="app-1" />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  fetchWorkflow.mockResolvedValue(liveWorkflow);
  useApplication.mockReturnValue({
    data: { id: "app-1", name: "App", document: appDocument("Draft") },
    isLoading: false
  });
  useReleasedApplicationDocument.mockReturnValue({
    data: null,
    isLoading: false
  });
});

describe("ApplicationRunView", () => {
  it("runs the released snapshot when one exists", async () => {
    useReleasedApplicationDocument.mockReturnValue({
      data: {
        version: 3,
        document: appDocument("Released"),
        workflows: [
          { workflowId: "wf-1", version: 2, graphHash: null, graph: { nodes: [], edges: [] } }
        ]
      },
      isLoading: false
    });

    renderView();

    expect(await screen.findByTestId("title")).toHaveTextContent("Released");
    expect(screen.getByText(/Running released version 3/)).toBeInTheDocument();
    // The pinned graph is used, so the live workflow is never fetched.
    expect(fetchWorkflow).not.toHaveBeenCalled();
  });

  it("falls back to the draft when nothing is released", async () => {
    renderView();

    expect(await screen.findByTestId("title")).toHaveTextContent("Draft");
    expect(screen.getByText(/no released version/)).toBeInTheDocument();
    await waitFor(() => expect(fetchWorkflow).toHaveBeenCalledWith("wf-1"));
  });

  it("reports a workflow it cannot load rather than rendering an inert app", async () => {
    fetchWorkflow.mockRejectedValue(new Error("gone"));
    renderView();

    expect(await screen.findByText(/Workflow unavailable/)).toBeInTheDocument();
    expect(screen.queryByTestId("runtime")).not.toBeInTheDocument();
  });

  it("runs an app that binds no workflow at all", async () => {
    useApplication.mockReturnValue({
      data: {
        id: "app-1",
        name: "App",
        document: { ...appDocument("Draft"), operations: [] }
      },
      isLoading: false
    });

    renderView();

    expect(await screen.findByTestId("runtime")).toBeInTheDocument();
    expect(screen.getByTestId("workflow")).toHaveTextContent("app-1");
    expect(screen.queryByText(/Workflow unavailable/)).not.toBeInTheDocument();
    expect(fetchWorkflow).not.toHaveBeenCalled();
  });
});
