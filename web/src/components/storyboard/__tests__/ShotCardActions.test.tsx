/**
 * The card's own actions against the real storyboard store — criteria 11, 12
 * and 15: duplicate, delete, download, the entity chips and dialogue icon, and
 * an upload that adds a still without replacing the one already selected.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity, ImageRef, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Media sources resolve through TanStack Query; this suite renders no
// QueryClientProvider, so use the manual mock.
jest.mock("../../../hooks/useResolvedMediaUri");
jest.mock("../../../hooks/assets/useAssetsForLocators");

jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="asset-viewer" />
}));

jest.mock("../../node/ImageRefPreview", () => ({
  __esModule: true,
  default: () => <div data-testid="image-preview" />
}));

jest.mock("../../../trpc/client", () => ({
  trpc: { scripts: { get: { useQuery: () => ({ data: undefined }) } } },
  trpcClient: {}
}));

const mockEntities: Entity[] = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));

type UploadCall = {
  file: File;
  onCompleted?: (asset: { id: string }) => void;
  onFailed?: (error: string) => void;
};
const mockUploadAsset = jest.fn<void, [UploadCall]>();
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: (selector: (state: unknown) => unknown) =>
    selector({ uploadAsset: mockUploadAsset })
}));

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(async () => undefined),
    generateClip: jest.fn(async () => undefined),
    generateRevisedClip: jest.fn(async () => undefined)
  })
}));

import ShotCard from "../ShotCard";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-actions";

const image = (n: number): ImageRef => ({
  type: "image",
  uri: `asset://img-${n}`,
  asset_id: `img-${n}`
});

const seedShot = (overrides: Partial<Shot> = {}): Shot => {
  const shot: Shot = {
    type: "shot",
    id: "shot-1",
    index: 0,
    slug: "Opening",
    action: "A lighthouse at dusk",
    status: "planned",
    ...overrides
  };
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, shot);
  return shot;
};

const shotsOnBoard = (): Shot[] =>
  useStoryboardStore.getState().boards[BOARD]?.shots ?? [];

const currentShot = (id = "shot-1"): Shot | undefined =>
  shotsOnBoard().find((s) => s.id === id);

const renderCard = (
  shot: Shot,
  props: Partial<React.ComponentProps<typeof ShotCard>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId={BOARD} shot={shot} {...props} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockEntities.length = 0;
  mockUploadAsset.mockReset();
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("ShotCard hover toolbar (criterion 11)", () => {
  it("duplicates the shot after the source, without its script link", async () => {
    const onSelect = jest.fn();
    const shot = seedShot({
      dialogue: "Say it again",
      duration_seconds: 4,
      duration_source: "audio",
      script_line_ids: ["line-1"],
      script_text_snapshot: "Say it again",
      covered_by: { shot_id: "shot-9", start_seconds: 0 }
    });
    renderCard(shot, { onSelect });

    await userEvent.click(
      screen.getByRole("button", { name: "Duplicate shot" })
    );

    const shots = shotsOnBoard();
    expect(shots).toHaveLength(2);
    expect(shots[0].id).toBe("shot-1");
    const copy = shots[1];
    expect(copy.action).toBe("A lighthouse at dusk");
    expect(copy.duration_source).toBe("manual");
    expect(copy.script_line_ids).toBeUndefined();
    expect(copy.script_text_snapshot).toBeUndefined();
    expect(copy.covered_by).toBeUndefined();
    // The toolbar is its own action, not a way of selecting the card.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("asks once before deleting, and removes the shot on that one confirm", async () => {
    const shot = seedShot();
    renderCard(shot);

    await userEvent.click(screen.getByRole("button", { name: "Delete shot" }));
    expect(currentShot()).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(currentShot()).toBeUndefined();
    // One confirm, not a chain: nothing is left asking.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("keeps the shot when the confirm is dismissed", async () => {
    const shot = seedShot();
    renderCard(shot);

    await userEvent.click(screen.getByRole("button", { name: "Delete shot" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(currentShot()).toBeDefined();
  });

  it("saves the still through its resolved URL, never the locator", async () => {
    const clicked: HTMLAnchorElement[] = [];
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function mockClick(this: HTMLAnchorElement) {
        clicked.push(this);
      });
    // The blob path needs a real network; the raw-URL fallback is what a
    // refused fetch takes, and it carries the same resolved URL.
    const realFetch = globalThis.fetch;
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const shot = seedShot({ status: "keyframe_ready", keyframe: image(9) });
    renderCard(shot);

    await userEvent.click(
      screen.getByRole("button", { name: "Download still" })
    );

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0].href).toBe("https://assets.test/img-9");
    expect(clicked[0].download).toBe("shot-01-still.png");

    clickSpy.mockRestore();
    globalThis.fetch = realFetch;
    warnSpy.mockRestore();
  });

  it("offers no duplicate or delete on a read-only board", () => {
    renderCard(seedShot(), { readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Duplicate shot" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete shot" })
    ).not.toBeInTheDocument();
  });
});

describe("ShotCard action line (criterion 12)", () => {
  const marta: Entity = {
    type: "entity",
    id: "e-marta",
    kind: "character",
    name: "Marta",
    descriptor: "a keeper in an oilskin coat"
  };

  it("renders an entity named in the action as a chip", () => {
    mockEntities.push(marta);
    const shot = seedShot({ action: "Marta climbs the lighthouse stair" });
    useStoryboardStore.getState().setEntityIds(BOARD, [marta.id]);
    renderCard(shot);

    const chips = screen.getAllByTestId("shot-entity-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("Marta");
    expect(screen.getByText(/climbs the lighthouse stair/)).toBeInTheDocument();
  });

  it("leaves the action as prose when no cast member is named in it", () => {
    mockEntities.push(marta);
    const shot = seedShot({ action: "The lamp turns in the fog" });
    useStoryboardStore.getState().setEntityIds(BOARD, [marta.id]);
    renderCard(shot);

    expect(screen.queryByTestId("shot-entity-chip")).not.toBeInTheDocument();
  });

  it("fills the dialogue icon only for a shot that has dialogue", () => {
    const { unmount } = renderCard(seedShot({ dialogue: "Keep it lit." }));
    expect(screen.getByTestId("shot-dialogue-icon")).toHaveAttribute(
      "data-filled",
      "true"
    );
    unmount();

    renderCard(seedShot({ dialogue: "" }));
    expect(screen.getByTestId("shot-dialogue-icon")).not.toHaveAttribute(
      "data-filled"
    );
  });

  it("opens the shot from the dialogue icon (the Edit dialog until P4)", async () => {
    const onSelect = jest.fn();
    renderCard(seedShot({ dialogue: "Keep it lit." }), { onSelect });

    await userEvent.click(screen.getByTestId("shot-dialogue-icon"));
    expect(onSelect).toHaveBeenCalledWith("shot-1");
  });

  it("renders the scene and shot caption the board computed", () => {
    renderCard(seedShot(), { caption: "Scene 2 | Shot 3" });
    expect(screen.getByText("Scene 2 | Shot 3")).toBeInTheDocument();
  });
});

describe("ShotCard upload (criterion 15)", () => {
  it("adds the uploaded image as a new still and selects it", async () => {
    const shot = seedShot({
      status: "keyframe_ready",
      keyframe: image(1),
      keyframe_versions: [image(1)]
    });
    renderCard(shot);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(["bytes"], "still.png", { type: "image/png" })
    );

    expect(mockUploadAsset).toHaveBeenCalledTimes(1);
    const call = mockUploadAsset.mock.calls[0][0];
    expect(call.file.name).toBe("still.png");

    call.onCompleted?.({ id: "img-2" });

    const updated = currentShot();
    expect(updated?.keyframe_versions).toEqual([
      image(1),
      { type: "image", uri: "asset://img-2", asset_id: "img-2" }
    ]);
    expect(updated?.keyframe?.asset_id).toBe("img-2");
  });
});
