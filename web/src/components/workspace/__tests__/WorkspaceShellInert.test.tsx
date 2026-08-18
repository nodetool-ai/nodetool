import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import WorkspaceShell from "../WorkspaceShell";
import mockTheme from "../../../__mocks__/themeMock";

// Every tab stays mounted, so a hidden tab's components still see every
// keystroke. `inert` is what keeps them from taking focus (see
// utils/browser.ts canTakeFocus).
const tabs = [
  { id: "tab-a", type: "workflow", ref: "wf-a", mode: "edit", title: "A" },
  { id: "tab-b", type: "workflow", ref: "wf-b", mode: "edit", title: "B" },
  { id: "tab-c", type: "timeline", ref: "tl-c", title: "C" }
];

const tabsState = {
  tabs,
  activeTabId: "tab-b",
  setTitle: jest.fn()
};

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: <T,>(selector: (state: typeof tabsState) => T) =>
    selector(tabsState)
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (state: unknown) => T) =>
    selector({ setCurrentWorkflowId: jest.fn(), openWorkflows: [] })
}));

jest.mock("../../../stores/PanelStore", () => ({
  usePanelStore: <T,>(selector: (state: unknown) => T) =>
    selector({ panel: { isVisible: false, panelSize: 300 } })
}));

jest.mock("../../../hooks/useWorkspaceMenuShortcuts", () => ({
  useWorkspaceMenuShortcuts: () => undefined
}));

// The shell lazy-loads its panels; stub them so the test renders synchronously.
jest.mock("../../panels/PanelLeft", () => () => <div />);
jest.mock("../../panels/PanelRight", () => () => <div />);
jest.mock("../../panels/PanelBottom", () => () => <div />);
jest.mock("../../node_editor/Alert", () => () => <div />);

jest.mock("../WorkspaceTabBar", () => () => <div data-testid="tab-bar" />);
jest.mock("../WorkspaceEmptyView", () => () => <div />);
jest.mock("../TabContent", () => ({ tab }: { tab: { id: string } }) => (
  <div data-testid={`content-${tab.id}`} />
));

describe("WorkspaceShell tab layers", () => {
  it("marks every inactive tab layer inert and the active one not", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <WorkspaceShell />
      </ThemeProvider>
    );

    const layers = Array.from(
      container.querySelectorAll<HTMLElement>(".tab-layer")
    );
    expect(layers).toHaveLength(tabs.length);

    const active = layers.filter((l) => !l.hasAttribute("inert"));
    const inactive = layers.filter((l) => l.hasAttribute("inert"));

    expect(active).toHaveLength(1);
    expect(active[0].querySelector('[data-testid="content-tab-b"]')).not.toBe(
      null
    );
    expect(inactive).toHaveLength(2);
  });
});
