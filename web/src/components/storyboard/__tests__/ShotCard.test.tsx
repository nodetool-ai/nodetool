import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../hooks/useResolvedMediaUri");

// The gallery resolves the board's asset records the same way; same reason.
jest.mock("../../../hooks/assets/useAssetsForLocators");

// The fullscreen viewer is the asset explorer's, which pulls in routing and
// server state; stub it and assert what the card hands it.
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({ url, contentType }: { url: string; contentType: string }) => (
    <div data-testid="asset-viewer">{`${contentType}:${url}`}</div>
  )
}));

// The card reads the board only to time a shot against the linked script.
jest.mock("../../../stores/storyboard/StoryboardStore", () => {
  const actual = jest.requireActual(
    "../../../stores/storyboard/StoryboardStore"
  );
  return {
    ...actual,
    useStoryboardStore: <T,>(selector: (s: unknown) => T) =>
      selector({ boards: { "board-1": { screenplay: null } } })
  };
});

jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: {
      get: { useQuery: () => ({ data: undefined }) }
    }
  },
  trpcClient: {}
}));

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: ({ placeholder }: { placeholder?: React.ReactNode }) => (
    <div data-testid="image-preview">{placeholder}</div>
  )
}));

import ShotCard from "../ShotCard";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";

const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  ...overrides
});

const renderCard = (
  shot: Shot,
  props: Partial<React.ComponentProps<typeof ShotCard>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId="board-1" shot={shot} {...props} />
    </ThemeProvider>
  );

describe("ShotCard", () => {
  it("shows the shot number, its length, and the action line", () => {
    renderCard(makeShot({ index: 4, duration_seconds: 3 }));
    expect(screen.getByText("SH 05 · 3s")).toBeInTheDocument();
    expect(screen.getByText("A lighthouse at dusk")).toBeInTheDocument();
  });

  it("drops the length from the label when the shot has none", () => {
    renderCard(makeShot());
    expect(screen.getByText("SH 01")).toBeInTheDocument();
  });

  it("shows why the last render failed", () => {
    // Seed the job state directly: this suite mocks the storyboard store, so
    // the action that would write it has nothing to write to.
    act(() =>
      useStoryboardGenerationStore.setState({
        shotJobs: {
          "shot-1": {
            shotId: "shot-1",
            boardId: "board-1",
            jobId: "req-1",
            kind: "keyframe",
            status: "failed",
            errorMessage: "Out of credits"
          }
        }
      })
    );
    renderCard(makeShot({ status: "failed" }));
    expect(screen.getByTestId("shot-render-error")).toHaveTextContent(
      "Out of credits"
    );
    act(() => useStoryboardGenerationStore.setState({ shotJobs: {} }));
  });

  it("falls back to a generic reason when the job state is gone", () => {
    renderCard(makeShot({ status: "failed" }));
    expect(screen.getByTestId("shot-render-error")).toHaveTextContent(
      "The render failed. Try again."
    );
  });
});

describe("ShotCard status pill", () => {
  const pill = () => screen.getByTestId("shot-status-pill");

  it("reads planned before anything is generated", () => {
    renderCard(makeShot());
    expect(pill()).toHaveTextContent("planned");
    expect(pill()).toHaveAttribute("data-tone", "neutral");
  });

  it("reads still · clip queued once the shot has a still", () => {
    renderCard(
      makeShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "http://example.com/still.png" }
      })
    );
    expect(pill()).toHaveTextContent("still · clip queued");
  });

  it("says nothing once the clip is rendered", () => {
    renderCard(
      makeShot({
        status: "rendered",
        duration_seconds: 4,
        clip: { type: "video", uri: "http://example.com/clip.mp4" }
      })
    );
    expect(screen.queryByTestId("shot-status-pill")).not.toBeInTheDocument();
  });

  it("takes the render tone while a clip is in flight", () => {
    renderCard(makeShot({ status: "clip_generating" }));
    expect(pill()).toHaveTextContent("rendering clip");
    expect(pill()).toHaveAttribute("data-tone", "rendering");
  });

  it("takes the failed tone after a failed render", () => {
    renderCard(makeShot({ status: "failed" }));
    expect(pill()).toHaveAttribute("data-tone", "failed");
  });
});

describe("ShotCard selection", () => {
  it("selects the shot when the card is clicked", async () => {
    const onSelect = jest.fn();
    renderCard(makeShot(), { onSelect });

    await userEvent.click(screen.getByRole("button", { name: "1. Opening" }));
    expect(onSelect).toHaveBeenCalledWith("shot-1");
  });

  it("marks the selected card pressed", () => {
    renderCard(makeShot(), { onSelect: jest.fn(), selected: true });
    expect(screen.getByRole("button", { name: "1. Opening" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});

describe("ShotCard media viewer", () => {
  it("opens the still fullscreen from the preview", async () => {
    renderCard(
      makeShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "asset://img-9", asset_id: "img-9" }
      })
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View still fullscreen" })
    );

    expect(screen.getByTestId("asset-viewer")).toHaveTextContent(
      "image/*:https://assets.test/img-9"
    );
  });

  it("opens the clip fullscreen once the shot is rendered", async () => {
    renderCard(
      makeShot({
        status: "rendered",
        keyframe: { type: "image", uri: "asset://img-9", asset_id: "img-9" },
        clip: { type: "video", uri: "asset://vid-9", asset_id: "vid-9" }
      })
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View clip fullscreen" })
    );

    expect(screen.getByTestId("asset-viewer")).toHaveTextContent(
      "video/*:https://assets.test/vid-9"
    );
  });

  it("offers no fullscreen viewer for a shot with no media", () => {
    renderCard(makeShot());
    expect(
      screen.queryByRole("button", { name: /fullscreen/i })
    ).not.toBeInTheDocument();
  });

  it("does not select the shot when the viewer is opened", async () => {
    const onSelect = jest.fn();
    renderCard(
      makeShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "asset://img-9", asset_id: "img-9" }
      }),
      { onSelect }
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View still fullscreen" })
    );
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("ShotCard render state", () => {
  it("marks the card as generating so the render border renders", () => {
    const statuses: ShotStatus[] = [
      "planned",
      "keyframe_generating",
      "clip_generating",
      "rendered"
    ];
    for (const status of statuses) {
      const { container, unmount } = renderCard(makeShot({ status }));
      const card = container.firstElementChild as HTMLElement;
      expect(card?.getAttribute("data-generating")).toBe(
        status === "keyframe_generating" || status === "clip_generating"
          ? "true"
          : null
      );
      unmount();
    }
  });

  it("shows a progress bar only while a render is in flight", () => {
    const { unmount } = renderCard(makeShot({ status: "clip_generating" }));
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);
    unmount();

    renderCard(makeShot());
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
