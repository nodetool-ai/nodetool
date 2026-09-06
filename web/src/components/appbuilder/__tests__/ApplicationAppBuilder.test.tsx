import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
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

const state: {
  application:
    | (Omit<typeof application, "document"> & { document: AppDocument })
    | null;
  error: Error | null;
} = { application, error: null };

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

const appGetQuery = jest.fn();

jest.mock("../../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      applications: { get: { invalidate: getInvalidate } }
    })
  },
  trpcClient: {
    applications: {
      get: { query: (...args: unknown[]) => appGetQuery(...args) }
    }
  }
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (s: { addNotification: unknown }) => T
  ) => selector({ addNotification })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (s: { fetchWorkflow: unknown }) => T) =>
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

/** An operation the agent binds mid-session, before anything is saved. */
const ADDED_OPERATION = {
  id: "calc",
  name: "Calculate",
  workflowId: "wf-2",
  inputs: {},
  outputs: {},
  policy: "replace" as const
};

jest.mock("../AppBuilderShell", () => ({
  __esModule: true,
  default: function MockAppBuilderShell({
    document,
    workflow,
    operationWorkflows,
    banner,
    onSave,
    onOperationsChange
  }: {
    document: AppDocument;
    workflow: { id: string };
    operationWorkflows?: Record<string, unknown>;
    banner?: React.ReactNode;
    onSave: (document: AppDocument) => void;
    onOperationsChange?: (operations: AppDocument["operations"]) => void;
  }) {
    // The real shell reports its seeded operations on mount, then again on
    // every change the agent's ui_app_* tools make.
    React.useEffect(() => {
      // Mount only, exactly as the shell seeds its own meta once.
      onOperationsChange?.(document.operations);
    }, []);
    return (
      <div>
        <div data-testid="bound-workflow">{workflow.id}</div>
        <div data-testid="loaded-workflows">
          {Object.keys(operationWorkflows ?? {})
            .sort()
            .join(",")}
        </div>
        <button type="button" onClick={() => onSave({ ...document, ...EDITED })}>
          Save
        </button>
        <button
          type="button"
          onClick={() =>
            onOperationsChange?.([...document.operations, ADDED_OPERATION])
          }
        >
          Add operation
        </button>
        {banner}
      </div>
    );
  }
}));

import ApplicationAppBuilder from "../ApplicationAppBuilder";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import {
  hasPuckAgentHandler,
  setPuckAgentHandler
} from "../puck/puckAgentBridge";
import { useConflictStore } from "../../../stores/ConflictStore";

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
  fetchWorkflow.mockImplementation(async (id: string) => ({
    id,
    name: "Workflow",
    description: "",
    graph: { nodes: [], edges: [] },
    access: "private",
    created_at: "",
    updated_at: ""
  }));
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
        schemaVersion: 4,
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

  it("loads the graph of an operation bound before the first save", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await waitFor(() =>
      expect(screen.getByTestId("loaded-workflows")).toHaveTextContent("wf-1")
    );

    await user.click(screen.getByRole("button", { name: "Add operation" }));

    // Without this the binding targets for `calc` answer ioAvailable: false,
    // because the saved row still names only wf-1.
    await waitFor(() =>
      expect(screen.getByTestId("loaded-workflows")).toHaveTextContent(
        "wf-1,wf-2"
      )
    );
    expect(fetchWorkflow).toHaveBeenCalledWith("wf-2");
  });

  it("binds the canvas to the first operation's workflow before any save", async () => {
    state.application = {
      ...application,
      document: { ...application.document, operations: [] }
    };
    const user = userEvent.setup();
    renderBuilder();

    expect(screen.getByTestId("bound-workflow")).toHaveTextContent("app-1");

    await user.click(screen.getByRole("button", { name: "Add operation" }));

    await waitFor(() =>
      expect(screen.getByTestId("bound-workflow")).toHaveTextContent("wf-2")
    );
  });

  it("reports the bound workflow so the surface can dock the agent", async () => {
    const onAgentWorkflowIdChange = jest.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeProvider theme={mockTheme}>
          <ApplicationAppBuilder
            applicationId="app-1"
            onAgentWorkflowIdChange={onAgentWorkflowIdChange}
          />
        </ThemeProvider>
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(onAgentWorkflowIdChange).toHaveBeenCalledWith("wf-1")
    );
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

describe("ApplicationAppBuilder merge", () => {
  const draftDocument = (): AppDocument => ({
    schemaVersion: 3,
    ui: {
      root: { props: { title: "Translator" } },
      content: [{ type: "Text", props: { id: "w-1", label: "Draft label" } }],
      zones: {}
    },
    operations: [],
    resources: [],
    variables: []
  });

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    if (hasPuckAgentHandler("app-1")) setPuckAgentHandler("app-1", null);
    useConflictStore.getState().clear("application:app-1");
  });

  it("merges an external add_component into a dirty canvas — both present", async () => {
    // The open editor holds a dirty widget label.
    const handler = {
      document: jest.fn(() => draftDocument()),
      applyExternalDocument: jest.fn()
    };
    setPuckAgentHandler("app-1", handler as never);

    renderBuilder();
    await screen.findByTestId("bound-workflow");

    const serverRow = {
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: {
        ...application.document,
        ui: {
          root: { props: { title: "Translator" } },
          content: [
            {
              type: "Text",
              props: { id: "w-1", label: "Stale label" }
            },
            { type: "Button", props: { id: "b-9", label: "Go" } }
          ],
          zones: {}
        }
      }
    };
    appGetQuery.mockResolvedValue(serverRow);

    await act_merge({
      event: "updated",
      resource_type: "application",
      id: "app-1",
      updatedAt: serverRow.updatedAt,
      ops: [{ tool: "ui_app_add_component", input: {} }]
    });

    expect(handler.applyExternalDocument).toHaveBeenCalledTimes(1);
    const applied = handler.applyExternalDocument.mock.calls[0][0] as AppDocument;
    const ids = (applied.ui.content as { props: { id: string } }[]).map(
      (c) => c.props.id
    );
    // Draft's dirty widget survives; the agent's button joins the canvas.
    expect(ids).toEqual(["w-1", "b-9"]);

    // The refused server value for w-1 is offered in the banner.
    await screen.findByText(/made outside the editor/i);
  });

  it("merges an external edit to a nested slot child without conflict", async () => {
    const column = (childLabel: string) => ({
      type: "Container",
      props: {
        id: "col-1",
        content: [{ type: "Text", props: { id: "c-1", label: childLabel } }]
      }
    });
    const treeDoc = (w1Label: string, childLabel: string): AppDocument => ({
      schemaVersion: 3,
      ui: {
        root: { props: { title: "Translator" } },
        content: [
          { type: "Text", props: { id: "w-1", label: w1Label } },
          column(childLabel)
        ],
        zones: {}
      },
      operations: [],
      resources: [],
      variables: []
    });

    // Base holds both widgets; the open editor dirties only w-1's label.
    state.application = {
      ...application,
      document: treeDoc("Base label", "Child base")
    };
    const appliedDocs: AppDocument[] = [];
    const handler = {
      document: jest.fn(() => treeDoc("Draft label", "Child base")),
      applyExternalDocument: jest.fn((doc: AppDocument) => {
        appliedDocs.push(JSON.parse(JSON.stringify(doc)) as AppDocument);
      })
    };
    setPuckAgentHandler("app-1", handler as never);

    renderBuilder();
    await screen.findByTestId("bound-workflow");

    // The agent rewrites only the nested child.
    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: treeDoc("Base label", "Child agent")
    });

    await act_merge({
      event: "updated",
      resource_type: "application",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_update_component", input: { id: "c-1" } }]
    });

    expect(handler.applyExternalDocument).toHaveBeenCalledTimes(1);
    const applied = appliedDocs[0];
    const content = applied.ui.content as {
      props: { id: string; label?: string; content?: { props: { label: string } }[] };
    }[];
    expect(content.map((c) => c.props.id)).toEqual(["w-1", "col-1"]);
    // Draft's dirty top-level widget survives…
    expect(content[0].props.label).toBe("Draft label");
    // …and the nested child took the server's label inside its parent's slot.
    expect(content[1].props.content?.[0]?.props.label).toBe("Child agent");
    expect(
      useConflictStore.getState().byKey["application:app-1"]
    ).toBeUndefined();
  });

  it("drops a child whose parent was removed elsewhere and reports it dangling", async () => {
    const treeDoc = (childLabel: string): AppDocument => ({
      schemaVersion: 3,
      ui: {
        root: { props: { title: "Translator" } },
        content: [
          {
            type: "Container",
            props: {
              id: "col-1",
              content: [
                { type: "Text", props: { id: "c-1", label: childLabel } }
              ]
            }
          }
        ],
        zones: {}
      },
      operations: [],
      resources: [],
      variables: []
    });

    state.application = {
      ...application,
      document: treeDoc("Child base")
    };
    const handler = {
      document: jest.fn(() => treeDoc("Child draft")),
      applyExternalDocument: jest.fn()
    };
    setPuckAgentHandler("app-1", handler as never);

    renderBuilder();
    await screen.findByTestId("bound-workflow");

    // The server removed the whole column while the user edited the child.
    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: {
        ...application.document,
        ui: {
          root: { props: { title: "Translator" } },
          content: [],
          zones: {}
        }
      }
    });

    await act_merge({
      event: "updated",
      resource_type: "application",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_remove_component", input: { id: "col-1" } }]
    });

    const applied = handler.applyExternalDocument.mock.calls[0][0] as AppDocument;
    expect(applied.ui.content).toEqual([]);
    const conflicts =
      useConflictStore.getState().byKey["application:app-1"]?.conflicts ?? [];
    expect(conflicts).toEqual([
      expect.objectContaining({
        unit: expect.objectContaining({ kind: "component", id: "c-1" }),
        reason: "dangling"
      })
    ]);
  });

  it("reloads a clean canvas instead of merging", async () => {
    const handler = {
      document: jest.fn(() => ({
        schemaVersion: 3,
        operations: application.document.operations,
        resources: [],
        variables: [],
        ui: {
          content: [],
          zones: {},
          root: { props: { title: "Translator" } }
        }
      })),
      applyExternalDocument: jest.fn()
    };
    setPuckAgentHandler("app-1", handler as never);
    renderBuilder();
    await screen.findByTestId("bound-workflow");

    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: {
        ...application.document,
        ui: {
          ...application.document.ui,
          content: [{ type: "Button", props: { id: "b-9", label: "Go" } }]
        }
      }
    });

    await act_merge({
      event: "updated",
      resource_type: "application",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_add_component", input: {} }]
    });

    expect(handler.applyExternalDocument).not.toHaveBeenCalled();
    expect(getInvalidate).toHaveBeenCalledWith({ id: "app-1" });
  });

  it("keeps ui.zones through a merge", async () => {
    const zones = {
      "header:zone": [{ type: "Text", props: { id: "z-1", label: "Head" } }]
    };
    const handler = {
      document: jest.fn(() => ({
        ...draftDocument(),
        ui: { ...draftDocument().ui, zones }
      })),
      applyExternalDocument: jest.fn()
    };
    setPuckAgentHandler("app-1", handler as never);
    renderBuilder();
    await screen.findByTestId("bound-workflow");

    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: {
        ...application.document,
        ui: {
          ...application.document.ui,
          content: [
            { type: "Text", props: { id: "w-1", label: "Stale label" } },
            { type: "Button", props: { id: "b-9", label: "Go" } }
          ]
        }
      }
    });

    await act_merge({
      event: "updated",
      resource_type: "application",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_add_component", input: {} }]
    });

    const applied = handler.applyExternalDocument.mock.calls[0][0] as AppDocument;
    expect(applied.ui.zones).toEqual(zones);
  });
});

describe("ApplicationAppBuilder merge base", () => {
  /** Two widgets: the user dirties `w-1` and never touches `b-2`. */
  const twoWidgetDoc = (w1: string, b2: string): AppDocument => ({
    schemaVersion: 3,
    ui: {
      root: { props: { title: "Translator" } },
      content: [
        { type: "Text", props: { id: "w-1", label: w1 } },
        { type: "Button", props: { id: "b-2", label: b2 } }
      ],
      zones: {}
    },
    operations: [],
    resources: [],
    variables: []
  });

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    if (hasPuckAgentHandler("app-1")) setPuckAgentHandler("app-1", null);
    useConflictStore.getState().clear("application:app-1");
  });

  it("keeps the merge base when a replacement was only offered", async () => {
    state.application = {
      ...application,
      document: twoWidgetDoc("Base label", "Base 2")
    };
    const handler = {
      document: jest.fn(() => twoWidgetDoc("Draft label", "Base 2")),
      applyExternalDocument: jest.fn()
    };
    setPuckAgentHandler("app-1", handler as never);
    renderBuilder();
    await screen.findByTestId("bound-workflow");

    // A write with no ops: the draft is left alone, the server copy is only
    // offered through the banner.
    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: twoWidgetDoc("Base label", "Server 1")
    });
    await act_merge({
      event: "updated",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z"
    });
    expect(handler.applyExternalDocument).not.toHaveBeenCalled();

    // A second, attributed write touches the widget the user never edited.
    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-13T10:00:00.000Z",
      document: twoWidgetDoc("Base label", "Server 2")
    });
    await act_merge({
      event: "updated",
      id: "app-1",
      updatedAt: "2026-07-13T10:00:00.000Z",
      ops: [{ tool: "ui_app_update_component", input: { id: "b-2" } }]
    });

    const applied = handler.applyExternalDocument.mock
      .calls[0][0] as AppDocument;
    const content = applied.ui.content as { props: { id: string; label: string } }[];
    // The untouched widget takes the server value instead of reading as a
    // draft edit against a base the offer moved.
    expect(content[1].props.label).toBe("Server 2");
    const conflicts =
      useConflictStore.getState().byKey["application:app-1"]?.conflicts ?? [];
    expect(conflicts.map((c) => c.unit.id)).not.toContain("b-2");
  });

  it("does not move the merge base under a dirty canvas on a refetch", async () => {
    state.application = {
      ...application,
      document: twoWidgetDoc("Base label", "Base 2")
    };
    const handler = {
      document: jest.fn(() => twoWidgetDoc("Draft label", "Base 2")),
      applyExternalDocument: jest.fn()
    };
    setPuckAgentHandler("app-1", handler as never);
    const { rerender } = renderBuilder();
    await screen.findByTestId("bound-workflow");

    // The row refetches after somebody else wrote it. The canvas is dirty, so
    // the merge base must stay where the draft branched from.
    state.application = {
      ...application,
      document: twoWidgetDoc("Base label", "Server 1"),
      updatedAt: "2026-07-12T10:00:00.000Z"
    };
    await act(async () => {
      rerender(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <ThemeProvider theme={mockTheme}>
            <ApplicationAppBuilder applicationId="app-1" />
          </ThemeProvider>
        </QueryClientProvider>
      );
    });

    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-13T10:00:00.000Z",
      document: twoWidgetDoc("Base label", "Server 2")
    });
    await act_merge({
      event: "updated",
      id: "app-1",
      updatedAt: "2026-07-13T10:00:00.000Z",
      ops: [{ tool: "ui_app_update_component", input: { id: "b-2" } }]
    });

    const applied = handler.applyExternalDocument.mock
      .calls[0][0] as AppDocument;
    const content = applied.ui.content as { props: { id: string; label: string } }[];
    expect(content[1].props.label).toBe("Server 2");
    const conflicts =
      useConflictStore.getState().byKey["application:app-1"]?.conflicts ?? [];
    expect(conflicts.map((c) => c.unit.id)).not.toContain("b-2");
  });
});

describe("ApplicationAppBuilder accept", () => {
  /** A handler that answers every read the accept path makes. */
  const acceptHandler = (draft: AppDocument, components: unknown[]) => ({
    document: jest.fn(() => draft),
    applyExternalDocument: jest.fn(),
    getSnapshot: jest.fn(() => ({
      applicationId: "app-1",
      rootProps: {},
      selectedId: null,
      componentTypes: [],
      components
    })),
    addComponent: jest.fn(),
    updateComponent: jest.fn(),
    removeComponent: jest.fn(),
    listOperations: jest.fn(() => []),
    listVariables: jest.fn(() => []),
    listResources: jest.fn(() => [{ id: "r-1", name: "Docs" }]),
    addResource: jest.fn(),
    updateResource: jest.fn(),
    removeResource: jest.fn(),
    setRootProps: jest.fn()
  });

  beforeEach(() => {
    useConflictStore.setState({ byKey: {} });
  });

  afterEach(() => {
    if (hasPuckAgentHandler("app-1")) setPuckAgentHandler("app-1", null);
    useConflictStore.getState().clear("application:app-1");
  });

  const acceptFirst = (kind: string, id?: string): void => {
    const entry = useConflictStore.getState().byKey["application:app-1"];
    const target = entry?.conflicts.find(
      (c) => c.unit.kind === kind && (id === undefined || c.unit.id === id)
    );
    if (!target) throw new Error(`no ${kind} conflict was listed`);
    act(() =>
      useConflictStore.getState().accept("application:app-1", target.unit.id)
    );
  };

  it("applies an accepted component whose type changed elsewhere", async () => {
    const docWith = (type: string, label: string): AppDocument => ({
      schemaVersion: 3,
      ui: {
        root: { props: { title: "Translator" } },
        content: [{ type, props: { id: "w-1", label } }],
        zones: {}
      },
      operations: [],
      resources: [],
      variables: []
    });
    state.application = { ...application, document: docWith("Text", "Base") };
    const handler = acceptHandler(docWith("Text", "Draft"), [
      { id: "w-1", type: "Text", props: { label: "Draft" }, parentId: null, slot: null }
    ]);
    setPuckAgentHandler("app-1", handler as never);
    renderBuilder();
    await screen.findByTestId("bound-workflow");

    // The agent swapped the widget's type where the user was editing it.
    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: docWith("Button", "Base")
    });
    await act_merge({
      event: "updated",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_update_component", input: { id: "w-1" } }]
    });

    acceptFirst("component", "w-1");

    // Patching props cannot change a type: the component is replaced.
    expect(handler.removeComponent).toHaveBeenCalledWith("w-1");
    expect(handler.addComponent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "Button" })
    );
  });

  it("routes an accepted resource through updateResource", async () => {
    const docWithResource = (projectId: string): AppDocument => ({
      schemaVersion: 3,
      ui: { root: { props: {} }, content: [], zones: {} },
      operations: [],
      resources: [
        {
          id: "r-1",
          name: "Docs",
          kind: "asset" as const,
          scope: { projectId },
          operations: []
        }
      ],
      variables: []
    });
    state.application = {
      ...application,
      document: docWithResource("Base")
    };
    const handler = acceptHandler(docWithResource("Draft"), []);
    setPuckAgentHandler("app-1", handler as never);
    renderBuilder();
    await screen.findByTestId("bound-workflow");

    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: docWithResource("Server")
    });
    await act_merge({
      event: "updated",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_add_component", input: {} }]
    });

    acceptFirst("resource", "r-1");

    expect(handler.updateResource).toHaveBeenCalledWith(
      "r-1",
      expect.objectContaining({ id: "r-1", scope: { projectId: "Server" } })
    );
  });

  it("applies accepted zones through the external-document path", async () => {
    const docWithZones = (label: string): AppDocument => ({
      schemaVersion: 3,
      ui: {
        root: { props: {} },
        content: [],
        zones: { "header:zone": [{ type: "Text", props: { id: "z-1", label } }] }
      },
      operations: [],
      resources: [],
      variables: []
    });
    state.application = { ...application, document: docWithZones("Base") };
    const handler = acceptHandler(docWithZones("Draft"), []);
    setPuckAgentHandler("app-1", handler as never);
    renderBuilder();
    await screen.findByTestId("bound-workflow");

    appGetQuery.mockResolvedValue({
      updatedAt: "2026-07-12T10:00:00.000Z",
      document: docWithZones("Server")
    });
    await act_merge({
      event: "updated",
      id: "app-1",
      updatedAt: "2026-07-12T10:00:00.000Z",
      ops: [{ tool: "ui_app_add_component", input: {} }]
    });

    acceptFirst("field", "zones");

    const applied = handler.applyExternalDocument.mock.calls.at(-1)?.[0] as
      | AppDocument
      | undefined;
    expect(applied?.ui.zones).toEqual(docWithZones("Server").ui.zones);
  });
});

async function act_merge(notice: unknown): Promise<void> {
  const { act } = await import("@testing-library/react");
  handleDocumentResourceChange(
    "application",
    notice as unknown as { event: "updated"; id: string; updatedAt: string }
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
