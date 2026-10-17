/**
 * The browser export renders the mixer: a track's fader and pan, and the
 * master channel's inserts and fader, sit between every clip and the offline
 * context's destination, as they do in the preview.
 */
import type {
  TimelineClip,
  TimelineMasterChannel,
  TimelineTrack
} from "@nodetool-ai/timeline";
import { dbToGain } from "../../preview/AudioGraph";
import { renderTimelineAudio } from "../renderAudio";

function mockParam(value = 1) {
  return {
    value,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    setTargetAtTime: jest.fn(),
    cancelScheduledValues: jest.fn(),
    cancelAndHoldAtTime: jest.fn()
  };
}

type Param = ReturnType<typeof mockParam>;

interface FakeNode {
  kind: string;
  targets: unknown[];
  connect: (next: unknown) => unknown;
  disconnect: () => void;
  [key: string]: unknown;
}

let lastContext: MockOfflineAudioContext | null = null;

class MockOfflineAudioContext {
  currentTime = 0;
  nodes: FakeNode[] = [];
  destination: FakeNode;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number
  ) {
    this.destination = this.node("destination");
    lastContext = this;
  }

  private node(kind: string, extra: Record<string, unknown> = {}): FakeNode {
    const node: FakeNode = {
      kind,
      targets: [],
      connect(next: unknown) {
        node.targets.push(next);
        return next;
      },
      disconnect() {
        node.targets = [];
      },
      ...extra
    };
    this.nodes.push(node);
    return node;
  }

  createGain() {
    return this.node("gain", { gain: mockParam() });
  }
  createStereoPanner() {
    return this.node("panner", { pan: mockParam(0) });
  }
  createAnalyser() {
    return this.node("analyser", { fftSize: 0 });
  }
  createBufferSource() {
    return this.node("source", {
      buffer: null,
      playbackRate: { value: 1 },
      onended: null,
      start: jest.fn(),
      stop: jest.fn()
    });
  }
  createBuffer(_channels: number, length: number) {
    return { length, getChannelData: () => new Float32Array(length) };
  }
  decodeAudioData() {
    return Promise.resolve({
      length: this.sampleRate,
      duration: 1,
      sampleRate: this.sampleRate,
      numberOfChannels: 1
    });
  }
  startRendering() {
    return Promise.resolve({ length: this.length } as AudioBuffer);
  }
}

/** Every node on some path from `from` to the destination. */
function pathNodes(from: FakeNode, to: FakeNode): Set<FakeNode> {
  const onPath = new Set<FakeNode>();
  const visit = (node: FakeNode, seen: Set<FakeNode>): boolean => {
    if (node === to) return true;
    if (seen.has(node)) return false;
    seen.add(node);
    let reaches = false;
    for (const next of node.targets as FakeNode[]) {
      if (visit(next, seen)) reaches = true;
    }
    if (reaches) onPath.add(node);
    return reaches;
  };
  visit(from, new Set());
  return onPath;
}

const track: TimelineTrack = {
  id: "t-audio",
  name: "Vox",
  type: "audio",
  index: 0,
  visible: true,
  locked: false,
  volumeDb: -6,
  pan: 0.3
};

const clip: TimelineClip = {
  id: "a1",
  trackId: "t-audio",
  name: "Take",
  startMs: 0,
  durationMs: 1000,
  mediaType: "audio",
  sourceType: "imported",
  status: "generated",
  currentAssetId: "asset-1",
  locked: false,
  versions: []
};

const master: TimelineMasterChannel = {
  volumeDb: -4,
  effects: [{ id: "trim", type: "gain", enabled: true, gainDb: -2 }]
};

describe("renderTimelineAudio — mixer", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    lastContext = null;
    (
      globalThis as unknown as { OfflineAudioContext: unknown }
    ).OfflineAudioContext = MockOfflineAudioContext;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function render(withMaster?: TimelineMasterChannel) {
    await renderTimelineAudio({
      clips: [clip],
      tracks: [track],
      master: withMaster,
      durationMs: 1000,
      resolveUrl: async (id) => `https://example.test/${id}`
    });
    const ctx = lastContext!;
    const source = ctx.nodes.find((n) => n.kind === "source")!;
    return { ctx, path: pathNodes(source, ctx.destination) };
  }

  it("routes a clip through its track's fader and panner", async () => {
    const { path } = await render();
    const panner = [...path].find((n) => n.kind === "panner");
    expect(panner).toBeDefined();
    expect((panner!.pan as Param).setTargetAtTime).toHaveBeenCalledWith(
      0.3,
      0,
      0.01
    );
    const faders = [...path].filter(
      (n) =>
        n.kind === "gain" &&
        (n.gain as Param).setTargetAtTime.mock.calls.some(
          ([value]) => Math.abs((value as number) - dbToGain(-6)) < 1e-9
        )
    );
    expect(faders).toHaveLength(1);
  });

  it("renders the master inserts and the master fader after the mix bus", async () => {
    const { path } = await render(master);
    const gains = [...path].filter((n) => n.kind === "gain");
    const masterFader = gains.find(
      (n) => Math.abs((n.gain as Param).value - dbToGain(-4)) < 1e-9
    );
    const trim = gains.find(
      (n) => Math.abs((n.gain as Param).value - dbToGain(-2)) < 1e-9
    );
    expect(masterFader).toBeDefined();
    expect(trim).toBeDefined();
    expect(trim!.targets).toContain(masterFader);
  });

  it("leaves the master at unity when the document has none", async () => {
    const { path } = await render(undefined);
    const gains = [...path].filter((n) => n.kind === "gain");
    expect(gains.every((n) => (n.gain as Param).value === 1)).toBe(true);
  });
});
