import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { MenuItemPrimitive } from "../MenuItemPrimitive";

const renderRow = (ui: React.ReactElement) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ul role="menu">{ui}</ul>
    </ThemeProvider>
  );

describe("MenuItemPrimitive", () => {
  it("renders a plain row as a menuitem", () => {
    renderRow(<MenuItemPrimitive label="Rename" />);
    const row = screen.getByRole("menuitem", { name: "Rename" });
    expect(row).not.toHaveAttribute("aria-checked");
  });

  it("marks the picked radio row checked and selected", () => {
    renderRow(
      <>
        <MenuItemPrimitive label="Plan" checkable="radio" checked={false} />
        <MenuItemPrimitive label="Default" checkable="radio" checked />
      </>
    );
    const picked = screen.getByRole("menuitemradio", { name: "Default" });
    const other = screen.getByRole("menuitemradio", { name: "Plan" });
    expect(picked).toHaveAttribute("aria-checked", "true");
    expect(picked).toHaveClass("Mui-selected");
    expect(other).toHaveAttribute("aria-checked", "false");
    expect(other).not.toHaveClass("Mui-selected");
  });

  it("toggles a checkbox row without selecting it", () => {
    renderRow(
      <MenuItemPrimitive label="Rulers" checkable="checkbox" checked shortcut="R" />
    );
    const row = screen.getByRole("menuitemcheckbox", { name: /Rulers/ });
    expect(row).toHaveAttribute("aria-checked", "true");
    expect(row).not.toHaveClass("Mui-selected");
    expect(screen.getByText("R")).toBeInTheDocument();
  });
});
