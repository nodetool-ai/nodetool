/**
 * RailAppMenu tests
 *
 * The logo menu opens app pages (Settings, Costs, Model Manager, …) as
 * workspace tabs instead of navigating to their own routes. These tests drive
 * the menu with the real WorkspaceTabsStore and assert a `page` tab is opened
 * and the workspace is focused.
 */

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

// Page tabs are opened through the router singleton, which no test registers.
const mockNavigateTo = jest.fn();
jest.mock("../../../lib/appNavigation", () => ({
  navigateTo: (to: string) => mockNavigateTo(to)
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

const renderMenu = (onAction?: () => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RailAppMenu onAction={onAction} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockNavigate.mockClear();
  mockNavigateTo.mockClear();
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
  expect(mockNavigateTo).toHaveBeenCalledWith("/workspace");
});

it("opens Workspaces as a page tab", async () => {
  const user = userEvent.setup();
  renderMenu();

  await user.click(screen.getByRole("button", { name: /open app menu/i }));
  await user.click(screen.getByRole("menuitem", { name: /workspaces/i }));

  const { tabs, activeTabId } = useWorkspaceTabsStore.getState();
  const expectedId = tabId("page", "workspaces");
  expect(tabs).toEqual([
    expect.objectContaining({
      id: expectedId,
      type: "page",
      ref: "workspaces",
      title: "Workspaces"
    })
  ]);
  expect(activeTabId).toBe(expectedId);
});

it("reports the pick to its host so the mobile sheet can dismiss", async () => {
  const user = userEvent.setup();
  const onAction = jest.fn();
  renderMenu(onAction);

  await user.click(screen.getByRole("button", { name: /open app menu/i }));
  await user.click(screen.getByRole("menuitem", { name: /settings/i }));

  expect(onAction).toHaveBeenCalledTimes(1);
});

it("does not report a dismissed menu as a pick", async () => {
  const user = userEvent.setup();
  const onAction = jest.fn();
  renderMenu(onAction);

  await user.click(screen.getByRole("button", { name: /open app menu/i }));
  await user.keyboard("{Escape}");

  expect(onAction).not.toHaveBeenCalled();
});
