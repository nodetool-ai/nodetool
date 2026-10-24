/**
 * The app bar holds only app-scope controls. Document controls (View/Edit and
 * the rest) live in each document's own bar.
 */
import { render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../../stores/WorkspaceTabsStore";
import { SUPPORTS_BOTH_MODES } from "../WorkspaceDocumentBar";

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => ({ getState: () => ({ openWorkflows: [] }) })
}));
jest.mock("../../../hooks/useRenameDocument", () => ({
  useRenameDocument: () => jest.fn()
}));
jest.mock("../../../hooks/useWorkspaceDocumentClose", () => ({
  useWorkspaceDocumentClose: () => ({
    closeDocument: jest.fn(),
    closeOtherDocuments: jest.fn(),
    closeAllDocuments: jest.fn()
  })
}));
jest.mock("../../projects/ProjectSelector", () => ({
  __esModule: true,
  default: () => <button type="button">Project control</button>
}));
jest.mock("../OpenMenu", () => ({ __esModule: true, default: () => null }));
jest.mock("../WorkspaceTabItem", () => ({
  __esModule: true,
  default: ({ tab }: { tab: { title: string } }) => (
    <div role="tab">{tab.title}</div>
  )
}));
jest.mock("../../panels/NotificationButton", () => ({
  __esModule: true,
  default: () => <button type="button">Notifications</button>
}));
jest.mock("../../panels/SettingsHeaderButton", () => ({
  __esModule: true,
  default: () => <button type="button">Settings</button>
}));
jest.mock("../../panels/MobileRailLauncher", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../timeline/ActivityIndicator", () => ({
  ActivityIndicator: () => null
}));

import WorkspaceTabBar from "../WorkspaceTabBar";

const TAB_TYPES = Object.keys(SUPPORTS_BOTH_MODES) as WorkspaceTabType[];

describe("WorkspaceTabBar", () => {
  it.each(TAB_TYPES)("renders no document controls for a %s tab", (type) => {
    const tab = {
      id: `${type}:doc`,
      type,
      ref: "doc",
      mode: "edit" as const,
      title: "Doc"
    };
    useWorkspaceTabsStore.setState({
      tabs: [tab],
      activeTabId: tab.id,
      activeProjectId: null
    });

    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <WorkspaceTabBar />
      </ThemeProvider>
    );

    expect(screen.queryByRole("button", { name: "View" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Document mode" })).toBeNull();
    const rightEdge = container.querySelector(".right-actions") as HTMLElement;
    expect(
      within(rightEdge)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Notifications", "Settings"]);
  });

  it("puts the new-tab button after the last tab", () => {
    const tabs = ["a", "b"].map((ref) => ({
      id: `text:${ref}`,
      type: "text" as const,
      ref,
      mode: "view" as const,
      title: ref.toUpperCase()
    }));
    useWorkspaceTabsStore.setState({
      tabs,
      activeTabId: tabs[0].id,
      activeProjectId: null
    });

    render(
      <ThemeProvider theme={mockTheme}>
        <WorkspaceTabBar />
      </ThemeProvider>
    );

    const newTab = screen.getByRole("button", { name: "Open or create a tab" });
    const lastTab = screen.getAllByRole("tab").at(-1) as HTMLElement;
    expect(
      lastTab.compareDocumentPosition(newTab) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
