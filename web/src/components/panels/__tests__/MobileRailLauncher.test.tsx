/**
 * MobileRailLauncher tests
 *
 * On mobile the vertical rail isn't rendered, so the left-panel toggle rides in
 * the workspace top row. The sheet it opens is the one navigation surface
 * mobile has — the logo/app menu is a section inside it, not a second button
 * here.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import MobileRailLauncher from "../MobileRailLauncher";
import mockTheme from "../../../__mocks__/themeMock";
import { usePanelStore } from "../../../stores/PanelStore";

const renderLauncher = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MobileRailLauncher />
    </ThemeProvider>
  );

beforeEach(() => {
  usePanelStore.getState().setVisibility(false);
});

it("renders the panel toggle and no app menu", () => {
  renderLauncher();

  expect(screen.getByLabelText("Open left panel")).toBeInTheDocument();
  expect(screen.queryByLabelText("Open app menu")).not.toBeInTheDocument();
});

it("toggles panel visibility", async () => {
  const user = userEvent.setup();
  renderLauncher();

  await user.click(screen.getByLabelText("Open left panel"));
  expect(usePanelStore.getState().panel.isVisible).toBe(true);

  await user.click(screen.getByLabelText("Close panel"));
  expect(usePanelStore.getState().panel.isVisible).toBe(false);
});
