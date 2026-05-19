import { AudioGraph } from "../AudioGraph";

describe("AudioGraph Performance", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads multiple buffers in parallel during scheduleClips", async () => {
    const graph = new AudioGraph();

    // Mock the AudioContext and context-dependent methods for testing
    const mockAudioContext = {
      currentTime: 0,
      createGain: jest.fn().mockReturnValue({ connect: jest.fn(), gain: { value: 1, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), setTargetAtTime: jest.fn() } }),
      createBufferSource: jest.fn().mockReturnValue({ connect: jest.fn(), start: jest.fn(), stop: jest.fn(), playbackRate: { value: 1 } }),
      destination: {},
      decodeAudioData: jest.fn().mockImplementation((ab) => Promise.resolve({ length: ab.byteLength }))
    };

    jest.spyOn(graph, "getContext").mockReturnValue(mockAudioContext as any);

    // Mock global fetch
    const fetchDelays = [500, 500, 500]; // 3 buffers, 500ms fetch each
    let fetchIndex = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      const delay = fetchDelays[fetchIndex++] || 500;
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
          });
        }, delay);
      });
    });

    const clips = [
      { clip: { id: "1", currentAssetId: "asset1", trackId: "track1", startMs: 0, durationMs: 1000 }, assetUrl: "url1" },
      { clip: { id: "2", currentAssetId: "asset2", trackId: "track1", startMs: 1000, durationMs: 1000 }, assetUrl: "url2" },
      { clip: { id: "3", currentAssetId: "asset3", trackId: "track1", startMs: 2000, durationMs: 1000 }, assetUrl: "url3" },
    ];

    const startTime = Date.now();
    await graph.scheduleClips(clips as any, [], 0);
    const endTime = Date.now();

    const duration = endTime - startTime;
    console.log(`Scheduling took ${duration}ms`);

    // If sequential, duration would be ~1500ms
    // If parallel, duration should be ~500ms
    expect(duration).toBeLessThan(1000); // Expect it to be loaded in parallel
  });
});
