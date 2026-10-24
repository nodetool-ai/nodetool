import { act, renderHook } from "@testing-library/react";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import { useScriptPlaythrough } from "../useScriptPlaythrough";

jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: {
    getState: () => ({ get: async (id: string) => ({ id }) })
  }
}));
jest.mock("../../../utils/assetHelpers", () => ({
  getAssetUrl: (asset: { id: string }) => `https://assets/${asset.id}`
}));

const created: FakeAudio[] = [];

class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src: string;
  readonly url: string;
  constructor(src: string) {
    this.src = src;
    this.url = src;
    created.push(this);
  }
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
}

const voicedLine = (id: string, pauseAfterMs?: number) => ({
  id,
  text: id,
  pauseAfterMs,
  takes: [
    {
      id: `take-${id}`,
      assetId: id,
      durationMs: 1000,
      words: [],
      textSnapshot: id,
      voiceSnapshot: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  currentTakeId: `take-${id}`
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe("useScriptPlaythrough", () => {
  const originalAudio = global.Audio;

  beforeEach(() => {
    jest.useFakeTimers();
    created.length = 0;
    (global as unknown as { Audio: unknown }).Audio = FakeAudio;
    useScriptStore.setState({ scripts: {}, history: {} });
    useScriptStore.getState().loadScript("script-1", {
      title: "",
      cast: [],
      sections: [{ id: "s", lines: [voicedLine("a", 1000), voicedLine("b")] }],
      timelineId: null,
      storyboardId: null
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.Audio = originalAudio;
  });

  it("does not resume a stopped run when playback restarts during a pause", async () => {
    const { result } = renderHook(() => useScriptPlaythrough("script-1"));
    await act(async () => {
      result.current.play();
      await flush();
    });
    await act(async () => {
      // Line a ends; the run now waits out its 1 s pause.
      created[0].onended?.();
      await flush();
    });
    await act(async () => {
      result.current.stop();
      result.current.play();
      await flush();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await flush();
    });

    // Only the new run plays: it is on line a, and nothing started line b.
    expect(created.map((audio) => audio.url)).toEqual([
      "https://assets/a",
      "https://assets/a"
    ]);
    expect(result.current.currentLineId).toBe("a");
  });
});
