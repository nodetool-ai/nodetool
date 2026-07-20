import React from "react";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { ClipContextMenu } from "../ClipContextMenu";
import type { ClipMenuActions } from "../useClipMenuActions";

const mockUseClipMenuActions = jest.fn<() => ClipMenuActions>();
jest.mock("../useClipMenuActions", () => ({
  useClipMenuActions: () => mockUseClipMenuActions()
}));

const makeActions = (
  overrides: Partial<ClipMenuActions> = {}
): ClipMenuActions => ({
  isGenerated: false,
  locked: false,
  canOpenInNodeEditor: false,
  splitAtPlayhead: jest.fn(),
  duplicate: jest.fn(),
  regenerateAsCopy: jest.fn(),
  toggleLock: jest.fn(),
  openReplace: jest.fn(),
  openInNodeEditor: jest.fn(),
  ...overrides
});

const renderMenu = (
  props: Partial<React.ComponentProps<typeof ClipContextMenu>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipContextMenu
        clipId="clip-1"
        position={{ x: 10, y: 10 }}
        isLinked={false}
        onUnlink={jest.fn()}
        onDelete={jest.fn()}
        onClose={jest.fn()}
        onRequestReplace={jest.fn()}
        onError={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  );

describe("ClipContextMenu", () => {
  beforeEach(() => {
    mockUseClipMenuActions.mockReturnValue(makeActions());
  });

  it("shows Unlink and calls onUnlink when the clip is linked", async () => {
    const onUnlink = jest.fn();
    renderMenu({ isLinked: true, onUnlink });
    await userEvent.click(screen.getByText("Unlink"));
    expect(onUnlink).toHaveBeenCalledTimes(1);
  });

  it("does not render an Unlink item when the clip is not linked", () => {
    renderMenu();
    expect(screen.queryByText("Unlink")).toBeNull();
  });

  it("shows Delete and calls onDelete", async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    renderMenu({ onDelete, onClose });
    await userEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers the clip operations that moved off the inspector", async () => {
    const actions = makeActions({
      isGenerated: true,
      canOpenInNodeEditor: true
    });
    mockUseClipMenuActions.mockReturnValue(actions);
    const onClose = jest.fn();
    renderMenu({ onClose });

    await userEvent.click(screen.getByText("Split at playhead"));
    expect(actions.splitAtPlayhead).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(screen.getByText("Duplicate")).toBeTruthy();
    expect(screen.getByText("Regenerate as new clip")).toBeTruthy();
    expect(screen.getByText("Lock")).toBeTruthy();
    expect(screen.getByText("Replace clip…")).toBeTruthy();
    expect(screen.getByText("Open in node editor")).toBeTruthy();
  });

  it("hides generated-only and workflow-only items on a plain clip", () => {
    renderMenu();
    expect(screen.queryByText("Regenerate as new clip")).toBeNull();
    expect(screen.queryByText("Open in node editor")).toBeNull();
  });

  it("labels the lock item by current state", () => {
    mockUseClipMenuActions.mockReturnValue(makeActions({ locked: true }));
    renderMenu();
    expect(screen.getByText("Unlock")).toBeTruthy();
  });
});
