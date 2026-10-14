/**
 * SettingsHeaderButton tests
 *
 * The header gear opens Settings as a workspace page tab, on the General
 * section, like the Cmd/Ctrl+, shortcut.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import SettingsHeaderButton from "../SettingsHeaderButton";
import mockTheme from "../../../__mocks__/themeMock";
import { useWorkspaceTabsStore, tabId } from "../../../stores/WorkspaceTabsStore";
import { useSettingsPageStore } from "../../../stores/SettingsPageStore";

// Page tabs are opened through the router singleton, which no test registers.
const mockNavigateTo = jest.fn();
jest.mock("../../../lib/appNavigation", () => ({
  navigateTo: (to: string) => mockNavigateTo(to)
}));

const renderButton = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SettingsHeaderButton />
    </ThemeProvider>
  );

beforeEach(() => {
  mockNavigateTo.mockClear();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
});

describe("SettingsHeaderButton", () => {
  it("renders an accessible Settings button", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("opens the Settings page tab on the General section", async () => {
    useSettingsPageStore.getState().setSection("providers");
    renderButton();

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    const state = useWorkspaceTabsStore.getState();
    expect(state.activeTabId).toBe(tabId("page", "settings"));
    expect(state.tabs).toEqual([
      expect.objectContaining({ type: "page", ref: "settings", title: "Settings" })
    ]);
    expect(useSettingsPageStore.getState().section).toBe("general");
    expect(mockNavigateTo).toHaveBeenCalledWith("/workspace");
  });
});
