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
  });

  it("offers the project archive in the overflow menu", async () => {
    const onExportBundle = jest.fn();
    renderTopBar({ onExportBundle });

    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    await userEvent.click(await screen.findByText("Export project (.zip)"));
    expect(onExportBundle).toHaveBeenCalledTimes(1);
  });

  it("shows the busy label while the archive is being prepared", async () => {
    renderTopBar({ onExportBundle: jest.fn(), isExportingBundle: true });
    await userEvent.click(
      screen.getByRole("button", { name: "More timeline actions" })
    );
    expect(
      await screen.findByRole("menuitem", { name: "Exporting…" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("omits the action when no handler is given", () => {
    renderTopBar({ onSave: jest.fn() });
    expect(
      screen.queryByRole("button", { name: "More timeline actions" })
    ).not.toBeInTheDocument();
  });
});
