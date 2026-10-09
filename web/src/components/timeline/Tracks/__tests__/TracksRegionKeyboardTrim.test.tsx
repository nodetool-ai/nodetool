/**
 * Keyboard trims (E, Ctrl+Shift+arrow) honour the source length like the
 * pointer trim does (F18).
 */
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";
import {
  recordSourceDurationMs,
  resetVideoDurationCache
} from "../useClipSourceDuration";

jest.mock("../../../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../../sourceEdit", () => ({ performSourceEdit: jest.fn(() => null) }));

afterEach(() => resetVideoDurationCache());

const setup = (assetId: string) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );
  const clip = makeClip({
    trackId: "t1",
    name: "a",
    mediaType: "audio",
    currentAssetId: assetId,
    startMs: 0,
    durationMs: 1000,
    inPointMs: 0,
    outPointMs: 1000
  });
  act(() => {
    useTimelineStore.getState().reset();
    useTimelineStore.getState().addClips([clip]);
    useTimelineUIStore.getState().setSelectedEdit({ clipId: clip.id, edge: "end" });
    useTimelinePlaybackStore.getState().setTimeMs(5000);
  });
  return clip;
};

const durationOf = (id: string) =>
  useTimelineStore.getState().clips.find((c) => c.id === id)!.durationMs;

describe("keyboard end trim source cap", () => {
  it("extends to the playhead only up to the known source length", () => {
    const clip = setup("asset-known");
    recordSourceDurationMs("asset-known", 3000);
    fireEvent.keyDown(window, { key: "e", code: "KeyE" });
    expect(durationOf(clip.id)).toBe(3000);
  });

  it("does not extend a media clip whose source length is unknown", () => {
    const clip = setup("asset-unknown");
    fireEvent.keyDown(window, { key: "e", code: "KeyE" });
    expect(durationOf(clip.id)).toBe(1000);
  });
});

describe("keyboard frame steps stay on the frame grid", () => {
  it("trims the edit point by whole frames at 30 fps", () => {
    const clip = setup("asset-grid");
    expect(useTimelineStore.getState().fps).toBe(30);
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, {
        key: "ArrowLeft",
        code: "ArrowLeft",
        ctrlKey: true,
        shiftKey: true
      });
    }
    // Three frames off 1000 ms (frame 30) is frame 27: 900 ms, not 901.
    expect(durationOf(clip.id)).toBe(900);
  });

  it("nudges the selection by whole frames at 30 fps", () => {
    const clip = setup("asset-grid");
    act(() => {
      useTimelineUIStore.getState().setSelection([clip.id]);
    });
    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
    }
    const moved = useTimelineStore.getState().clips.find((c) => c.id === clip.id)!;
    expect(moved.startMs).toBe(100);
  });
});
