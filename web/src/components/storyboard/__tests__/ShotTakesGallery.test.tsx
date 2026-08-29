import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// The gallery reuses the node-results renderer; stub it so this test asserts
// wiring (what value it receives), not the renderer's own media pipeline.
// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock (resolution itself is covered
// by hooks/__tests__/useResolvedMediaUri.test.tsx).
jest.mock("../../../hooks/useResolvedMediaUri");

// The gallery resolves the board's asset records the same way; same reason.
jest.mock("../../../hooks/assets/useAssetsForLocators");

jest.mock("../../node/OutputRenderer", () => ({
  __esModule: true,
  default: ({ value }: { value: unknown[] }) => (
    <div data-testid="output-renderer">{`items:${value.length}`}</div>
  )
}));

// The fullscreen viewer is the asset explorer's, which pulls in routing and
// server state; stub it and assert what the gallery hands it.
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({ url, contentType }: { url: string; contentType: string }) => (
    <div data-testid="asset-viewer">{`${contentType}:${url}`}</div>
  )
}));

const syncShotClipToTimelineMock = jest.fn();
jest.mock("../../../stores/storyboard/timelineSync", () => ({
  syncShotClipToTimeline: (...args: unknown[]) =>
    syncShotClipToTimelineMock(...args)
}));

import ShotTakesGallery from "../ShotTakesGallery";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-gallery";

const image = (n: number): ImageRef => ({
  type: "image",
  uri: `http://example.com/still-${n}.png`,
  asset_id: `img-${n}`
});

const video = (n: number): VideoRef => ({
  type: "video",
  uri: `http://example.com/clip-${n}.mp4`,
  asset_id: `vid-${n}`
});

const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  action: "A lighthouse at dusk",
  status: "rendered",
  ...overrides
});

const seedShot = (shot: Shot): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, shot);
};

const renderGallery = (shot: Shot, readOnly = false) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotTakesGallery boardId={BOARD} shot={shot} readOnly={readOnly} />
    </ThemeProvider>
  );

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
  syncShotClipToTimelineMock.mockClear();
});

describe("ShotTakesGallery", () => {
  it("renders nothing when the shot has at most one still and one clip", () => {
    const { container } = renderGallery(
      makeShot({ keyframe: image(1), clip: video(1) })
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows counts and reveals both galleries via the node-results renderer", async () => {
    const shot = makeShot({
      keyframe: image(2),
      keyframe_versions: [image(1), image(2)],
      clip: video(3),
      clip_versions: [video(1), video(2), video(3)]
    });
    renderGallery(shot);

    expect(screen.getByText("Takes: 2 stills · 3 clips")).toBeInTheDocument();
    expect(screen.queryByTestId("output-renderer")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View takes" }));

    const renderers = screen.getAllByTestId("output-renderer");
    expect(renderers).toHaveLength(2);
    expect(renderers[0]).toHaveTextContent("items:2");
    expect(renderers[1]).toHaveTextContent("items:3");

    await userEvent.click(screen.getByRole("button", { name: "Hide takes" }));
    expect(screen.queryByTestId("output-renderer")).not.toBeInTheDocument();
  });

  it("selects a still by clicking its thumbnail and marks it pressed", async () => {
    const shot = makeShot({
      keyframe: image(2),
      keyframe_versions: [image(1), image(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    expect(screen.getByRole("button", { name: "Use still 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await userEvent.click(screen.getByRole("button", { name: "Use still 1" }));

    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.keyframe).toEqual(image(1));
  });

  it("selects a clip take and syncs it to a linked timeline", async () => {
    const shot = makeShot({
      clip: video(2),
      clip_versions: [video(1), video(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    await userEvent.click(screen.getByText("Take 1"));

    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.clip).toEqual(video(1));
    expect(syncShotClipToTimelineMock).toHaveBeenCalledWith(
      BOARD,
      shot.id,
      "vid-1"
    );
  });

  it("opens a still take fullscreen without changing the selection", async () => {
    const shot = makeShot({
      keyframe: image(2),
      keyframe_versions: [image(1), image(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "View still 1 fullscreen" })
    );

    expect(screen.getByTestId("asset-viewer")).toHaveTextContent(
      "image/*:https://assets.test/img-1"
    );
    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.keyframe).toEqual(image(2));
  });

  it("opens a clip take fullscreen, read-only included", async () => {
    const shot = makeShot({
      clip: video(2),
      clip_versions: [video(1), video(2)]
    });
    seedShot(shot);
    renderGallery(shot, true);

    await userEvent.click(
      screen.getByRole("button", { name: "View clip take 1 fullscreen" })
    );

    expect(screen.getByTestId("asset-viewer")).toHaveTextContent(
      "video/*:https://assets.test/vid-1"
    );
  });

  it("does not select on click when read-only", async () => {
    const shot = makeShot({
      keyframe: image(2),
      keyframe_versions: [image(1), image(2)]
    });
    seedShot(shot);
    renderGallery(shot, true);

    await userEvent.click(screen.getByRole("button", { name: "Use still 1" }));

    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.keyframe).toEqual(image(2));
  });
});
