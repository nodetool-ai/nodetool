/**
 * E1 criterion 7 and PRD D12.
 *
 * The banner must render *nothing* on a board with nothing stale — asserted as
 * a null root, not as "no text found", because an empty div would pass the
 * latter and still shift the toolbar. And a style change must never spend: the
 * only thing that enqueues a render here is the creator's click, and it
 * enqueues stills only.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type {
  ClipVersion,
  KeyframeVersion,
  RenderInputs,
  Shot
} from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

const mockGenerateKeyframe = jest.fn().mockResolvedValue(undefined);
const mockGenerateClip = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: mockGenerateKeyframe,
    generateClip: mockGenerateClip,
    generateRevisedClip: jest.fn()
  })
}));

import BoardStaleBanner, { staleBannerMessage } from "../BoardStaleBanner";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-stale";

/** A record that cannot match what the shot would compose now. */
const outdated = (kind: RenderInputs["kind"]): RenderInputs => ({
  kind,
  prompt_hash: "hash-from-the-old-style",
  model: "",
  aspect_ratio: "16:9",
  style_entity_id: null,
  recorded_at: "2026-01-01T00:00:00.000Z"
});

/** A still that was rendered from inputs the shot no longer has. */
const staleKeyframe = (assetId: string): KeyframeVersion => ({
  type: "image",
  uri: `asset://${assetId}`,
  asset_id: assetId,
  render_inputs: outdated("keyframe")
});

/** A clip in the same position. */
const staleClip = (assetId: string): ClipVersion => ({
  type: "video",
  uri: `asset://${assetId}`,
  asset_id: assetId,
  render_inputs: outdated("clip")
});

const shot = (id: string, index: number): Shot => ({
  type: "shot",
  id,
  index,
  action: `shot ${index}`,
  status: "keyframe_ready"
});

const seedBoard = (): void => {
  useStoryboardStore.setState({ boards: {}, history: {}, serverRevisions: {} });
  useStoryboardStore.getState().ensureBoard(BOARD);
};

const addShot = (id: string, index: number): void => {
  useStoryboardStore.getState().upsertShot(BOARD, shot(id, index));
};

const renderBanner = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <BoardStaleBanner boardId={BOARD} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockGenerateKeyframe.mockClear();
  mockGenerateClip.mockClear();
  seedBoard();
});

describe("staleBannerMessage", () => {
  it("is null with nothing stale", () => {
    expect(staleBannerMessage(0, 0)).toBeNull();
  });

  it("counts stills and clips separately and agrees with its verb", () => {
    expect(staleBannerMessage(1, 0)).toBe("Style changed. 1 still is stale.");
    expect(staleBannerMessage(0, 2)).toBe("Style changed. 2 clips are stale.");
    expect(staleBannerMessage(3, 1)).toBe(
      "Style changed. 3 stills and 1 clip are stale."
    );
  });
});

describe("BoardStaleBanner", () => {
  it("renders nothing at all when no version is stale (criterion 7)", () => {
    addShot("s-fresh", 0);
    useStoryboardStore
      .getState()
      .setShotKeyframe(BOARD, "s-fresh", {
        type: "image",
        uri: "asset://a-fresh",
        asset_id: "a-fresh"
      });

    const { container } = renderBanner();

    expect(container.firstChild).toBeNull();
  });

  it("counts the stale stills and clips", () => {
    addShot("s-stale-still", 0);
    addShot("s-stale-clip", 1);
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, "s-stale-still", staleKeyframe("a-1"));
    store.setShotClip(BOARD, "s-stale-clip", staleClip("a-2"));

    renderBanner();

    expect(
      screen.getByText("Style changed. 1 still and 1 clip are stale.")
    ).toBeInTheDocument();
  });

  it("enqueues nothing until the creator clicks, then only stale stills (D12)", async () => {
    addShot("s-stale-still", 0);
    addShot("s-fresh-still", 1);
    addShot("s-stale-clip", 2);
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, "s-stale-still", staleKeyframe("a-1"));
    store.setShotKeyframe(BOARD, "s-fresh-still", {
      type: "image",
      uri: "asset://a-2",
      asset_id: "a-2"
    });
    store.setShotClip(BOARD, "s-stale-clip", staleClip("a-3"));

    renderBanner();
    // Mounting the banner is what a style change does. It must not spend.
    expect(mockGenerateKeyframe).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Re-render stills" }));

    expect(mockGenerateKeyframe).toHaveBeenCalledTimes(1);
    expect(mockGenerateKeyframe).toHaveBeenCalledWith(
      BOARD,
      expect.objectContaining({ id: "s-stale-still" })
    );
    // Clips stay stale until `Render clips`.
    expect(mockGenerateClip).not.toHaveBeenCalled();
  });

  it("offers no re-render action when only clips are stale", () => {
    addShot("s-stale-clip", 0);
    useStoryboardStore
      .getState()
      .setShotClip(BOARD, "s-stale-clip", staleClip("a-1"));

    renderBanner();

    expect(screen.getByText("Style changed. 1 clip is stale.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
