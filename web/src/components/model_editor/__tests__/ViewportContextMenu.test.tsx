import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ViewportContextMenu from "../ViewportContextMenu";

const renderMenu = (position: { x: number; y: number } | null) => {
  const handlers = {
    onClose: jest.fn(),
    onDuplicate: jest.fn(),
    onFrame: jest.fn(),
    onHide: jest.fn(),
    onDelete: jest.fn()
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <ViewportContextMenu position={position} {...handlers} />
    </ThemeProvider>
  );
  return handlers;
};

describe("ViewportContextMenu", () => {
  it("duplicates from the right-click menu and shows the shortcut", () => {
    const handlers = renderMenu({ x: 100, y: 100 });

    const item = screen.getByRole("menuitem", { name: /Duplicate/ });
    expect(item).toHaveTextContent("Ctrl+D");
    fireEvent.click(item);

    expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it("lists frame, hide and delete with their shortcuts", () => {
    renderMenu({ x: 0, y: 0 });
    expect(screen.getByRole("menuitem", { name: /Frame selection/ })).toHaveTextContent("F");
    expect(screen.getByRole("menuitem", { name: /Hide/ })).toHaveTextContent("H");
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toHaveTextContent("Del");
  });

  it("stays closed without a position", () => {
    renderMenu(null);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
