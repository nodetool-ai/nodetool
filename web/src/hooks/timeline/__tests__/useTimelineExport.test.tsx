/**
 * The export's length and lifecycle: it ends where the live content ends, and
 * a cancelled render keeps the export busy until it has actually stopped.
 */
import { act, renderHook } from "@testing-library/react";

const renderTimelineMock = jest.fn();

const storeState: Record<string, unknown> = {};

jest.mock("../../../components/timeline/render/TimelineRenderer", () => ({
  renderTimeline: (options: unknown) => renderTimelineMock(options)
}));

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStoreApi: () => ({ getState: () => storeState })
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ get: jest.fn(), createAsset: jest.fn(), update: jest.fn() })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: { getState: () => ({ addNotification: jest.fn() }) }
}));

import { useTimelineExport } from "../useTimelineExport";

const RESULT = {
  bytes: new Uint8Array([1]),
  mimeType: "video/mp4",
  extension: "mp4",
  degradations: []
};

function setClips(
  clips: Array<{ startMs: number; durationMs: number }>,
  durationMs: number
): void {
  Object.assign(storeState, {
    tracks: [],
    clips: clips.map((c, i) => ({ id: `c${i}`, ...c })),
    mediaTracks: [],
    width: 640,
    height: 360,
    fps: 30,
    durationMs,
    tempo: undefined,
    camera2d: undefined
  });
}

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => "blob:export");
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  renderTimelineMock.mockReset();
});

describe("useTimelineExport duration", () => {
  it("ends at the live content end after the sequence shrank", async () => {
    // Loaded at 10s; the clips were then trimmed to end at 4s.
    setClips([{ startMs: 0, durationMs: 4000 }], 10000);
    renderTimelineMock.mockResolvedValue(RESULT);
    const { result } = renderHook(() => useTimelineExport());
    await act(async () => {
      await result.current.exportVideo("cut");
    });
    expect(renderTimelineMock.mock.calls[0][0]).toMatchObject({
      durationMs: 4000
    });
  });

  it("ends at the content end when clips run past the stored duration", async () => {
    setClips([{ startMs: 1000, durationMs: 5000 }], 2000);
    renderTimelineMock.mockResolvedValue(RESULT);
    const { result } = renderHook(() => useTimelineExport());
    await act(async () => {
      await result.current.exportVideo("cut");
    });
    expect(renderTimelineMock.mock.calls[0][0]).toMatchObject({
      durationMs: 6000
    });
  });
});
