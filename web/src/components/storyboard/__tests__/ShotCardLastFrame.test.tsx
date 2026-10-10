/**
 * Continuing a shot from where the previous one ends: the shot's menu takes
 * the previous shot's selected clip, decodes its last frame, uploads it, and
 * makes it this shot's current still. Earlier stills stay as takes.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useResolvedMediaUri");
jest.mock("../../../hooks/assets/useAssetsForLocators");
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="asset-viewer" />
}));
jest.mock("../../../trpc/client", () => ({
  trpc: { scripts: { get: { useQuery: () => ({ data: undefined }) } } },
  trpcClient: {}
}));
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

const mockUploadAsset = jest.fn(
  ({ onCompleted }: { onCompleted: (asset: unknown) => void }) =>
    onCompleted({
      id: "frame-asset",
      content_type: "image/png",
      get_url: "https://assets.test/frame-asset"
    })
);
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: (selector: (state: unknown) => unknown) =>
    selector({ uploadAsset: mockUploadAsset })
}));
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(async () => undefined),
    generateClip: jest.fn(async () => undefined),
    retryFailedRequest: jest.fn(async () => undefined)
  })
}));

const mockCaptureLastFrame = jest.fn(
  async (_url: string, name: string) =>
    new File([new Uint8Array([1])], name, { type: "image/png" })
);
jest.mock("../lastFrame", () => ({
  captureLastFrame: (url: string, name: string) =>
    mockCaptureLastFrame(url, name)
}));

import ShotCard from "../ShotCard";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-last-frame";

const shotAt = (index: number, overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: `shot-${index + 1}`,
  index,
  action: `Shot ${index + 1}`,
  status: "planned",
  ...overrides
});

const seed = (shots: Shot[]): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  for (const shot of shots) {
    store.upsertShot(BOARD, shot);
  }
};

const storedShot = (id: string): Shot | undefined =>
  useStoryboardStore
    .getState()
    .getBoard(BOARD)
    ?.shots.find((shot) => shot.id === id);

const renderCard = (shot: Shot) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId={BOARD} shot={shot} />
    </ThemeProvider>
  );

const openMenu = async (): Promise<void> => {
  await userEvent.click(screen.getByRole("button", { name: "Shot actions" }));
};

beforeEach(() => {
  mockUploadAsset.mockClear();
  mockCaptureLastFrame.mockClear();
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

it("makes the previous shot's last frame this shot's current still", async () => {
  const oldStill = { type: "image" as const, uri: "asset://old", asset_id: "old" };
  seed([
    shotAt(0, {
      status: "rendered",
      clip: { type: "video", uri: "asset://clip-1", asset_id: "clip-1" }
    }),
    shotAt(1, { status: "keyframe_ready", keyframe: oldStill })
  ]);
  renderCard(storedShot("shot-2")!);

  await openMenu();
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Use last frame of shot 1" })
  );

  await waitFor(() =>
    expect(storedShot("shot-2")?.keyframe?.asset_id).toBe("frame-asset")
  );
  expect(mockCaptureLastFrame).toHaveBeenCalledWith(
    "https://assets.test/clip-1",
    expect.stringMatching(/\.png$/)
  );
  expect(
    storedShot("shot-2")?.keyframe_versions?.map((v) => v.asset_id)
  ).toEqual(["old", "frame-asset"]);
  expect(storedShot("shot-2")?.status).toBe("keyframe_ready");
});

it("disables the item while the previous shot has no clip", async () => {
  seed([shotAt(0), shotAt(1)]);
  renderCard(storedShot("shot-2")!);

  await openMenu();
  expect(
    screen.getByRole("menuitem", { name: /Use last frame of shot 1/ })
  ).toHaveAttribute("aria-disabled", "true");
});

it("offers nothing on the first shot", async () => {
  seed([shotAt(0), shotAt(1)]);
  renderCard(storedShot("shot-1")!);

  await openMenu();
  expect(
    screen.queryByRole("menuitem", { name: /Use last frame/ })
  ).not.toBeInTheDocument();
});
