import { openPageTab, openSettingsTab } from "../openPageTab";
import { useWorkspaceTabsStore, tabId } from "../../../stores/WorkspaceTabsStore";
import { useSettingsPageStore } from "../../../stores/SettingsPageStore";

const mockNavigateTo = jest.fn();
jest.mock("../../../lib/appNavigation", () => ({
  navigateTo: (to: string) => mockNavigateTo(to)
}));

beforeEach(() => {
  mockNavigateTo.mockClear();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
  useSettingsPageStore.setState({ section: "general" });
});

describe("openPageTab", () => {
  it("opens the page as a tab and focuses the workspace", () => {
    openPageTab("costs");

    const { tabs, activeTabId } = useWorkspaceTabsStore.getState();
    expect(tabs).toEqual([
      expect.objectContaining({
        type: "page",
        ref: "costs",
        mode: "view",
        title: "Costs"
      })
    ]);
    expect(activeTabId).toBe(tabId("page", "costs"));
    expect(mockNavigateTo).toHaveBeenCalledWith("/workspace");
  });
});

describe("openSettingsTab", () => {
  it("defaults to the general section", () => {
    openSettingsTab();

    expect(useSettingsPageStore.getState().section).toBe("general");
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
      tabId("page", "settings")
    );
  });

  it("selects the requested section before opening the tab", () => {
    openSettingsTab("providers");

    expect(useSettingsPageStore.getState().section).toBe("providers");
  });

  it("focuses the existing tab rather than duplicating it", () => {
    openSettingsTab();
    openSettingsTab("integrations");

    expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1);
    expect(useSettingsPageStore.getState().section).toBe("integrations");
  });
});
