import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Workflow } from "../../../stores/ApiTypes";
import type { AppDocument } from "../appData";

const addNotification = jest.fn();
const saveWorkflow = jest.fn();
const fetchWorkflow = jest.fn();

jest.mock("react-router-dom", () => ({
  useParams: () => ({ workflowId: "wf-1" }),
  useNavigate: () => jest.fn()
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (s: { addNotification: unknown }) => unknown
  ) => selector({ addNotification })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (
    selector: (s: { fetchWorkflow: unknown; saveWorkflow: unknown }) => unknown
  ) => selector({ fetchWorkflow, saveWorkflow })
}));

/** The layout + meta the editor emits when its Save button is pressed. */
const EDITED: Pick<AppDocument, "ui" | "variables"> = {
  ui: {
    root: { props: { title: "App" } },
    content: [{ type: "Text" }],
    zones: {}
  },
  variables: [{ id: "var-1", name: "count", scope: "instance", persist: false }]
};

jest.mock("../AppBuilderShell", () => ({
  __esModule: true,
  default: ({
    document,
    onSave
  }: {
    document: AppDocument;
    onSave: (document: AppDocument) => void;
  }) => (
    <button type="button" onClick={() => onSave({ ...document, ...EDITED })}>
      Save
    </button>
  )
}));

import AppBuilderPage from "../AppBuilderPage";

const workflow: Workflow = {
  id: "wf-1",
  name: "Workflow",
  description: "",
  graph: { nodes: [], edges: [] },
  access: "private",
  created_at: "",
  updated_at: "",
  app_doc: {
    schemaVersion: 3,
    ui: { root: { props: { title: "App" } }, content: [], zones: {} },
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
  }
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AppBuilderPage />
    </QueryClientProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  fetchWorkflow.mockResolvedValue(workflow);
  saveWorkflow.mockResolvedValue(workflow);
});

describe("AppBuilderPage", () => {
  it("saves the whole document back onto workflow.app_doc", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(saveWorkflow).toHaveBeenCalledWith({
      ...workflow,
      app_doc: {
        schemaVersion: 3,
        ui: EDITED.ui,
        operations: workflow.app_doc?.operations,
        resources: [],
        variables: EDITED.variables
      }
    });
    expect(addNotification).toHaveBeenCalledWith({
      type: "success",
      content: "App saved"
    });
  });

  it("reports a failed save", async () => {
    const user = userEvent.setup();
    saveWorkflow.mockRejectedValue(new Error("Server down"));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Save" }));

    expect(addNotification).toHaveBeenCalledWith({
      type: "error",
      content: "Server down"
    });
  });
});
