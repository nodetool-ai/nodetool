import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import type { AppDocument } from "../appData";

const addNotification = jest.fn();
const mutateAsync = jest.fn();
const getInvalidate = jest.fn().mockResolvedValue(undefined);
const fetchWorkflow = jest.fn();

const application = {
  id: "app-1",
  projectId: "default",
  name: "Translator",
  description: "",
  document: {
    schemaVersion: 3,
    ui: { root: { props: { title: "Translator" } }, content: [], zones: {} },
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-1",
        inputs: {},
        outputs: {},
        policy: "replace" as const
      }
    ],
    resources: [],
    variables: []
  },
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-11T10:00:00.000Z"
};

const state: { application: typeof application | null; error: Error | null } = {
  application,
  error: null
};

jest.mock("../../../hooks/useApplications", () => ({
  ...jest.requireActual("../../../hooks/useApplications"),
  useApplication: () => ({
    data: state.error ? undefined : state.application,
    isLoading: false,
    isError: state.error !== null,
    error: state.error
  }),
  useUpdateApplication: () => ({ mutateAsync, isPending: false })
}));

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      applications: { get: { invalidate: getInvalidate } }
    })
  }
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (s: { addNotification: unknown }) => unknown
  ) => selector({ addNotification })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (s: { fetchWorkflow: unknown }) => unknown) =>
    selector({ fetchWorkflow })
}));

/** The layout + meta the editor emits when its Save button is pressed. */
const EDITED: Pick<AppDocument, "ui" | "variables"> = {
  ui: {
    root: { props: { title: "Translator" } },
    content: [{ type: "Text" }],
    zones: {}
  },
  variables: [
    { id: "var-1", name: "count", scope: "instance", persist: false }
  ]
};

jest.mock("../AppBuilderShell", () => ({
  __esModule: true,
  default: ({
    document,
    workflow,
    banner,
    onSave
  }: {
    document: AppDocument;
    workflow: { id: string };
    banner?: React.ReactNode;
    onSave: (document: AppDocument) => void;
  }) => (
    <div>
      <div data-testid="bound-workflow">{workflow.id}</div>
      <button
        type="button"
        onClick={() => onSave({ ...document, ...EDITED })}
      >
        Save
      </button>
      {banner}
    </div>
  )
}));

import ApplicationAppBuilder from "../ApplicationAppBuilder";

const conflictError = { data: { code: "CONFLICT" }, message: "conflict" };

const renderBuilder = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ThemeProvider theme={mockTheme}>
        <ApplicationAppBuilder applicationId="app-1" />
      </ThemeProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  state.application = application;
  state.error = null;
  mutateAsync.mockResolvedValue(application);
  fetchWorkflow.mockResolvedValue({
    id: "wf-1",
    name: "Workflow",
    description: "",
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "",
    updated_at: ""
  });
});

describe("ApplicationAppBuilder", () => {
  it("saves the whole document with the row it read as the CAS base", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: "app-1",
      baseUpdatedAt: "2026-07-11T10:00:00.000Z",
      document: {
        schemaVersion: 3,
        ui: EDITED.ui,
        operations: application.document.operations,
        resources: [],
        variables: EDITED.variables
      }
    });
    expect(addNotification).toHaveBeenCalledWith({
      type: "success",
      content: "App saved"
    });
  });

  it("reports a lost compare-and-swap instead of dropping the edit", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(conflictError);
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(addNotification).toHaveBeenCalledWith({
      type: "error",
      alert: true,
      content: '"Translator" changed elsewhere — your edits were not saved.'
    });
    expect(await screen.findByText("Saved elsewhere")).toBeInTheDocument();
    // The canvas is left alone: nothing refetched it out from under the user.
    expect(getInvalidate).not.toHaveBeenCalled();
  });

  it("refetches only when the user asks to reload after a conflict", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(conflictError);
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(getInvalidate).toHaveBeenCalledWith({ id: "app-1" });
    expect(screen.queryByText("Saved elsewhere")).not.toBeInTheDocument();
  });

  it("reports an ordinary save failure", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error("Server down"));
    renderBuilder();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(addNotification).toHaveBeenCalledWith({
      type: "error",
      alert: true,
      content: "Server down"
    });
    expect(screen.queryByText("Saved elsewhere")).not.toBeInTheDocument();
  });

  it("opens on a canvas even before a workflow is bound", () => {
    state.application = {
      ...application,
      document: { ...application.document, operations: [] }
    };
    renderBuilder();

    expect(screen.getByTestId("bound-workflow")).toHaveTextContent("app-1");
    expect(fetchWorkflow).not.toHaveBeenCalled();
  });
});
