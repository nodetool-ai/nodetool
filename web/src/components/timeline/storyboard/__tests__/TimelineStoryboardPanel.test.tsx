import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import type { Shot } from "@nodetool-ai/protocol";

const shots: Shot[] = [
  {
    type: "shot",
    id: "shot-1",
    index: 0,
    slug: "Harbor",
    action: "boats at dawn",
    status: "planned",
    clip: { type: "video", asset_id: "take-1", duration: 3 }
  },
  {
    type: "shot",
    id: "shot-2",
    index: 1,
    slug: "Gull",
    action: "a gull lands",
    status: "planned"
  }
];

jest.mock("../../../../trpc/client", () => ({
  trpc: {
    storyboards: {
      get: {
        useQuery: jest.fn(() => ({
          data: { name: "Coast", document: { shots } },
          isLoading: false
        }))
      }
    }
  },
  trpcClient: {}
}));
jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useStoryboards: () => ({
    data: [{ id: "board-1", name: "Coast" }],
    isLoading: false
  })
}));

import { TimelineStoryboardPanel } from "../TimelineStoryboardPanel";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../../stores/timeline/TimelinePlaybackStore";

beforeEach(() => {
  // A clip already linked to the board, so the panel opens on it.
  useTimelineStore.setState({
    tracks: [
      { id: "v1", name: "Video 1", type: "video", index: 0, visible: true, locked: false }
    ],
    clips: [
      {
        id: "linked",
        trackId: "v1",
        name: "Earlier",
        startMs: 0,
        durationMs: 1000,
        mediaType: "image",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        storyboardBoardId: "board-1",
        storyboardShotId: "shot-0"
      }
    ]
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineStoryboardPanel />
    </ThemeProvider>
  );
});

describe("TimelineStoryboardPanel", () => {
  it("drags a rendered shot with its resolved placement", () => {
    const tile = screen.getByTestId("storyboard-panel-shot-shot-1");
    expect(tile).toHaveAttribute("draggable", "true");
    const data: Record<string, string> = {};
    const event = createEvent.dragStart(tile, {
      dataTransfer: {
        setData: (key: string, value: string) => {
          data[key] = value;
        },
        effectAllowed: "all"
      }
    });
    fireEvent(tile, event);
    expect(JSON.parse(data["storyboard-shot"])).toEqual({
      boardId: "board-1",
      shotId: "shot-1",
      name: "Harbor",
      placement: {
        mediaType: "video",
        assetId: "take-1",
        durationMs: 3000,
        inPointMs: 0,
        outPointMs: 3000
      }
    });
  });

  it("marks a shot with no picture as not placeable", () => {
    const tile = screen.getByTestId("storyboard-panel-shot-shot-2");
    expect(tile).toHaveAttribute("draggable", "false");
    expect(tile).toHaveAttribute("aria-disabled", "true");
  });

  it("places a shot at the playhead on Enter", () => {
    useTimelinePlaybackStore.getState().seek(2000);
    fireEvent.keyDown(screen.getByTestId("storyboard-panel-shot-shot-1"), {
      key: "Enter"
    });
    const placed = useTimelineStore
      .getState()
      .clips.find((c) => c.storyboardShotId === "shot-1" && c.mediaType === "video");
    expect(placed).toMatchObject({ trackId: "v1", startMs: 2000, durationMs: 3000 });
  });
});
