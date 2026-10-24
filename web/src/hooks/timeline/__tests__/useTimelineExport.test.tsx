/**
 * The export's length and lifecycle: it ends where the live content ends, and
 * a cancelled render keeps the export busy until it has actually stopped.
 */
import { act, renderHook } from "@testing-library/react";

const renderTimelineMock = jest.fn();
const renderTimelineMp3Mock = jest.fn();
const addNotificationMock = jest.fn();

const storeState: Record<string, unknown> = {};

jest.mock("../../../components/timeline/render/TimelineRenderer", () => ({
  renderTimeline: (options: unknown) => renderTimelineMock(options)
}));

jest.mock("../../../components/timeline/render/encodeAudio", () => ({
  renderTimelineMp3: (options: unknown) => renderTimelineMp3Mock(options)
}));

jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStoreApi: () => ({ getState: () => storeState })
}));

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ get: jest.fn(), createAsset: jest.fn(), update: jest.fn() })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: {
    getState: () => ({ addNotification: addNotificationMock })
  }
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
  renderTimelineMp3Mock.mockReset();
  addNotificationMock.mockReset();
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

describe("useTimelineExport success message", () => {
  it("names the downloaded file when the export finishes", async () => {
    setClips([{ startMs: 0, durationMs: 4000 }], 4000);
    renderTimelineMock.mockResolvedValue(RESULT);
    const { result } = renderHook(() => useTimelineExport());
    await act(async () => {
      await result.current.exportVideo("Aurora Promo (Studio)");
    });
    expect(addNotificationMock).toHaveBeenCalledWith({
      type: "success",
      content: "Exported Aurora_Promo_Studio.mp4."
    });
  });

  it("stays silent when the export fails", async () => {
    setClips([{ startMs: 0, durationMs: 4000 }], 4000);
    renderTimelineMock.mockRejectedValue(new Error("codec"));
    const { result } = renderHook(() => useTimelineExport());
    await act(async () => {
      await result.current.exportVideo("cut");
    });
    expect(addNotificationMock).not.toHaveBeenCalled();
  });
});

describe("useTimelineExport MP3", () => {
  it("mixes the audio alone and saves an .mp3, without rendering frames", async () => {
    setClips([{ startMs: 0, durationMs: 4000 }], 10000);
    renderTimelineMp3Mock.mockResolvedValue({
      bytes: new Uint8Array([0xff, 0xfb]),
      mimeType: "audio/mpeg",
      extension: "mp3"
    });
    const { result } = renderHook(() => useTimelineExport());
    await act(async () => {
      await result.current.exportVideo("Theme", { format: "mp3" });
    });
    expect(renderTimelineMock).not.toHaveBeenCalled();
    expect(renderTimelineMp3Mock.mock.calls[0][0]).toMatchObject({
      durationMs: 4000
    });
    expect(addNotificationMock).toHaveBeenCalledWith({
      type: "success",
      content: "Exported Theme.mp3."
    });
    expect(result.current.isExporting).toBe(false);
  });
});
