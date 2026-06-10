/**
 * ScriptLane — the time-aligned transcript lane. Verifies a phrase chip renders
 * from a captioned clip, positioned by its word times, and clicking it seeks the
 * playhead and selects the clip (bidirectional with the tracks).
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";
import type { CaptionWord, TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ScriptLane } from "../ScriptLane";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

const voicedClip = (words: CaptionWord[]): TimelineClip =>
  makeClip({
    id: "c1",
    paragraphId: "c1",
    trackId: "audio",
    mediaType: "audio",
    sourceType: "generated",
    status: "generated",
    startMs: 1000,
    durationMs: 900,
    currentAssetId: "asset-1",
    caption: { words }
  });

const renderLane = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <ScriptLane />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("ScriptLane", () => {
  it("renders a phrase chip and seeks + selects the clip on click", () => {
    renderLane();
    act(() => {
      useTimelineStore.getState().setTranscriptAndClips({
        clips: [
          voicedClip([
            { word: "hello", startMs: 0, endMs: 300 },
            { word: "world", startMs: 300, endMs: 900 }
          ])
        ],
        durationMs: 1900
      });
    });

    const chip = screen.getByTestId("script-chip");
    expect(chip).toHaveTextContent("hello world");
    // Positioned by the segment's absolute start (1000ms / 10 msPerPx = 100px).
    expect(chip.style.left).toBe("100px");

    act(() => {
      fireEvent.click(chip);
    });
    expect(useTimelinePlaybackStore.getState().currentTimeMs).toBe(1000);
    expect(useTimelineUIStore.getState().selectedClipIds.has("c1")).toBe(true);
  });
});
