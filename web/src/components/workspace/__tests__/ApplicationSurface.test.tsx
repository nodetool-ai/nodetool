import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { stub } from "../../../test-utils/doubles";

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
  })
}));

const openTab = jest.fn();
const setTitle = jest.fn();
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  tabId: (type: string, ref: string) => `${type}:${ref}`,
  useWorkspaceTabsStore: <T,>(
    selector: (s: {
      openTab: jest.Mock;
      setTitle: jest.Mock;
      activeTabId: string;
    }) => T
  ) => selector({ openTab, setTitle, activeTabId: "application:app-1" })
}));

const linkedProps = jest.fn();
jest.mock("../LinkedWorkflowsMenu", () => ({
  __esModule: true,
  default: (props: { applicationId: string; active?: boolean }) => {
    linkedProps(props);
    return <div data-testid="linked-workflows">{props.applicationId}</div>;
  }
}));

const builderMounted = jest.fn();
jest.mock("../../appbuilder/ApplicationAppBuilder", () => ({
  __esModule: true,
  default: function MockApplicationAppBuilder({
    applicationId,
    onAgentWorkflowIdChange
  }: {
    applicationId: string;
    onAgentWorkflowIdChange?: (workflowId: string | undefined) => void;
  }) {
    React.useEffect(() => {
      builderMounted(applicationId);
      onAgentWorkflowIdChange?.("wf-1");
    }, [applicationId, onAgentWorkflowIdChange]);
    return <div data-testid="app-builder">{applicationId}</div>;
  }
}));

jest.mock("../../appbuilder/ApplicationRunView", () => ({
  __esModule: true,
  default: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="app-run">{applicationId}</div>
  )
}));

jest.mock("../../appbuilder/AppBuilderAgentPanel", () => ({
  __esModule: true,
  default: ({
    applicationId,
    workflowId
  }: {
    applicationId: string;
    workflowId?: string;
  }) => (
    <div data-testid="app-assistant">
      {applicationId}:{workflowId ?? "none"}
    </div>
  )
}));

jest.mock("../../applications/ApplicationGovernancePanel", () => ({
  __esModule: true,
  default: ({ applicationId }: { applicationId: string }) => (
    <div data-testid="governance">{applicationId}</div>
  )
}));

import ApplicationSurface from "../ApplicationSurface";

const renderSurface = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ApplicationSurface refId="app-1" />
    </ThemeProvider>
  );

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  jest.clearAllMocks();
  state.error = null;
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
});

describe("ApplicationSurface", () => {
  it("opens an app on its builder canvas", () => {
    renderSurface();

    expect(screen.getByTestId("app-builder")).toHaveTextContent("app-1");
    expect(screen.queryByTestId("governance")).not.toBeInTheDocument();
    expect(screen.getByTestId("app-assistant")).toHaveTextContent("app-1:wf-1");
    expect(setTitle).toHaveBeenCalledWith("app-1", "application", "Translator");
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

  it("keeps the assistant on the right in design, run, and settings", async () => {
    const user = userEvent.setup();
    renderSurface();

    expect(screen.getByTestId("assistant-side-dock")).toBeInTheDocument();
    expect(screen.getByTestId("app-assistant")).toHaveTextContent("app-1:wf-1");

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByTestId("app-run")).toHaveTextContent("app-1");
    expect(screen.getByTestId("assistant-side-dock")).toBeInTheDocument();
    expect(screen.getByTestId("app-assistant")).toHaveTextContent("app-1:wf-1");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("governance")).toHaveTextContent("app-1");
    expect(screen.getByTestId("assistant-side-dock")).toBeInTheDocument();
    expect(screen.getByTestId("app-assistant")).toHaveTextContent("app-1:wf-1");
  });

  it("links its workflows without opening one", () => {
    renderSurface();

    expect(screen.getByTestId("linked-workflows")).toHaveTextContent("app-1");
    expect(linkedProps).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app-1", active: true })
    );
    expect(openTab).not.toHaveBeenCalled();
  });

  it("reports an app that could not be loaded", () => {
    state.error = new Error("Application not found");
    renderSurface();

    expect(screen.getByText("Application not found")).toBeInTheDocument();
  });
});
