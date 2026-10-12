import React from "react";
import { render, screen } from "@testing-library/react";
import { ContextMenu } from "../ContextMenu";
import { MENU_MIN_WIDTH } from "../menuStyles";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { MenuItem } from "@mui/material";
import { asElement } from "../../../test-utils/doubles";

describe("ContextMenu", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders menu items when open", () => {
    renderWithTheme(
      <ContextMenu open={true} anchorEl={document.body}>
        <MenuItem>Edit</MenuItem>
        <MenuItem>Delete</MenuItem>
      </ContextMenu>
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderWithTheme(
      <ContextMenu open={false} anchorEl={null}>
        <MenuItem>Hidden</MenuItem>
      </ContextMenu>
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("renders at position for right-click menus", () => {
    renderWithTheme(
      <ContextMenu open={true} position={{ x: 100, y: 200 }}>
        <MenuItem>Context item</MenuItem>
      </ContextMenu>
    );
    expect(screen.getByText("Context item")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const handleClose = jest.fn();
    renderWithTheme(
      <ContextMenu open={true} anchorEl={document.body} onClose={handleClose}>
        <MenuItem>Item</MenuItem>
      </ContextMenu>
    );
    const backdrop = document.querySelector(".MuiBackdrop-root");
    if (backdrop) {
      asElement(backdrop).click();
      expect(handleClose).toHaveBeenCalled();
    }
  });

  it("gives the menu the default minimum width", () => {
    renderWithTheme(
      <ContextMenu open={true} anchorEl={document.body}>
        <MenuItem>Item</MenuItem>
      </ContextMenu>
    );
    const paper = document.querySelector(".MuiMenu-paper");
    expect(paper).not.toBeNull();
    expect(getComputedStyle(asElement(paper)).minWidth).toBe(`${MENU_MIN_WIDTH}px`);
  });
});
