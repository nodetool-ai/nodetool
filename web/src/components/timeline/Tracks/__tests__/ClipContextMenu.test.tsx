import React from "react";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { ClipContextMenu } from "../ClipContextMenu";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
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
  isMidi: false,
  canReplace: true,
  canEditVideo: false,
  splitAtPlayhead: jest.fn(),
  duplicate: jest.fn(),
  editNotes: jest.fn(),
  regenerateAsCopy: jest.fn(),
  toggleLock: jest.fn(),
  openReplace: jest.fn(),
  openInNodeEditor: jest.fn(),
  openAiEdit: jest.fn(),
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
        onSendToWorkflow={jest.fn()}
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

  it("offers Edit video for a clip with an active video asset", async () => {
    const actions = makeActions({ canEditVideo: true });
    mockUseClipMenuActions.mockReturnValue(actions);
    const onClose = jest.fn();
    renderMenu({ onClose });

    await userEvent.click(screen.getByText("Edit video…"));

    expect(actions.openAiEdit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it("hides Replace clip… when the clip has no media to replace", () => {
    mockUseClipMenuActions.mockReturnValue(makeActions({ canReplace: false }));
    renderMenu();
    expect(screen.queryByText("Replace clip…")).toBeNull();
  });

  it("still offers Split and Duplicate when Replace is hidden", async () => {
    mockUseClipMenuActions.mockReturnValue(makeActions({ canReplace: false }));
    const onClose = jest.fn();
    renderMenu({ onClose });
    expect(screen.getByText("Duplicate")).toBeTruthy();
    await userEvent.click(screen.getByText("Split at playhead"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("Send to workflow", () => {
    const clip = (
      id: string,
      mediaType: TimelineClip["mediaType"],
      currentAssetId?: string
    ): TimelineClip =>
      ({
        id,
        trackId: "t1",
        name: `Clip ${id}`,
        startMs: 0,
        durationMs: 1000,
        mediaType,
        sourceType: "imported",
        currentAssetId
      }) as TimelineClip;

    beforeEach(() => {
      useTimelineStore.setState({
        clips: [
          clip("clip-1", "video", "asset-v"),
          clip("clip-2", "audio", "asset-a"),
          clip("clip-3", "text"),
          clip("clip-4", "image")
        ]
      });
      useTimelineUIStore.setState({ selectedClipIds: new Set<string>() });
    });

    afterEach(() => {
      useTimelineStore.setState({ clips: [] });
      useTimelineUIStore.setState({ selectedClipIds: new Set<string>() });
    });

    it("sends the right-clicked clip when it is outside the selection", async () => {
      useTimelineUIStore.setState({ selectedClipIds: new Set(["clip-2"]) });
      const onSendToWorkflow = jest.fn();
      renderMenu({ onSendToWorkflow });

      await userEvent.click(screen.getByText("Send to workflow…"));

      expect(onSendToWorkflow).toHaveBeenCalledWith(
        [{ type: "video", asset_id: "asset-v", title: "Clip clip-1" }],
        { x: 10, y: 10 }
      );
    });

    it("sends every selected clip that has media, skipping the rest", async () => {
      useTimelineUIStore.setState({
        selectedClipIds: new Set(["clip-1", "clip-2", "clip-3", "clip-4"])
      });
      const onSendToWorkflow = jest.fn();
      renderMenu({ onSendToWorkflow });

      await userEvent.click(screen.getByText("Send 2 clips to workflow…"));

      expect(onSendToWorkflow).toHaveBeenCalledWith(
        [
          { type: "video", asset_id: "asset-v", title: "Clip clip-1" },
          { type: "audio", asset_id: "asset-a", title: "Clip clip-2" }
        ],
        { x: 10, y: 10 }
      );
    });

    it("hides the item for a clip with no rendered media", () => {
      renderMenu({ clipId: "clip-4" });
      expect(screen.queryByText(/to workflow/)).toBeNull();
    });
  });
});
