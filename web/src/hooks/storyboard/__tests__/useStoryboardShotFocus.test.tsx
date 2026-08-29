/**
 * @jest-environment jsdom
 *
 * A shot parked by a sibling document is applied once the board carries it —
 * which is the point: the click happens before the board has loaded.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";
import type { Shot } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDocumentFocusStore } from "../../../stores/DocumentFocusStore";
import { useStoryboardShotFocus } from "../useStoryboardShotFocus";

const shot = (id: string, index: number): Shot => ({
  type: "shot",
  id,
  index,
  slug: `Shot ${index + 1}`,
  action: "A closed door",
  status: "planned"
});

const loadBoard = (shots: Shot[]): void => {
  act(() =>
    useStoryboardStore.getState().loadBoard("board-1", {
      title: "Aurora board",
      brief: "",
      style: "",
      entityIds: [],
      aspectRatio: "16:9",
      directorModel: null,
      imageModel: null,
      videoModel: null,
      screenplay: null,
      activeShotId: null,
      timelineId: null,
      shots
    })
  );
};

beforeEach(() => {
  useStoryboardStore.setState({ boards: {}, history: {} });
  useDocumentFocusStore.setState({ pending: null });
});

describe("useStoryboardShotFocus", () => {
  it("selects the shot once the board has loaded it", () => {
    useDocumentFocusStore.getState().requestDocumentFocus({
      type: "storyboard",
      ref: "board-1",
      shotId: "shot-2"
    });

    renderHook(() => useStoryboardShotFocus("board-1"));
    // Nothing to select yet — the board is still loading.
    expect(useDocumentFocusStore.getState().pending).not.toBeNull();

    loadBoard([shot("shot-1", 0), shot("shot-2", 1)]);

    expect(useStoryboardStore.getState().boards["board-1"].activeShotId).toBe(
      "shot-2"
    );
    expect(useDocumentFocusStore.getState().pending).toBeNull();
  });

  it("leaves a request for another board alone", () => {
    const request = {
      type: "storyboard" as const,
      ref: "board-other",
      shotId: "shot-1"
    };
    useDocumentFocusStore.getState().requestDocumentFocus(request);
    loadBoard([shot("shot-1", 0)]);

    renderHook(() => useStoryboardShotFocus("board-1"));

    expect(
      useStoryboardStore.getState().boards["board-1"].activeShotId
    ).toBeNull();
    expect(useDocumentFocusStore.getState().pending).toBe(request);
  });
});
