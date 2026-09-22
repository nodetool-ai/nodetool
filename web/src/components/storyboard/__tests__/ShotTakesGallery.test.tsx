import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type {
  ClipVersion,
  ImageRef,
  Shot,
  VideoRef
} from "@nodetool-ai/protocol";
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

const editVideo = (n: number): ClipVersion => ({
  ...video(n),
  mediaEdit: {
    action: "video_edit",
    modelTask: "video_to_video",
    requestId: `request-${n}`,
    instruction: "make it warmer",
    provider: "test-provider",
    model: "test-model",
    sourceContext: {
      sequenceId: BOARD,
      clipId: "shot-1",
      sourceAssetId: `vid-${n}`,
      sourceStartMs: 0,
      sourceEndMs: 4_000,
      timelineStartMs: 0,
      timelineDurationMs: 4_000,
      speedMultiplier: 1
    }
  }
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

const storedClip = (shotId: string): VideoRef | null | undefined =>
  useStoryboardStore
    .getState()
    .boards[BOARD]?.shots.find((shot) => shot.id === shotId)?.clip;

const storedShotKeyframe = (shotId: string): ImageRef | null | undefined =>
  useStoryboardStore
    .getState()
    .boards[BOARD]?.shots.find((shot) => shot.id === shotId)?.keyframe;

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
  it("renders nothing for a shot that has generated nothing", () => {
    const { container } = renderGallery(makeShot({ status: "planned" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the single still and clip of a one-take shot", () => {
    renderGallery(makeShot({ keyframe: image(1), clip: video(1) }));

    expect(screen.getByText("Stills")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Still 1, current still" })
    ).toBeInTheDocument();
    expect(screen.getByText("Clips")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Take 1, current clip" })
    ).toHaveAttribute("aria-current", "true");
  });

  it("shows counts and reveals both galleries via the node-results renderer", async () => {
    const shot = makeShot({
      keyframe: image(2),
      keyframe_versions: [image(1), image(2)],
      clip: video(3),
      clip_versions: [video(1), video(2), video(3)]
    });
    renderGallery(shot);

    expect(
      screen.getAllByRole("button", {
        name: /^(Preview still|Still \d, current still)/
      })
    ).toHaveLength(2);
    expect(
      screen.getAllByText(/^(Preview \d|Take \d · Current)$/)
    ).toHaveLength(3);
    expect(screen.queryByTestId("output-renderer")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View takes" }));

    const renderers = screen.getAllByTestId("output-renderer");
    expect(renderers).toHaveLength(2);
    expect(renderers[0]).toHaveTextContent("items:2");
    expect(renderers[1]).toHaveTextContent("items:3");

    await userEvent.click(screen.getByRole("button", { name: "Hide takes" }));
    expect(screen.queryByTestId("output-renderer")).not.toBeInTheDocument();
  });

  it("previews a still without selecting it, then accepts it explicitly", async () => {
    const shot = makeShot({
      keyframe: image(2),
      keyframe_versions: [image(1), image(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    expect(
      screen.getByRole("button", { name: "Still 2, current still" })
    ).toHaveAttribute("aria-current", "true");
    await userEvent.click(
      screen.getByRole("button", { name: "Preview still 1" })
    );
    expect(storedShotKeyframe(shot.id)).toEqual(image(2));

    await userEvent.click(
      screen.getByRole("button", { name: "Set still 1 as current still" })
    );

    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.keyframe).toEqual(image(1));
  });

  it("accepts a clip take and syncs it to a linked timeline", async () => {
    const shot = makeShot({
      clip: video(2),
      clip_versions: [video(1), video(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "Set take 1 as current clip" })
    );

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

  it("previews a clip without changing current media, then explicitly accepts it", async () => {
    const shot = makeShot({
      status: "keyframe_ready",
      clip: video(2),
      clip_versions: [video(1), video(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview clip take 1" })
    );
    expect(storedClip(shot.id)).toEqual(video(2));

    await userEvent.click(
      screen.getByRole("button", { name: "Set take 1 as current clip" })
    );
    const accepted = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((item) => item.id === shot.id);
    expect(accepted?.clip).toEqual(video(1));
    expect(accepted?.status).toBe("rendered");
  });

  it("syncs a media-edit candidate only after explicit acceptance", async () => {
    const candidate = editVideo(1);
    const shot = makeShot({
      clip: video(2),
      clip_versions: [candidate, video(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview clip take 1" })
    );
    expect(storedClip(shot.id)).toEqual(video(2));
    expect(syncShotClipToTimelineMock).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Set take 1 as current clip" })
    );

    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.clip).toEqual(candidate);
    expect(syncShotClipToTimelineMock).toHaveBeenCalledWith(
      BOARD,
      shot.id,
      "vid-1"
    );
  });

  it("previews production candidates without selecting them until acceptance", async () => {
    const candidate = {
      ...video(1),
      candidateId: "candidate-1",
      productionSnapshot: { schemaVersion: 1 }
    };
    const shot = makeShot({
      clip: video(2),
      clip_versions: [candidate, video(2)]
    });
    seedShot(shot);
    renderGallery(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "Preview clip take 1" })
    );
    expect(
      useStoryboardStore
        .getState()
        .boards[BOARD]?.shots.find((item) => item.id === shot.id)?.clip
    ).toEqual(video(2));
    expect(screen.getByTestId("asset-viewer")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Set take 1 as current clip" })
    );
    expect(
      useStoryboardStore
        .getState()
        .boards[BOARD]?.shots.find((item) => item.id === shot.id)?.clip
    ).toEqual(candidate);
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

    await userEvent.click(
      screen.getByRole("button", { name: "Preview still 1" })
    );

    const updated = useStoryboardStore
      .getState()
      .boards[BOARD]?.shots.find((s) => s.id === shot.id);
    expect(updated?.keyframe).toEqual(image(2));
  });
});
