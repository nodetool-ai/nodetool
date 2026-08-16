/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkspaceTabItem from "../WorkspaceTabItem";
import type { WorkspaceTab } from "../../../stores/WorkspaceTabsStore";
import { tabCanRename } from "../tabRename";

jest.mock("../../../hooks/useWorkflowRunnerState", () => ({
  useIsWorkflowRunning: () => false
}));
jest.mock("../../../hooks/useWorkflowDirty", () => ({
  useWorkflowDirty: () => false
}));
jest.mock("../../../stores/SettingsStore", () => ({
  useSettingsStore: <T,>(selector: (state: unknown) => T) =>
    selector({ settings: { instantUpdate: false } })
}));

const tab: WorkspaceTab = {
  id: "tab-1",
  type: "workflow",
  ref: "wf-1",
  title: "My Workflow"
} as WorkspaceTab;

const renderTab = (overrides: Partial<React.ComponentProps<typeof WorkspaceTabItem>> = {}) => {
  const handlers = {
    onActivate: jest.fn(),
    onBeginRename: jest.fn(),
    onClose: jest.fn(),
    onCloseOthers: jest.fn(),
    onCloseAll: jest.fn(),
    onDragStart: jest.fn(),
    onDragOver: jest.fn(),
    onDragLeave: jest.fn(),
    onDrop: jest.fn(),
    onCommitRename: jest.fn(),
    onCancelRename: jest.fn()
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkspaceTabItem
        tab={tab}
        isActive={false}
        isEditing={false}
        canRename={true}
        dropPosition={null}
        typeColor="#fff"
        typeGlyph="◆"
        {...handlers}
        {...overrides}
      />
    </ThemeProvider>
  );
  return handlers;
};

describe("WorkspaceTabItem rename input", () => {
  it("lets the user type spaces into the rename input", async () => {
    const user = userEvent.setup();
    const handlers = renderTab({ isEditing: true });

    const input = screen.getByLabelText("Tab name") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "My New Name");

    expect(input.value).toBe("My New Name");
    expect(handlers.onActivate).not.toHaveBeenCalled();
  });

  it("still activates the tab on Space when the tab itself is focused", async () => {
    const user = userEvent.setup();
    const handlers = renderTab();

    const tabElement = screen.getByRole("tab");
    tabElement.focus();
    await user.keyboard(" ");

    expect(handlers.onActivate).toHaveBeenCalledWith("tab-1");
  });

  it("starts rename on double-click when the tab can be renamed", async () => {
    const user = userEvent.setup();
    const handlers = renderTab({ canRename: true });

    await user.dblClick(screen.getByRole("tab"));

    expect(handlers.onBeginRename).toHaveBeenCalledWith(tab);
  });

  it("does not start rename on double-click when the tab cannot be renamed", async () => {
    const user = userEvent.setup();
    const handlers = renderTab({ canRename: false });

    await user.dblClick(screen.getByRole("tab"));

    expect(handlers.onBeginRename).not.toHaveBeenCalled();
  });

  it("lets the rename input take focus while editing", () => {
    renderTab({ isEditing: true });

    const input = screen.getByLabelText("Tab name");
    const event = new MouseEvent("mousedown", {
      button: 0,
      bubbles: true,
      cancelable: true
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("offers Rename on an image tab (sketch editor host)", async () => {
    const user = userEvent.setup();
    const imageTab = {
      ...tab,
      id: "image:img-1",
      type: "image",
      ref: "img-1",
      title: "Untitled.png"
    } as WorkspaceTab;
    const handlers = renderTab({
      tab: imageTab,
      canRename: tabCanRename("image")
    });

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("tab")
    });
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(handlers.onBeginRename).toHaveBeenCalledWith(imageTab);
  });

  it("offers Rename in the tab menu when the tab can be renamed", async () => {
    const user = userEvent.setup();
    const handlers = renderTab({ canRename: true });

    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tab") });
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    expect(handlers.onBeginRename).toHaveBeenCalledWith(tab);
  });
});
