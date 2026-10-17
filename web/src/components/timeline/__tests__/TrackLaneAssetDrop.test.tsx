/**
 * Dropping a Library asset on a lane that already holds a clip.
 */

import { installPointerEvent } from "../../../test-utils/pointerEvent";
import { createEvent, render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

// ── Heavy media hooks → no-op mocks ─────────────────────────────────────────

jest.mock("../Tracks/useClipThumbnails", () =>
  jest
    .requireActual("../../../test-utils/timelineClipMocks")
    .clipThumbnailsMock()
);
jest.mock("../Tracks/useAudioPeaks", () =>
  jest.requireActual("../../../test-utils/timelineClipMocks").audioPeaksMock()
);

// ── Stores that pull in network/api dependencies → light mocks ─────────────

jest.mock("../../../stores/AssetStore", () =>
  jest.requireActual("../../../test-utils/timelineClipMocks").assetStoreMock()
);
jest.mock("../../../stores/WorkflowRunsStore", () =>
  jest
    .requireActual("../../../test-utils/timelineClipMocks")
    .workflowRunsStoreMock()
);
jest.mock("../../../stores/ErrorStore", () =>
  jest.requireActual("../../../test-utils/timelineClipMocks").errorStoreMock()
);
jest.mock("../../../stores/timeline/TimelineGenerationStore", () =>
  jest
    .requireActual("../../../test-utils/timelineClipMocks")
    .timelineGenerationStoreMock()
);

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { TrackLane } from "../Tracks/TrackLane";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import type { Asset } from "../../../stores/ApiTypes";


beforeAll(installPointerEvent);

const track: TimelineTrack = {
  id: "t1",
  name: "Video 1",
  type: "video",
  index: 0,
  visible: true,
  locked: false
};

const beach: TimelineClip = {
  id: "beach",
  trackId: track.id,
  name: "beach-morning.jpg",
  startMs: 0,
  durationMs: 4000,
  mediaType: "image",
  sourceType: "imported",
  status: "draft",
  locked: false,
  versions: []
};

const forest = {
  id: "forest-1",
  user_id: "u1",
  parent_id: "root",
  name: "forest-walk.jpg",
  content_type: "image/jpeg",
  workflow_id: null,
  created_at: "2024-01-01T00:00:00Z",
  get_url: "https://cdn.example.com/forest-walk.jpg",
  thumb_url: null
} as unknown as Asset;

const MS_PER_PX = 10;

// A single-asset drag through the legacy "asset" key deserializeDragData reads.
const dropAt = (clientX: number) => {
  const data: Record<string, string> = { asset: JSON.stringify(forest) };
  const lane = screen.getByTestId("track-lane-t1");
  // jsdom has no DragEvent, so clientX is set on the generic event.
  const event = createEvent.drop(lane, {
    dataTransfer: {
      types: ["asset"],
      dropEffect: "none",
      effectAllowed: "all",
      getData: (k: string) => data[k] ?? "",
      setData: () => {}
    }
  });
  Object.defineProperty(event, "clientX", { value: clientX });
  fireEvent(lane, event);
};

const forestClip = () =>
  useTimelineStore.getState().clips.find((c) => c.name === "forest-walk.jpg");

beforeEach(() => {
  useTimelineStore.setState({
    tracks: [track],
    clips: [beach],
    durationMs: 10_000
  });
  useTimelineUIStore.setState({
    msPerPx: MS_PER_PX,
    scrollLeftPx: 0,
    selectedClipIds: new Set<string>(),
    dropMode: "overwrite"
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TrackLane track={track} />
    </ThemeProvider>
  );
});

describe("TrackLane asset drop", () => {
  it("places a drop in a clip's second half at the clip's end and keeps the clip whole", () => {
    // jsdom rects are all-zero, so clientX is lane-local: 220 px = 2.2 s,
    // where study 6's B3 dropped and lost 1.8 s of the first photo.
    dropAt(220);
    expect(forestClip()?.startMs).toBe(4000);
    const first = useTimelineStore
      .getState()
      .clips.find((c) => c.id === "beach");
    expect(first?.durationMs).toBe(4000);
  });

  it("keeps the pointer's time in overlap mode", () => {
    useTimelineUIStore.setState({ dropMode: "overlap" });
    dropAt(220);
    expect(forestClip()?.startMs).toBe(2200);
  });
});
