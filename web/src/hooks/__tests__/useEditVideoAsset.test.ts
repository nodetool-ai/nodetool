import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

import { trpcClient } from "../../__mocks__/trpcClientMock";
import { useEditVideoAsset } from "../useEditVideoAsset";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { Asset } from "../../stores/ApiTypes";

const navigateMock = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock
}));

const createMutate = trpcClient.timeline.create.mutate as unknown as jest.Mock;
const updateMutate = trpcClient.timeline.update.mutate as unknown as jest.Mock;

const videoAsset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: "v1",
    user_id: "u1",
    parent_id: null,
    name: "render.mp4",
    content_type: "video/mp4",
    created_at: "2026-01-01T00:00:00Z",
    workflow_id: null,
    get_url: "http://example/v1.mp4",
    thumb_url: null,
    duration: 3,
    ...overrides
  }) as Asset;

let addNotification: jest.Mock;

describe("useEditVideoAsset", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    createMutate
      .mockReset()
      .mockResolvedValue({ id: "mock-seq", name: "mock" } as never);
    updateMutate.mockReset().mockResolvedValue({ ok: true } as never);
    useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null });
    addNotification = jest.fn();
    useNotificationStore.setState({ addNotification });
  });

  it("opens the source timeline when the video is already linked", async () => {
    const { result } = renderHook(() => useEditVideoAsset());

    await act(async () => {
      await result.current(videoAsset({ id: "v1", timeline_id: "seq-123" }));
    });

    // No new timeline is created — we reopen the existing sequence.
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
    expect(useWorkspaceTabsStore.getState().tabs).toContainEqual(
      expect.objectContaining({ type: "timeline", ref: "seq-123", mode: "edit" })
    );
    expect(navigateMock).toHaveBeenCalledWith("/workspace");
    expect(addNotification).not.toHaveBeenCalled();
  });

  it("wraps an unlinked video in a fresh timeline and opens it", async () => {
    createMutate.mockResolvedValueOnce({
      id: "seq-new",
      name: "render.mp4"
    } as never);

    const { result } = renderHook(() => useEditVideoAsset());

    await act(async () => {
      await result.current(videoAsset({ id: "v2", name: "render.mp4" }));
    });

    // The id is minted client-side at creation, so assert its shape (a
    // dash-stripped uuid, matching the server's own format) rather than a value.
    expect(createMutate).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f]{32}$/),
      name: "render.mp4",
      projectId: "default"
    });

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const arg = updateMutate.mock.calls[0][0] as {
      id: string;
      document: {
        tracks: Array<{ id: string; type: string }>;
        clips: Array<{ trackId: string; mediaType: string; currentAssetId?: string }>;
        markers: unknown[];
      };
    };
    expect(arg.id).toBe("seq-new");
    expect(arg.document.tracks).toHaveLength(1);
    expect(arg.document.tracks[0].type).toBe("video");
    expect(arg.document.clips).toHaveLength(1);
    // The clip references the video and sits on the created track.
    expect(arg.document.clips[0].currentAssetId).toBe("v2");
    expect(arg.document.clips[0].mediaType).toBe("video");
    expect(arg.document.clips[0].trackId).toBe(arg.document.tracks[0].id);

    expect(useWorkspaceTabsStore.getState().tabs).toContainEqual(
      expect.objectContaining({ type: "timeline", ref: "seq-new", mode: "edit" })
    );
    expect(navigateMock).toHaveBeenCalledWith("/workspace");
  });

  it("notifies and opens nothing when timeline creation fails", async () => {
    createMutate.mockRejectedValueOnce(new Error("boom") as never);

    const { result } = renderHook(() => useEditVideoAsset());

    await act(async () => {
      await result.current(videoAsset({ id: "v3" }));
    });

    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
    expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
