import React from "react";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import type { Asset } from "../../../../stores/ApiTypes";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import {
  ReplaceClipAssetDialog,
  replacementContentType
} from "../ReplaceClipAssetDialog";

const mockSearch = jest.fn<
  (
    query: string | null,
    tab?: string,
    contentType?: string,
    projectId?: string
  ) => void
>();
let mockAssets: Asset[] = [];
let mockPersonalAssets: Asset[] = [];

jest.mock(
  "../../../node_types/editing/promptComposer/useAssetMentionSearch",
  () => ({
    useAssetMentionSearch: (
      query: string | null,
      tab?: string,
      contentType?: string,
      _includeAssets?: boolean,
      projectId?: string
    ) => {
      mockSearch(query, tab, contentType, projectId);
      return {
        activeTab: "saved",
        setActiveTab: jest.fn(),
        entities: [],
        displayedAssets:
          projectId === "personal-1" ? mockPersonalAssets : mockAssets,
        hasMoreSaved: false,
        loadMoreSaved: jest.fn(),
        handleRename: jest.fn()
      };
    }
  })
);

const mockIdForProject = jest.fn<
  (assetId: string, source: string) => Promise<string>
>();
let mockPersonalProjectId: string | null = null;

jest.mock("../../../../hooks/assets/useProjectAssetPick", () => ({
  useProjectAssetPick: () => ({
    projectId: "project-a",
    personalProjectId: mockPersonalProjectId,
    idForProject: mockIdForProject
  })
}));

const asset = (id: string, name: string): Asset =>
  ({
    id,
    name,
    content_type: "video/mp4",
    thumb_url: "",
    get_url: ""
  }) as unknown as Asset;

const track: TimelineTrack = {
  id: "t1",
  name: "Video",
  type: "video",
  index: 0,
  visible: true,
  locked: false
} as TimelineTrack;

const clip: TimelineClip = {
  id: "c1",
  trackId: "t1",
  name: "Shot",
  startMs: 0,
  durationMs: 4000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  currentAssetId: "old"
};

const renderDialog = (onClose = jest.fn()) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ReplaceClipAssetDialog clipId="c1" onClose={onClose} />
    </ThemeProvider>
  );
  return onClose;
};

describe("ReplaceClipAssetDialog", () => {
  beforeEach(() => {
    mockSearch.mockClear();
    mockIdForProject.mockReset();
    mockIdForProject.mockImplementation(async (assetId, source) =>
      source === "personal" ? `copy-of-${assetId}` : assetId
    );
    mockPersonalProjectId = null;
    mockAssets = [asset("old", "take-1.mp4"), asset("new", "take-2.mp4")];
    mockPersonalAssets = [asset("lib", "library.mp4")];
    useTimelineStore.setState({ tracks: [track], clips: [clip] });
  });

  const currentAssetId = () =>
    useTimelineStore.getState().clips.find((c) => c.id === "c1")
      ?.currentAssetId;

  it("searches only assets of the clip's media type", () => {
    renderDialog();
    expect(mockSearch).toHaveBeenCalledWith("", "saved", "video/", "project-a");
    expect(screen.getByLabelText("Search videos")).toBeTruthy();
  });

  it("replaces the clip's output with the picked asset and closes", async () => {
    const onClose = renderDialog();
    await userEvent.click(screen.getAllByRole("option")[1]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(currentAssetId()).toBe("new");
  });

  it("marks the current asset and picks with the keyboard", async () => {
    const onClose = renderDialog();
    const options = screen.getAllByRole("option");
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    options[1].focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(currentAssetId()).toBe("new");
  });

  it("offers no Personal tab when the timeline is in Personal", () => {
    renderDialog();
    expect(screen.queryByRole("tab", { name: "Personal" })).toBeNull();
  });

  it("puts the copy of an asset picked from Personal on the clip", async () => {
    mockPersonalProjectId = "personal-1";
    const onClose = renderDialog();

    await userEvent.click(screen.getByRole("tab", { name: "Personal" }));
    expect(mockSearch).toHaveBeenLastCalledWith(
      "",
      "saved",
      "video/",
      "personal-1"
    );
    await userEvent.click(screen.getByRole("option"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockIdForProject).toHaveBeenCalledWith("lib", "personal");
    expect(currentAssetId()).toBe("copy-of-lib");
  });

  it("keeps the clip and the dialog when the copy fails", async () => {
    mockPersonalProjectId = "personal-1";
    mockIdForProject.mockRejectedValue(new Error("Project folder not found"));
    const onClose = renderDialog();

    await userEvent.click(screen.getByRole("tab", { name: "Personal" }));
    await userEvent.click(screen.getByRole("option"));

    expect(
      await screen.findByText("Could not copy the asset into this project.")
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(currentAssetId()).toBe("old");
  });

  it("says when there is nothing to pick", () => {
    mockAssets = [];
    renderDialog();
    expect(screen.getByText("No videos yet")).toBeTruthy();
  });
});

describe("replacementContentType", () => {
  it("maps media clips to their content-type prefix", () => {
    expect(replacementContentType("image")).toBe("image/");
    expect(replacementContentType("audio")).toBe("audio/");
    expect(replacementContentType("model3d")).toBe("model/");
    expect(replacementContentType("text")).toBeUndefined();
  });
});
