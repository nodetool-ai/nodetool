import React from "react";
import "@testing-library/jest-dom/jest-globals";
import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { DockTabStrip, type DockTabStripProps } from "../DockTabStrip";

const TABS = [
  { id: "hierarchy", label: "Hierarchy" },
  { id: "revisions", label: "Revisions" },
  { id: "assets", label: "Assets", closable: false }
];

function renderStrip(props: Partial<DockTabStripProps> = {}) {
  const onActivate = jest.fn<(id: string) => void>();
  const onClose = jest.fn<(id: string) => void>();
  const onTabDragStart = jest.fn<(id: string, event: PointerEvent) => void>();
  const onTabContextMenu = jest.fn<(id: string, position: { x: number; y: number }) => void>();
  const result = render(<ThemeProvider theme={mockTheme}>
    <DockTabStrip tabs={TABS} activeId="hierarchy" ariaLabel="Left panel tabs" onActivate={onActivate} onClose={onClose}
      onTabDragStart={onTabDragStart} onTabContextMenu={onTabContextMenu} {...props} />
  </ThemeProvider>);
  return { ...result, onActivate, onClose, onTabDragStart, onTabContextMenu };
}

describe("DockTabStrip", () => {
  it("renders a tab list with the active tab selected and focusable", () => {
    renderStrip();
    expect(screen.getByRole("tablist", { name: "Left panel tabs" })).toBeInTheDocument();
    const active = screen.getByRole("tab", { name: "Hierarchy" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Revisions" })).toHaveAttribute("tabindex", "-1");
  });

  it("forwards its ref to the strip element", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<ThemeProvider theme={mockTheme}><DockTabStrip ref={ref} tabs={TABS} activeId="hierarchy" ariaLabel="Tabs" onActivate={() => undefined} /></ThemeProvider>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveAttribute("data-dock-tabstrip");
  });

  it("moves between tabs with the arrow keys and activates them", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderStrip();
    screen.getByRole("tab", { name: "Hierarchy" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onActivate).toHaveBeenLastCalledWith("revisions");
    expect(screen.getByRole("tab", { name: "Revisions" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(onActivate).toHaveBeenLastCalledWith("assets");
    await user.keyboard("{ArrowRight}");
    expect(onActivate).toHaveBeenLastCalledWith("hierarchy");
  });

  it("closes a tab from its button, a middle click or Delete, but not one marked unclosable", async () => {
    const user = userEvent.setup();
    const { onClose } = renderStrip();
    await user.click(screen.getByRole("button", { name: "Close Hierarchy" }));
    expect(onClose).toHaveBeenLastCalledWith("hierarchy");
    fireEvent(screen.getByRole("tab", { name: "Revisions" }), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(onClose).toHaveBeenLastCalledWith("revisions");
    expect(screen.queryByRole("button", { name: "Close Assets" })).not.toBeInTheDocument();
    screen.getByRole("tab", { name: "Hierarchy" }).focus();
    await user.keyboard("{Delete}");
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("starts a drag only after the pointer passes the threshold", async () => {
    const user = userEvent.setup();
    const { onTabDragStart, onActivate } = renderStrip();
    const tab = screen.getByRole("tab", { name: "Revisions" });
    await user.pointer({ keys: "[MouseLeft>]", target: tab, coords: { clientX: 10, clientY: 10 } });
    expect(onActivate).toHaveBeenLastCalledWith("revisions");
    await user.pointer({ target: tab, coords: { clientX: 12, clientY: 11 } });
    expect(onTabDragStart).not.toHaveBeenCalled();
    await user.pointer({ target: tab, coords: { clientX: 30, clientY: 10 } });
    expect(onTabDragStart).toHaveBeenCalledTimes(1);
    expect(onTabDragStart.mock.calls[0]?.[0]).toBe("revisions");
    await user.pointer({ target: tab, coords: { clientX: 60, clientY: 10 } });
    expect(onTabDragStart).toHaveBeenCalledTimes(1);
    await user.pointer({ keys: "[/MouseLeft]", target: tab });
  });

  it("opens the tab menu on right click and from the keyboard", async () => {
    const user = userEvent.setup();
    const { onTabContextMenu } = renderStrip();
    fireEvent.contextMenu(screen.getByRole("tab", { name: "Revisions" }), { clientX: 40, clientY: 12 });
    expect(onTabContextMenu).toHaveBeenLastCalledWith("revisions", { x: 40, y: 12 });
    screen.getByRole("tab", { name: "Hierarchy" }).focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(onTabContextMenu.mock.calls.at(-1)?.[0]).toBe("hierarchy");
  });

  it("draws the insertion caret at the drop index", () => {
    const { container, rerender } = renderStrip({ dropIndex: 1 });
    const caret = container.querySelector("[data-dock-drop-caret]");
    expect(caret?.nextElementSibling).toHaveAttribute("data-dock-tab", "revisions");
    rerender(<ThemeProvider theme={mockTheme}><DockTabStrip tabs={TABS} activeId="hierarchy" ariaLabel="Left panel tabs" onActivate={() => undefined} dropIndex={3} /></ThemeProvider>);
    expect(container.querySelector("[data-dock-drop-caret]")?.previousElementSibling).toHaveAttribute("data-dock-tab", "assets");
  });
});
