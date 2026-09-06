/**
 * Criterion 15 for the two edits the dialog's viewer offers: flipping a still
 * and handing one to the image editor each *add* a take. Neither may replace
 * the version it started from — a mirrored frame the creator does not like has
 * to leave the original there to go back to.
 *
 * The canvas work itself is `shotImageEdits`, mocked here: what matters is
 * which store write the result lands through.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { ImageRef, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useResolvedMediaUri");

const flippedFile = new File(["flipped"], "flipped.png", {
  type: "image/png"
});
const copiedFile = new File(["copy"], "copy.png", { type: "image/png" });
const flippedStillMock = jest.fn(
  async (_url: string, _name: string) => flippedFile
);
const copiedStillMock = jest.fn(
  async (_url: string, _name: string) => copiedFile
);
jest.mock("../shotImageEdits", () => ({
  flippedStill: (url: string, name: string) => flippedStillMock(url, name),
  copiedStill: (url: string, name: string) => copiedStillMock(url, name)
}));

type UploadCall = {
  file: File;
  onCompleted?: (asset: { id: string }) => void;
  onFailed?: (error: string) => void;
};
const uploadAssetMock = jest.fn<void, [UploadCall]>();
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: (selector: (state: unknown) => unknown) =>
    selector({ uploadAsset: uploadAssetMock })
}));

import ShotEditViewer from "../ShotEditViewer";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useWorkspaceTabsStore } from "../../../stores/WorkspaceTabsStore";

const BOARD = "board-viewer";

const image = (id: string): ImageRef => ({
  type: "image",
  uri: `asset://${id}`,
  asset_id: id
});

const seedShot = (overrides: Partial<Shot> = {}): Shot => {
  const shot: Shot = {
    type: "shot",
    id: "shot-1",
    index: 0,
    action: "A lighthouse at dusk",
    status: "keyframe_ready",
    keyframe: image("still-1"),
    keyframe_versions: [image("still-1")],
    ...overrides
  };
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, shot);
  return shot;
};

const storedShot = (): Shot => {
  const found = useStoryboardStore
    .getState()
    .boards[BOARD]?.shots.find((s) => s.id === "shot-1");
  if (!found) {
    throw new Error("the shot is not on the board");
  }
  return found;
};

/** Re-render with whatever the store now holds, as the dialog does. */
const renderViewer = (shot: Shot) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotEditViewer boardId={BOARD} shot={shot} />
    </ThemeProvider>
  );

beforeEach(() => {
  uploadAssetMock.mockReset();
  flippedStillMock.mockClear();
  copiedStillMock.mockClear();
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("ShotEditViewer keyboard", () => {
  // PRD § 7.5: `←`/`→` step versions. They live here, not in the dialog shell,
  // because the pager index and the still/clip toggle are this component's
  // state — a copy in the shell would be a second source of truth.
  it("steps the selected version with the arrow keys", async () => {
    const view = renderViewer(
      seedShot({
        keyframe: image("still-1"),
        keyframe_versions: [image("still-1"), image("still-2")]
      })
    );
    const rerender = (shot: Shot) =>
      view.rerender(
        <ThemeProvider theme={mockTheme}>
          <ShotEditViewer boardId={BOARD} shot={shot} />
        </ThemeProvider>
      );

    expect(screen.getByTestId("shot-version-pager")).toHaveTextContent("1 / 2");
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(storedShot().keyframe?.asset_id).toBe("still-2")
    );

    // The dialog re-renders the viewer from the store after a selection, so
    // stepping back needs the same fresh shot the real caller would pass.
    rerender(storedShot());
    expect(screen.getByTestId("shot-version-pager")).toHaveTextContent("2 / 2");

    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() =>
      expect(storedShot().keyframe?.asset_id).toBe("still-1")
    );
  });

  it("leaves the arrows alone on a read-only board", async () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ShotEditViewer
          boardId={BOARD}
          shot={seedShot({
            keyframe: image("still-1"),
            keyframe_versions: [image("still-1"), image("still-2")]
          })}
          readOnly
        />
      </ThemeProvider>
    );

    await userEvent.keyboard("{ArrowRight}");
    expect(storedShot().keyframe?.asset_id).toBe("still-1");
  });
});

describe("ShotEditViewer versions (criterion 15)", () => {
  it("pages the takes and says where in the run it is", () => {
    renderViewer(
      seedShot({
        keyframe: image("still-2"),
        keyframe_versions: [image("still-1"), image("still-2")]
      })
    );
    expect(screen.getByTestId("shot-version-pager")).toHaveTextContent("2 / 2");
    expect(
      screen.getByRole("button", { name: "Next version" })
    ).toBeDisabled();
  });

  it("selects the previous take from the pager", async () => {
    renderViewer(
      seedShot({
        keyframe: image("still-2"),
        keyframe_versions: [image("still-1"), image("still-2")]
      })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Previous version" })
    );
    expect(storedShot().keyframe?.asset_id).toBe("still-1");
  });

  it("adds the flip as a new take, leaving the still it mirrored in place", async () => {
    renderViewer(seedShot());

    await userEvent.click(screen.getByRole("button", { name: "Flip horizontal" }));
    await waitFor(() => expect(uploadAssetMock).toHaveBeenCalled());
    expect(flippedStillMock).toHaveBeenCalledWith(
      "https://assets.test/still-1",
      expect.stringContaining("flipped")
    );

    uploadAssetMock.mock.calls[0][0].onCompleted?.({ id: "still-2" });

    const shot = storedShot();
    expect(shot.keyframe_versions?.map((v) => v.asset_id)).toEqual([
      "still-1",
      "still-2"
    ]);
    expect(shot.keyframe?.asset_id).toBe("still-2");
  });

  it("opens the image editor on a copy, so the edit lands as a new take", async () => {
    renderViewer(seedShot());

    await userEvent.click(
      screen.getByRole("button", { name: "Open in image editor" })
    );
    await waitFor(() => expect(uploadAssetMock).toHaveBeenCalled());
    expect(copiedStillMock).toHaveBeenCalledWith(
      "https://assets.test/still-1",
      expect.stringContaining("edit")
    );

    uploadAssetMock.mock.calls[0][0].onCompleted?.({ id: "still-2" });

    const shot = storedShot();
    expect(shot.keyframe_versions?.map((v) => v.asset_id)).toEqual([
      "still-1",
      "still-2"
    ]);
    // The editor opens on the copy — "Save to image" writes back into that
    // asset, never into the still the shot already had.
    const tabs = useWorkspaceTabsStore.getState().tabs;
    expect(
      tabs.some((t) => t.type === "image" && t.ref === "still-2")
    ).toBe(true);
  });

  it("offers no edits on a read-only board", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ShotEditViewer boardId={BOARD} shot={seedShot()} readOnly />
      </ThemeProvider>
    );
    expect(
      screen.queryByRole("button", { name: "Flip horizontal" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open in image editor" })
    ).not.toBeInTheDocument();
  });
});
