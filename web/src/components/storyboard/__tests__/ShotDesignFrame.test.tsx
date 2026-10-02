import React from "react";
import { act, fireEvent, render as renderComponent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpcClient } from "../../../trpc/client";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import ShotDesignFrame from "../ShotDesignFrame";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {assets: {get: {query: jest.fn()}, search: {query: jest.fn()}}}
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
let queryClient: QueryClient;
const getAssetQuery = trpcClient.assets.get.query as jest.Mock;
const canonical = "a".repeat(32);
const replacement = "b".repeat(32);
const sourceAsset = (id = canonical, projectId = "another-project", referenceId?: string) => {
  const marker: {kind: string; name: string; descriptor: string; reference_asset_id?: string} = {
    kind: "prop", name: "Product", descriptor: "Exact product"
  };
  if (referenceId) {
    marker.reference_asset_id = referenceId;
  }
  return {
    id, user_id: "owned-user", project_id: projectId, name: "Product", content_type: "image/png", created_at: "", metadata: {nodetool_entity: marker}
  };
};
const render = (view: React.ReactElement) => renderComponent(view, {
  wrapper: ({children}) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
});
beforeEach(() => {
  queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
  getAssetQuery.mockReset();
  getAssetQuery.mockImplementation(async ({id}) => {
    if (id === canonical || id === canonical.slice(0, 12)) {
      return sourceAsset();
    }
    throw new Error("Asset not found");
  });
});
afterEach(() => queryClient.clear());

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
  it("resolves a unique short entity and asset reference through the owned server boundary", async () => {
    const candidate: Shot = {...shot, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical.slice(0, 12), entity_id: canonical.slice(0, 12)}]}};
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(canonical));
    expect(getAssetQuery).toHaveBeenCalledWith({id: canonical.slice(0, 12)});
    expect(getAssetQuery).toHaveBeenCalledWith({id: canonical});
    expect(candidate.graphics?.elements?.[0].asset_id).toBe(canonical.slice(0, 12));
  });

  it("renders an owned entity outside the active project catalog without moving it", async () => {
    const candidate: Shot = {...shot, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical, entity_id: canonical}]}};
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(canonical));
    expect(getAssetQuery).toHaveBeenCalledWith({id: canonical});
    expect(trpcClient.assets.search.query).not.toHaveBeenCalled();
  });

  it.each(["Asset not found", "short id matches more than one row"])("denies missing/foreign or ambiguous entities before compositor rendering: %s", async message => {
    getAssetQuery.mockRejectedValue(new Error(message));
    const candidate: Shot = {...shot, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical, entity_id: canonical.slice(0, 12)}]}};
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.queryByTestId("timeline-compositor-input")).not.toBeInTheDocument();
  });

  it("rejects a swapped entity reference instead of replacing protected exact media", async () => {
    getAssetQuery.mockImplementation(async ({id}) => id === canonical ? sourceAsset(canonical, "another-project", replacement) : sourceAsset(replacement));
    const candidate: Shot = {...shot, production: {schema_version: 1, speech_mode: "none", requested_take_count: 1, media_strategy: "still_motion_graphics", protected_inputs: [{id: "product-input", kind: "product", asset_id: canonical, entity_id: canonical, allowed_transformations: ["position", "scale", "opacity", "composite"]}]}, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical, entity_id: canonical, protected_input_id: "product-input"}]}};
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no longer points to the exact declared source asset"));
    expect(screen.queryByTestId("timeline-compositor-input")).not.toBeInTheDocument();
    expect(candidate.production?.protected_inputs?.[0].asset_id).toBe(canonical);
  });

  it("rejects conflicting graphics/protected entity identities even when their image matches", async () => {
    getAssetQuery.mockImplementation(async ({id}) => id === canonical ? sourceAsset() : sourceAsset(replacement, "another-project", canonical));
    const candidate: Shot = {...shot, production: {schema_version: 1, speech_mode: "none", requested_take_count: 1, media_strategy: "still_motion_graphics", protected_inputs: [{id: "product-input", kind: "product", asset_id: canonical, entity_id: replacement, allowed_transformations: ["position", "scale", "opacity", "composite"]}]}, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical, entity_id: canonical, protected_input_id: "product-input"}]}};
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("different entity from its protected source"));
    expect(screen.queryByTestId("timeline-compositor-input")).not.toBeInTheDocument();
  });

  it("revalidates exact source identity when an entity changes after review", async () => {
    const candidate: Shot = {...shot, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical, entity_id: canonical}]}};
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(canonical));
    getAssetQuery.mockImplementation(async ({id}) => id === canonical ? sourceAsset(canonical, "another-project", replacement) : sourceAsset(replacement));
    await act(async () => queryClient.invalidateQueries({queryKey: ["assets"]}));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no longer points to the exact declared source asset"));
    expect(screen.queryByTestId("timeline-compositor-input")).not.toBeInTheDocument();
  });

  it.each([false, true])("reviews a complete shot while another draft shot has an unresolved entity (draft first: %s)", async draftFirst => {
    const candidate: Shot = {...shot, index: draftFirst ? 1 : 0, graphics: {mode: "graphics_first", elements: [{id: "product", kind: "asset", role: "product", asset_id: canonical, entity_id: canonical}]}};
    const incomplete: Shot = {...shot, id: "incomplete-draft", index: draftFirst ? 0 : 1, graphics: {mode: "graphics_first", elements: [{id: "pending-product", kind: "asset", entity_id: "missing-draft-entity"}]}};
    useStoryboardStore.setState(state => ({boards: {...state.boards, board: {...state.boards.board, shots: draftFirst ? [incomplete, candidate] : [candidate, incomplete]}}}));
    render(<ThemeProvider theme={mockTheme}><ShotDesignFrame boardId="board" shot={candidate} /></ThemeProvider>);
    await waitFor(() => expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(canonical));
    expect(getAssetQuery).not.toHaveBeenCalledWith({id: "missing-draft-entity"});
    expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(`"time":${draftFirst ? 6000 : 2000}`);
    expect(useStoryboardStore.getState().boards.board.shots[draftFirst ? 0 : 1]).toEqual(incomplete);
  });

  it("plays a policy-allowed composed video using its local Timeline playback", async () => {
    const videoShot: Shot = {
      ...shot,
      clip: { type: "video", asset_id: "accepted-video" }
    };
    render(
      <ThemeProvider theme={mockTheme}>
        <ShotDesignFrame boardId="board" shot={videoShot} />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Play composed shot" })
      ).toBeVisible()
    );
    expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
      '"mediaType":"video"'
    );
    fireEvent.click(screen.getByRole("button", { name: "Play composed shot" }));
    expect(
      screen.getByRole("button", { name: "Pause composed shot" })
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Pause composed shot" })
    );
    expect(
      screen.getByRole("button", { name: "Play composed shot" })
    ).toBeVisible();
  });
  it("does not play or prefer an old video under still-motion-graphics policy", async () => {
    const stillShot: Shot = {
      ...shot,
      clip: { type: "video", asset_id: "old-video" },
      production: {
        schema_version: 1,
        speech_mode: "none",
        requested_take_count: 1,
        media_strategy: "still_motion_graphics",
        protected_inputs: []
      }
    };
    render(
      <ThemeProvider theme={mockTheme}>
        <ShotDesignFrame boardId="board" shot={stillShot} />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("timeline-compositor-input")).toHaveTextContent(
        "original-product"
      )
    );
    expect(
      screen.queryByRole("button", { name: "Play composed shot" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("timeline-compositor-input")
    ).not.toHaveTextContent("old-video");
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
