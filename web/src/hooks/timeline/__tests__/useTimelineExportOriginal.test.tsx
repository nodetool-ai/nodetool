/**
 * The browser export decodes each clip from the original file, never from
 * the all-intra preview proxy the live preview plays (F11).
 */
import { act, renderHook } from "@testing-library/react";

const renderTimelineMock = jest.fn();

jest.mock("../../../components/timeline/render/TimelineRenderer", () => ({
  renderTimeline: (options: unknown) => renderTimelineMock(options)
}));

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStoreApi: () => ({
    getState: () => ({
      tracks: [],
      clips: [{ id: "shot", startMs: 0, durationMs: 1000 }],
      mediaTracks: [],
      width: 1920,
      height: 1080,
      fps: 30,
      durationMs: 1000,
      tempo: undefined,
      camera2d: undefined
    })
  })
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      get: async (id: string) => ({
        id,
        content_type: "video/mp4",
        get_url: `/api/storage/user-1/${id}.mp4`,
        proxy_status: "ready",
        proxy_url: `/api/storage/user-1/${id}_proxy.mp4?v=abc`
      }),
      createAsset: jest.fn(),
      update: jest.fn()
    })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: { getState: () => ({ addNotification: jest.fn() }) }
}));

import { useTimelineExport } from "../useTimelineExport";

describe("useTimelineExport", () => {
  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => "blob:export");
    URL.revokeObjectURL = jest.fn();
  });

  it("resolves clip media to the original, not the preview proxy", async () => {
    const resolved: Array<string | undefined> = [];
    renderTimelineMock.mockImplementation(
      async (options: {
        resolveUrl: (id: string) => Promise<string | undefined>;
      }) => {
        resolved.push(await options.resolveUrl("asset-video"));
        return {
          bytes: new Uint8Array([1]),
          mimeType: "video/mp4",
          extension: "mp4",
          degradations: []
        };
      }
    );

    const { result } = renderHook(() => useTimelineExport());
    await act(async () => {
      await result.current.exportVideo("cut");
    });

    expect(result.current.error).toBeNull();
    expect(resolved).toEqual(["/api/storage/user-1/asset-video.mp4"]);
  });
});
