/**
 * RailAppMenu tests
 *
 * The logo menu opens app pages (Settings, Costs, Model Manager, …) as
 * workspace tabs instead of navigating to their own routes. These tests drive
 * the menu with the real WorkspaceTabsStore and assert a `page` tab is opened
 * and the workspace is focused.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import RailAppMenu from "../RailAppMenu";
import mockTheme from "../../../__mocks__/themeMock";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";
import { tabId } from "../../../stores/WorkspaceTabsStore";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate
}));

jest.mock("../../content/Help/Help", () => () => null);
jest.mock("../../Logo", () => () => <span data-testid="logo" />);

jest.mock("../../../stores/KeyPressedStore", () => ({
  useCombo: jest.fn()
}));

jest.mock("../../../stores/AppHeaderStore", () => ({
  useAppHeaderStore: () => ({
    helpOpen: false,
    handleCloseHelp: jest.fn(),
    handleOpenHelp: jest.fn(),
    setHelpIndex: jest.fn()
  })
}));

jest.mock("../../../stores/ModelDownloadStore", () => ({
  useModelDownloadStore: () => ({ downloads: {}, openDialog: jest.fn() })
}));

const renderMenu = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RailAppMenu />
    </ThemeProvider>
  );

beforeEach(() => {
  mockNavigate.mockClear();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
});

it("opens Settings as a page tab and focuses the workspace", async () => {
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole("button", { name: /open app menu/i }));
  await user.click(screen.getByRole("menuitem", { name: /settings/i }));

  const { tabs, activeTabId } = useWorkspaceTabsStore.getState();
  const expectedId = tabId("page", "settings");
  expect(tabs).toEqual([
    expect.objectContaining({
      id: expectedId,
      type: "page",
      ref: "settings",
      mode: "view",
      title: "Settings"
    })
  ]);
  expect(activeTabId).toBe(expectedId);
  expect(mockNavigate).toHaveBeenCalledWith("/workspace");
});

it("keeps Dashboard on its route (not a tab)", async () => {
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole("button", { name: /open app menu/i }));
  await user.click(screen.getByRole("menuitem", { name: /dashboard/i }));

  expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(0);
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
});
