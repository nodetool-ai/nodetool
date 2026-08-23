/**
 * TimelineRenderer is the read-only preview (chat, storyboard, node output).
 * It must seed the isolated instance before the compositor's first paint —
 * a post-paint loadSequence leaves an empty black frame that shouldPresentFrame
 * then holds until a video loadeddata that may never fire.
 */
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeSequence, makeTrack } from "@nodetool-ai/timeline";
import mockTheme from "../../../__mocks__/themeMock";

type Paint = { clipCount: number; playheadMs: number };

const mockPaints = (): Paint[] => {
  const g = globalThis as typeof globalThis & {
    __timelineRendererPaints?: Paint[];
  };
  g.__timelineRendererPaints ??= [];
  return g.__timelineRendererPaints;
};

jest.mock("../preview/PreviewArea", () => ({
  PreviewArea: () => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const { useTimelineStore } = jest.requireActual(
      "../../../stores/timeline/TimelineStore"
    ) as typeof import("../../../stores/timeline/TimelineStore");
    const { useTimelinePlaybackStore } = jest.requireActual(
      "../../../stores/timeline/TimelinePlaybackStore"
    ) as typeof import("../../../stores/timeline/TimelinePlaybackStore");
    const clipCount = useTimelineStore(
      (s: { clips: unknown[] }) => s.clips.length
    );
    const playheadMs = useTimelinePlaybackStore(
      (s: { currentTimeMs: number }) => s.currentTimeMs
    );
    mockPaints().push({ clipCount, playheadMs });
    return ReactActual.createElement("div", {
      "data-testid": "preview-area-stub"
    });
  }
}));

import TimelineRenderer from "../TimelineRenderer";

const track = makeTrack({ type: "video", name: "V1" });
const clip = makeClip({
  trackId: track.id,
  name: "Take 1",
  startMs: 1500,
  durationMs: 4000,
  mediaType: "video",
  status: "generated",
  currentAssetId: "asset-1"
});
const sequence = makeSequence({
  id: "seq-preview",
  tracks: [track],
  clips: [clip],
  durationMs: 5500
});

describe("TimelineRenderer", () => {
  beforeEach(() => {
    mockPaints().length = 0;
  });

  it("seeds clips and the playhead before the compositor's first paint", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineRenderer sequence={sequence} />
      </ThemeProvider>
    );

    expect(mockPaints()[0]).toEqual({
      clipCount: 1,
      playheadMs: 1500
    });
  });
});
