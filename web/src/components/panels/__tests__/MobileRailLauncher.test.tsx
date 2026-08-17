/**
 * MobileRailLauncher tests
 *
 * On mobile the vertical rail isn't rendered, so the app menu (logo) and the
 * left-panel toggle ride in the workspace top row. These tests assert both
 * buttons are present and that the toggle flips the shared panel visibility.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import MobileRailLauncher from "../MobileRailLauncher";
import mockTheme from "../../../__mocks__/themeMock";
import { usePanelStore } from "../../../stores/PanelStore";

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn()
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

const renderLauncher = (showAppMenu = true) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MobileRailLauncher showAppMenu={showAppMenu} />
    </ThemeProvider>
  );

beforeEach(() => {
  usePanelStore.getState().setVisibility(false);
});

it("renders the app menu next to the panel toggle", () => {
  renderLauncher();

  expect(screen.getByLabelText("Open app menu")).toBeInTheDocument();
  expect(screen.getByLabelText("Open left panel")).toBeInTheDocument();
});

it("omits the app menu when showAppMenu is false", () => {
  renderLauncher(false);

  expect(screen.queryByLabelText("Open app menu")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Open left panel")).toBeInTheDocument();
});

it("toggles panel visibility", async () => {
  const user = userEvent.setup();
  renderLauncher();

  await user.click(screen.getByLabelText("Open left panel"));
  expect(usePanelStore.getState().panel.isVisible).toBe(true);

  await user.click(screen.getByLabelText("Close panel"));
  expect(usePanelStore.getState().panel.isVisible).toBe(false);
});
