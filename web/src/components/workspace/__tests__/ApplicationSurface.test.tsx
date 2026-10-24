import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { stub } from "../../../test-utils/doubles";
import { useDocumentDraftStore } from "../../../stores/DocumentDraftStore";

const state: { error: Error | null } = { error: null };

jest.mock("../../../hooks/useApplications", () => ({
  useApplication: () => ({
    data: state.error
      ? undefined
      : {
          id: "app-1",
          projectId: "default",
          name: "Translator",
          description: "Translates things",
          document: { schemaVersion: 3, ui: { root: {}, content: [] } },
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-11T10:00:00.000Z"
        },
    isLoading: false,
    isError: state.error !== null,
    error: state.error
  }),
  useLinkedWorkflows: () => ({ links: [] })
}));

const openTab = jest.fn();
const setTitle = jest.fn();
const resolveApplicationInstance = jest.fn();
const setApplicationRunSelection = jest.fn();
const setMode = jest.fn();
let tabs: Array<{
  type: string;
  ref: string;
  instanceId?: string;
  title: string;
  projectId?: string;
}> = [];
const releaseQuery = jest.fn();
const defaultInstance = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    applications: {
      releasedDocument: { query: (...args: unknown[]) => releaseQuery(...args) }
    }
  }
}));
jest.mock("../../appbuilder/runtime/appInstanceApi", () => ({
  defaultAppInstance: (...args: unknown[]) => defaultInstance(...args)
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  tabId: (type: string, ref: string, instanceId?: string) =>
    instanceId ? `${type}:${ref}:instance:${instanceId}` : `${type}:${ref}`,
  useWorkspaceTabsStore: <T,>(
    selector: (s: {
      openTab: jest.Mock;
      setTitle: jest.Mock;
      activeTabId: string;
      tabs: typeof tabs;
      resolveApplicationInstance: jest.Mock;
      setApplicationRunSelection: jest.Mock;
      setMode: jest.Mock;
    }) => T
  ) =>
    selector({
      openTab,
      setTitle,
      tabs,
      resolveApplicationInstance,
      setApplicationRunSelection,
      setMode,
      activeTabId: "application:app-1"
    })
}));

const linkedProps = jest.fn();
jest.mock("../LinkedWorkflowsMenu", () => ({
  __esModule: true,
  LinkedWorkflowsList: (props: {
    applicationId: string;
    active?: boolean;
    anchorEl: HTMLElement | null;
  }) => {
    linkedProps(props);
    return props.anchorEl ? (
      <div data-testid="linked-workflows">{props.applicationId}</div>
    ) : null;
  }
}));

// The bar draws each slot; the title and rename are WorkspaceDocumentBar's own.
jest.mock("../WorkspaceDocumentBar", () => ({
  __esModule: true,
  default: ({
    tab,
    status,
    history,
    mode,
    view,
    actions
  }: {
    tab: { title: string };
  } & Record<"status" | "history" | "mode" | "view" | "actions", React.ReactNode>) => (
    <div role="toolbar" aria-label={`${tab.title} document`}>
      {status}
      {history}
      {mode}
      {view}
      {actions}
    </div>
  )
}));

const appTab = (title = "Translator", instanceId?: string) => ({
  id: instanceId ? `application:app-1:instance:${instanceId}` : "application:app-1",
  type: "application" as const,
  ref: "app-1",
  instanceId,
  mode: instanceId ? ("view" as const) : ("edit" as const),
  title
});

/** Preview draft sits in the bar's ⋮ menu. */
const openPreviewDraft = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(screen.getByRole("menuitem", { name: "Preview draft" }));
};

const builderMounted = jest.fn();
jest.mock("../../appbuilder/ApplicationAppBuilder", () => ({
  __esModule: true,
  default: function MockApplicationAppBuilder({
    applicationId,
    onAgentWorkflowIdChange,
    assistantPanel
  }: {
    applicationId: string;
    onAgentWorkflowIdChange?: (workflowId: string | undefined) => void;
    assistantPanel?: React.ReactNode;
  }) {
    React.useEffect(() => {
      builderMounted(applicationId);
      onAgentWorkflowIdChange?.("wf-1");
    }, [applicationId, onAgentWorkflowIdChange]);
    return (
      <div>
        <div data-testid="app-builder">{applicationId}</div>
        {assistantPanel !== undefined && (
          <div data-testid="builder-assistant-panel">{assistantPanel}</div>
        )}
      </div>
    );
  }
}));

const runMounted = jest.fn();
jest.mock("../../appbuilder/ApplicationRunView", () => ({
  __esModule: true,
  default: function RunView(props: {
    applicationId: string;
    instanceId?: string;
    previewDraft?: boolean;
  }) {
    React.useEffect(() => {
      runMounted(props);
    }, [props.applicationId, props.instanceId, props.previewDraft]);
    return <div data-testid="app-run">{props.applicationId}</div>;
  }
}));

const assistantMounted = jest.fn();
jest.mock("../../appbuilder/AppBuilderAgentPanel", () => ({
  __esModule: true,
  default: function MockAppBuilderAgentPanel({
    applicationId,
    workflowId
  }: {
    applicationId: string;
    workflowId?: string;
  }) {
    React.useEffect(() => {
      assistantMounted();
    }, []);
    return (
      <div data-testid="app-assistant">
        {applicationId}:{workflowId ?? "none"}
      </div>
    );
  }
}));

jest.mock("../../applications/ApplicationGovernancePanel", () => ({
  __esModule: true,
  default: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="governance">{applicationId}</div>
  )
}));

import ApplicationSurface from "../ApplicationSurface";

const renderSurface = (mode: "edit" | "view" = "edit") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        <ApplicationSurface refId="app-1" mode={mode} tab={appTab()} />
      </QueryClientProvider>
    </ThemeProvider>
  );

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = global.ResizeObserver;
let surfaceWidth = 1200;

beforeEach(() => {
  jest.clearAllMocks();
  state.error = null;
  tabs = [];
  releaseQuery.mockResolvedValue(null);
  defaultInstance.mockResolvedValue({
    id: "default-instance",
    name: "Default"
  });
  surfaceWidth = 1200;
  global.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          stub<ResizeObserverEntry>({
            target,
            contentRect: stub<DOMRectReadOnly>({ width: surfaceWidth })
          })
        ],
        this
      );
    }
    unobserve() {}
    disconnect() {}
  };
  // Wide viewport: the assistant docks on the right of every view.
  window.matchMedia = jest.fn((query: string) =>
    stub<MediaQueryList>({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    })
  );
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  global.ResizeObserver = originalResizeObserver;
});

describe("ApplicationSurface", () => {
  it("focuses the mounted working instance instead of mounting a second released writer in its editor", async () => {
    tabs = [
      {
        type: "application",
        ref: "app-1",
        instanceId: "existing-instance",
        title: "Spring sale",
        projectId: "project"
      }
    ];
    const client = new QueryClient();
    render(
      <ThemeProvider theme={mockTheme}>
        <QueryClientProvider client={client}>
          <ApplicationSurface
            refId="app-1"
            instanceId="existing-instance"
            mode="view"
            tab={appTab("Spring sale", "existing-instance")}
          />
          <ApplicationSurface refId="app-1" mode="edit" tab={appTab()} />
        </QueryClientProvider>
      </ThemeProvider>
    );
    expect(runMounted).toHaveBeenCalledTimes(1);
    await userEvent.click(
      within(screen.getByRole("toolbar", { name: "Translator document" })).getByRole("button", { name: "Run" })
    );
    expect(openTab).toHaveBeenCalledWith({
      type: "application",
      ref: "app-1",
      instanceId: "existing-instance",
      title: "Spring sale",
      projectId: "project",
      mode: "view"
    });
    expect(runMounted).toHaveBeenCalledTimes(1);
    expect(defaultInstance).not.toHaveBeenCalled();
    expect(screen.getByTestId("app-builder")).toBeInTheDocument();
  });

  it("resolves the default snapshot without a persistent editor runtime when no working tab exists", async () => {
    releaseQuery.mockResolvedValue({
      version: 2,
      document: createEmptyDocument()
    });
    renderSurface();
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(openTab).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: "default-instance",
          mode: "view"
        })
      )
    );
    expect(defaultInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        application_id: "app-1",
        source_id: "application:app-1",
        version: 2
      })
    );
    expect(runMounted).not.toHaveBeenCalled();
    expect(screen.getByTestId("app-builder")).toBeInTheDocument();
  });

  it("keeps draft preview separate when returning to the working instance", async () => {
    tabs = [
      {
        type: "application",
        ref: "app-1",
        instanceId: "existing-instance",
        title: "Spring sale"
      }
    ];
    renderSurface();
    await openPreviewDraft(userEvent.setup());
    expect(runMounted).toHaveBeenCalledWith(
      expect.objectContaining({ previewDraft: true })
    );
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: "existing-instance" })
    );
    expect(
      runMounted.mock.calls.every(([props]) => props.previewDraft === true)
    ).toBe(true);
    expect(defaultInstance).not.toHaveBeenCalled();
  });
  it("opens an app on its builder canvas", () => {
    renderSurface();

    expect(screen.getByTestId("app-builder")).toHaveTextContent("app-1");
    expect(screen.queryByTestId("governance")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-assistant")).toHaveTextContent("app-1:wf-1");
    expect(setTitle).toHaveBeenCalledWith("app-1", "application", "Translator");
  });

  it("keeps the bar to the title and Run/Design/Settings when running an app", () => {
    renderSurface("view");

    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.getByTestId("app-run")).toBeInTheDocument();
    expect(screen.queryByTestId("app-builder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-assistant")).not.toBeInTheDocument();
  });

  it("switches to publish and budget controls", async () => {
    const user = userEvent.setup();
    renderSurface();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(screen.getByTestId("governance")).toHaveTextContent("app-1");
  });

  it("keeps the builder mounted while another view is showing", async () => {
    const user = userEvent.setup();
    renderSurface();
    expect(builderMounted).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "Design" }));

    // One mount for the whole round trip: the canvas and its unsaved edits
    // are the same ones the user left.
    expect(builderMounted).toHaveBeenCalledTimes(1);
  });

  it("removes inactive mounted layers from the accessibility tree", async () => {
    const user = userEvent.setup();
    renderSurface();

    await openPreviewDraft(user);
    expect(screen.getByTestId("application-design-layer")).toHaveAttribute(
      "inert"
    );
    expect(screen.getByTestId("application-design-layer")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(screen.getByTestId("application-run-layer")).not.toHaveAttribute(
      "inert"
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("application-run-layer")).toHaveAttribute(
      "inert"
    );
    expect(
      screen.getByTestId("application-settings-layer")
    ).not.toHaveAttribute("inert");
  });

  it("mounts the run layer when preview opens directly from design", async () => {
    const user = userEvent.setup();
    renderSurface();

    await openPreviewDraft(user);

    expect(screen.getByTestId("app-run")).toHaveTextContent("app-1");
    expect(screen.getByTestId("application-run-layer")).not.toHaveAttribute(
      "inert"
    );
  });

  it("docks the assistant in the builder in design and beside run and settings, as one chat", async () => {
    const user = userEvent.setup();
    renderSurface();

    // Design: a builder dock panel, so the author can move it.
    expect(
      within(screen.getByTestId("builder-assistant-panel")).getByTestId("app-assistant")
    ).toHaveTextContent("app-1:wf-1");
    expect(screen.queryByTestId("assistant-side-dock")).not.toBeInTheDocument();

    await openPreviewDraft(user);
    expect(screen.getByTestId("app-run")).toHaveTextContent("app-1");
    expect(screen.queryByTestId("builder-assistant-panel")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("assistant-side-dock")).getByTestId("app-assistant")
    ).toHaveTextContent("app-1:wf-1");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("governance")).toHaveTextContent("app-1");
    expect(
      within(screen.getByTestId("assistant-side-dock")).getByTestId("app-assistant")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Design" }));
    expect(
      within(screen.getByTestId("builder-assistant-panel")).getByTestId("app-assistant")
    ).toBeInTheDocument();
    // The chat moved between hosts without remounting, so its thread survives.
    expect(assistantMounted).toHaveBeenCalledTimes(1);
  });

  it("isolates inactive mounted layers from keyboard and assistive technology", async () => {
    const user = userEvent.setup();
    renderSurface();

    await openPreviewDraft(user);
    expect(screen.getByTestId("application-design-layer")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(screen.getByTestId("application-design-layer")).toHaveAttribute(
      "inert"
    );
    expect(screen.getByTestId("application-run-layer")).not.toHaveAttribute(
      "inert"
    );

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("application-run-layer")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(screen.getByTestId("application-run-layer")).toHaveAttribute(
      "inert"
    );
    expect(
      screen.getByTestId("application-settings-layer")
    ).not.toHaveAttribute("inert");
  });

  it("restores focus to the assistant button after closing its narrow overlay", async () => {
    const user = userEvent.setup();
    surfaceWidth = 700;
    window.matchMedia = jest.fn((query: string) =>
      stub<MediaQueryList>({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      })
    );
    renderSurface();

    const openButton = screen.getByRole("button", { name: "Ask agent" });
    await user.click(openButton);
    expect(
      screen.getByRole("dialog", { name: "App builder assistant" })
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Close agent" }));
    expect(screen.getByRole("button", { name: "Ask agent" })).toHaveFocus();
  });

  it("links its workflows from the ⋮ menu without opening one", async () => {
    const user = userEvent.setup();
    renderSurface();
    expect(screen.queryByTestId("linked-workflows")).toBeNull();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: /workflow/i }));

    expect(screen.getByTestId("linked-workflows")).toHaveTextContent("app-1");
    expect(linkedProps).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app-1", active: true })
    );
    expect(openTab).not.toHaveBeenCalled();
  });

  it("asks for edit mode when Design is picked while running", async () => {
    const user = userEvent.setup();
    renderSurface("view");

    await user.click(screen.getByRole("button", { name: "Design" }));

    expect(setMode).toHaveBeenCalledWith("application:app-1", "edit");
  });

  it("reports unsaved builder edits in the bar", () => {
    useDocumentDraftStore.getState().setDirty("application:app-1", true);
    renderSurface();

    expect(
      screen.getByRole("toolbar", { name: "Translator document" })
    ).toHaveTextContent("Unsaved changes");
    useDocumentDraftStore.getState().setDirty("application:app-1", false);
  });

  it("reports an app that could not be loaded", () => {
    state.error = new Error("Application not found");
    renderSurface();

    expect(screen.getByText("Application not found")).toBeInTheDocument();
  });
});
