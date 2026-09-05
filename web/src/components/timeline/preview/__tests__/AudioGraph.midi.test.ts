/**
 * A buffer-backed clip goes through the graph exactly like a decoded one.
 *
 * The point of handing `AudioGraph` a rendered buffer rather than teaching it
 * about notes is that everything downstream — clip gain, fades, the track
 * chain, mute/solo — stays one code path. These cases pin that: nothing is
 * fetched, the clip is scheduled at its own start, and a midi track joins the
 * solo group the audio tracks are in.
 */
import { AudioGraph } from "../AudioGraph";

interface StartedSource {
  buffer: unknown;
  when: number;
  offset: number;
  duration: number;
}

function mockContext(started: StartedSource[]) {
  const gainNodes: Array<{ gain: { setTargetAtTime: jest.Mock } }> = [];
  const gain = () => {
    const node = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      gain: {
        value: 1,
        setValueAtTime: jest.fn(),
        linearRampToValueAtTime: jest.fn(),
        setTargetAtTime: jest.fn()
      }
    };
    gainNodes.push(node);
    return node;
  };
  return {
    gainNodes,
    currentTime: 0,
    createGain: jest.fn(gain),
    createBufferSource: jest.fn(() => {
      const src = {
        buffer: null as unknown,
        playbackRate: { value: 1 },
        connect: jest.fn(),
        stop: jest.fn(),
        disconnect: jest.fn(),
        start: jest.fn((when: number, offset: number, duration: number) => {
          started.push({ buffer: src.buffer, when, offset, duration });
        })
      };
      return src;
    }),
    destination: {},
    decodeAudioData: jest.fn()
  };
}

const midiClip = {
  id: "m1",
  trackId: "t-midi",
  name: "Riff",
  startMs: 1000,
  durationMs: 2000,
  mediaType: "midi",
  notes: [
    { id: "n1", pitch: 60, velocity: 100, startTick: 0, durationTick: 480 }
  ]
};

const midiTrack = {
  id: "t-midi",
  name: "Bass",
  type: "midi",
  index: 0,
  visible: true,
  locked: false
};

describe("AudioGraph — buffer-backed clips", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("schedules the given buffer without loading anything", async () => {
    const started: StartedSource[] = [];
    // The context is injected, not spied: `updateTracks` (and so the solo rule)
    // only runs once the graph actually holds one.
    const graph = new AudioGraph(mockContext(started) as never);
    const loadBuffer = jest.spyOn(graph, "loadBuffer");
    const buffer = { length: 96_000 };

    await graph.scheduleClips(
      [{ clip: midiClip, buffer }] as never,
      [midiTrack] as never,
      0
    );

    expect(loadBuffer).not.toHaveBeenCalled();
    expect(started).toEqual([
      // 1s of lead, from the head of the rendered window, for its whole 2000ms.
      { buffer, when: 1, offset: 0, duration: 2 }
    ]);
  });

  it("silences a midi track when an audio track is soloed", async () => {
    const started: StartedSource[] = [];
    const ctx = mockContext(started);
    const graph = new AudioGraph(ctx as never);

    await graph.scheduleClips(
      [{ clip: midiClip, buffer: { length: 96_000 } }] as never,
      [
        midiTrack,
        { id: "t-audio", name: "VO", type: "audio", index: 1, solo: true }
      ] as never,
      0
    );

    // The midi track's chain gain is the one ramped to 0 by the solo rule.
    const ramped = ctx.gainNodes
      .flatMap((n) => n.gain.setTargetAtTime.mock.calls)
      .map((call) => call[0]);
    expect(ramped).toContain(0);
  });

  it("stopClips releases only the clips it names", async () => {
    const started: StartedSource[] = [];
    const graph = new AudioGraph(mockContext(started) as never);

    await graph.scheduleClips(
      [
        { clip: midiClip, buffer: { length: 96_000 } },
        {
          clip: { ...midiClip, id: "m2", startMs: 4000 },
          buffer: { length: 96_000 }
        }
      ] as never,
      [midiTrack] as never,
      0
    );
    expect(started).toHaveLength(2);

    graph.stopClips(["m1"]);
    // Re-adding m1 schedules a third source; m2 was never disturbed.
    await graph.addClips(
      [{ clip: midiClip, buffer: { length: 96_000 } }] as never,
      [midiTrack] as never,
      0
    );
    expect(started).toHaveLength(3);
  });
});
