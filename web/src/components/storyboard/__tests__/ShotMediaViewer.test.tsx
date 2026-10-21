import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ImageRef, Shot, VideoRef } from "@nodetool-ai/protocol";

import type { Asset } from "../../../stores/ApiTypes";

// Media sources resolve through TanStack Query; this suite renders no
// QueryClientProvider, so use the manual mock.
jest.mock("../../../hooks/useResolvedMediaUri");

// The gallery's asset records come from a fake store here: what matters is
// which assets the viewer is handed, and in what order.
jest.mock("../../../hooks/assets/useAssetsForLocators", () => {
  const { assetIdOf } = jest.requireActual("../../../utils/mediaRef");
  return {
    __esModule: true,
    useAssetsForLocators: (sources: unknown[]) =>
      sources.map((source) => {
        const id = assetIdOf(source);
        return id ? { id, name: id, get_url: `https://assets.test/${id}` } : undefined;
      })
  };
});

// The viewer itself is the asset explorer's; stub it and assert its props.
jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: ({
    asset,
    sortedAssets,
    captions,
    renderActions
  }: {
    asset?: Asset;
    sortedAssets?: Asset[];
    captions?: Record<string, string>;
    renderActions?: (asset: Asset) => React.ReactNode;
  }) => (
    <div
      data-testid="asset-viewer"
      data-active={asset?.id}
      data-caption={asset ? captions?.[asset.id] : undefined}
    >
      {(sortedAssets ?? []).map((item) => item.id).join(",")}
      {asset && renderActions?.(asset)}
    </div>
  )
}));

// The shot's toolbar is the card's own; here only which shot it is for, and
// what its edit and delete do to the viewer, matter.
jest.mock("../ShotActions", () => ({
  __esModule: true,
  default: ({
    shot,
    readOnly,
    onEdit,
    onDeleted
  }: {
    shot: { id: string };
    readOnly?: boolean;
    onEdit?: (shotId: string, focus: "fields" | "dialogue") => void;
    onDeleted?: () => void;
  }) => (
    <div
      data-testid="shot-actions"
      data-shot={shot.id}
      data-read-only={readOnly ? "true" : undefined}
    >
      {onEdit && (
        <button type="button" onClick={() => onEdit(shot.id, "fields")}>
          edit
        </button>
      )}
      <button type="button" onClick={onDeleted}>
        deleted
      </button>
    </div>
  )
}));

const board = { shots: [] as Shot[] };

// The gallery reads the board only for its shots.
jest.mock("../../../stores/storyboard/StoryboardStore", () => ({
  ...jest.requireActual("../../../stores/storyboard/StoryboardStore"),
  useBoard: (id: string) => ({ shots: id === "board-1" ? board.shots : [] })
}));

import ShotMediaViewer from "../ShotMediaViewer";

const image = (id: string): ImageRef => ({
  type: "image",
  uri: `asset://${id}`,
  asset_id: id
});
const video = (id: string): VideoRef => ({
  type: "video",
  uri: `asset://${id}`,
  asset_id: id
});

const shot = (index: number, overrides: Partial<Shot>): Shot => ({
  type: "shot",
  id: `shot-${index}`,
  index,
  action: "A lighthouse at dusk",
  status: "rendered",
  ...overrides
});

beforeEach(() => {
  board.shots = [
    shot(0, {
      keyframe: image("still-a2"),
      keyframe_versions: [image("still-a1"), image("still-a2")],
      clip: video("clip-a")
    }),
    shot(1, {
      action: "A boat leaves the harbour",
      keyframe: image("still-b"),
      clip: video("clip-b")
    })
  ];
});

describe("ShotMediaViewer", () => {
  it("renders nothing until a still or clip is opened", () => {
    render(<ShotMediaViewer boardId="board-1" media={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId("asset-viewer")).not.toBeInTheDocument();
  });

  it("pages through the board's clips when a clip is opened", () => {
    render(
      <ShotMediaViewer
        boardId="board-1"
        media={video("clip-a")}
        onClose={jest.fn()}
      />
    );

    const viewer = screen.getByTestId("asset-viewer");
    expect(viewer).toHaveTextContent("clip-a,clip-b");
    expect(viewer).toHaveAttribute("data-active", "clip-a");
  });

  it("pages through the board's stills when a still is opened", () => {
    render(
      <ShotMediaViewer
        boardId="board-1"
        media={image("still-a1")}
        onClose={jest.fn()}
      />
    );

    const viewer = screen.getByTestId("asset-viewer");
    expect(viewer).toHaveTextContent("still-a1,still-a2,still-b");
    expect(viewer).toHaveAttribute("data-active", "still-a1");
  });

  it("captions the media with its shot number only", () => {
    render(
      <ShotMediaViewer
        boardId="board-1"
        media={image("still-b")}
        onClose={jest.fn()}
      />
    );

    expect(screen.getByTestId("asset-viewer")).toHaveAttribute(
      "data-caption",
      "SH 02"
    );
    expect(screen.getByTestId("asset-viewer")).not.toHaveTextContent(
      "A boat leaves the harbour"
    );
  });

  it("shows the toolbar of the shot whose media is on screen", () => {
    render(
      <ShotMediaViewer
        boardId="board-1"
        media={image("still-b")}
        readOnly
        onClose={jest.fn()}
      />
    );

    const actions = screen.getByTestId("shot-actions");
    expect(actions).toHaveAttribute("data-shot", "shot-1");
    expect(actions).toHaveAttribute("data-read-only", "true");
  });

  it("closes the viewer before opening the shot's editor", () => {
    const onClose = jest.fn();
    const onEdit = jest.fn();
    render(
      <ShotMediaViewer
        boardId="board-1"
        media={image("still-a1")}
        onEdit={onEdit}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "edit" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("shot-0", "fields");
  });

  it("offers no edit without an editor and closes once the shot is deleted", () => {
    const onClose = jest.fn();
    render(
      <ShotMediaViewer
        boardId="board-1"
        media={video("clip-b")}
        onClose={onClose}
      />
    );

    expect(
      screen.queryByRole("button", { name: "edit" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "deleted" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
