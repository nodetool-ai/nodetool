/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../TopBarPrompt", () => ({
  TopBarPrompt: () => <div data-testid="top-bar-prompt" />
}));

const mockIsMobile = jest.fn(() => false);
jest.mock("../../../hooks/timeline/useTimelineIsMobile", () => ({
  useTimelineIsMobile: () => mockIsMobile()
}));

import { TopBar } from "../TopBar";

const renderTopBar = (props: React.ComponentProps<typeof TopBar>) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TopBar {...props} />
    </ThemeProvider>
  );

describe("TopBar project archive action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsMobile.mockReturnValue(false);
  });

  it("renders a wide-layout button that fires the callback", async () => {
    const onExportBundle = jest.fn();
    renderTopBar({ onExportBundle });

    const button = screen.getByRole("button", {
      name: "Export project (.zip)"
    });
    await userEvent.click(button);
    expect(onExportBundle).toHaveBeenCalledTimes(1);
  });

  it("shows the busy label while the archive is being prepared", () => {
    renderTopBar({ onExportBundle: jest.fn(), isExportingBundle: true });
    const button = screen.getByRole("button", { name: "Exporting…" });
    expect(button).toBeDisabled();
  });

  it("offers the action in the compact overflow menu", async () => {
    mockIsMobile.mockReturnValue(true);
    const onExportBundle = jest.fn();
    renderTopBar({ onExportBundle });

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const item = await screen.findByText("Export project (.zip)");
    await userEvent.click(item);
    expect(onExportBundle).toHaveBeenCalledTimes(1);
  });

  it("omits the action when no handler is given", () => {
    renderTopBar({ onSave: jest.fn() });
    expect(
      screen.queryByRole("button", { name: "Export project (.zip)" })
    ).not.toBeInTheDocument();
  });
});
