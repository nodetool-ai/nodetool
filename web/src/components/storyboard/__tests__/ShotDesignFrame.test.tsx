import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import ShotDesignFrame from "../ShotDesignFrame";

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));
jest.mock("../../timeline/preview/PreviewCompositor", () => {
  const { useTimelineStore, useTimelinePlaybackStore } = jest.requireActual(
    "../../../stores/timeline/TimelineInstance"
  );
  return {
    PreviewCompositor: () => {
      const clips = useTimelineStore(
        (state: { clips: unknown }) => state.clips
      );
      const time = useTimelinePlaybackStore(
        (state: { currentTimeMs: number }) => state.currentTimeMs
      );
      return (
        <output data-testid="timeline-compositor-input">
          {JSON.stringify({ clips, time })}
        </output>
      );
    }
  };
});
const shot: Shot = {
  type: "shot",
  id: "hook",
  index: 0,
  action: "Sale",
  status: "planned",
  duration_seconds: 4,
  graphics: {
    mode: "graphics_first",
    elements: [
      {
        id: "product",
        kind: "asset",
        role: "product",
        asset_id: "original-product"
      },
      { id: "logo", kind: "asset", role: "logo", asset_id: "original-logo" },
      { id: "headline", kind: "text", text: " €29 " }
    ]
  }
};

describe("Storyboard design frame adapter", () => {
  beforeEach(() => {
    useStoryboardStore.getState().ensureBoard("board");
    useStoryboardStore.setState((state) => ({
      boards: {
        ...state.boards,
        board: { ...state.boards.board, shots: [shot], aspectRatio: "9:16" }
      }
    }));
  });
  it("feeds exact separate layers to the existing compositor and replaces stale draft copy", async () => {
    const view = render(
      <ThemeProvider theme={mockTheme}>
        <ShotDesignFrame boardId="board" shot={shot} />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
        "original-product"
      )
    );
    expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
      "original-logo"
    );
    expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
      '"text":" €29 "'
    );
    expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
      '"time":2000'
    );
    const changed: Shot = {
      ...shot,
      graphics: {
        ...shot.graphics,
        elements: [
          ...shot.graphics!.elements!.slice(0, 2),
          { id: "headline", kind: "text", text: " €19 " }
        ]
      }
    };
    view.rerender(
      <ThemeProvider theme={mockTheme}>
        <ShotDesignFrame boardId="board" shot={changed} />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
        '"text":" €19 "'
      )
    );
    expect(useStoryboardStore.getState().boards.board.shots[0]).toEqual(shot);
  });
});
