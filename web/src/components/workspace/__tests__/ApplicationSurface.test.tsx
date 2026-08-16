import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

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
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  tabId: (type: string, ref: string) => `${type}:${ref}`,
  useWorkspaceTabsStore: <T,>(
    selector: (s: { openTab: jest.Mock; activeTabId: string }) => T
  ) => selector({ openTab, activeTabId: "application:app-1" })
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
    applicationId
  }: {
    applicationId: string;
  }) {
    React.useEffect(() => {
      builderMounted(applicationId);
    }, [applicationId]);
    return <div data-testid="app-builder">{applicationId}</div>;
  }
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

beforeEach(() => {
  jest.clearAllMocks();
  state.error = null;
});

describe("ApplicationSurface", () => {
  it("opens an app on its builder canvas", () => {
    renderSurface();

    expect(screen.getByTestId("app-builder")).toHaveTextContent("app-1");
    expect(screen.queryByTestId("governance")).not.toBeInTheDocument();
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

    // One mount for the whole round trip: the canvas, its unsaved edits, and
    // the agent thread beside it are the same ones the user left.
    expect(builderMounted).toHaveBeenCalledTimes(1);
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
