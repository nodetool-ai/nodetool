/**
 * Browser-eligibility guard for the audio nodes.
 *
 * The in-browser workflow runner routes a sub-graph client-side only when
 * every node type is in a registry built with `createBrowserRegistry`, which
 * keeps a class iff `supportsPlatform(cls.platforms, "browser")`. The pure
 * sample-math groups are tagged `tagAsHybrid` (`["node","browser"]`); file
 * I/O, TTS, and the rubberband nodes stay server-only. This test pins that
 * contract in both directions: a server-only retag would silently drop the
 * hybrid nodes back to the server, and a hybrid retag of a node-only node
 * would crash in the browser.
 */
import { describe, it, expect } from "vitest";
import { supportsPlatform, type Platform } from "@nodetool-ai/protocol";
import {
  AUDIO_NODES,
  LIB_AUDIO_DSP_NODES,
  LIB_AUDIO_EFFECTS_HYBRID_NODES,
  LIB_AUDIO_EFFECTS_SERVER_NODES,
  REALTIME_AUDIO_NODES,
  AudioToChunksNode,
  ChunksToAudioNode,
  StreamingGainNode,
  StreamingLowPassNode,
  StreamingHighPassNode
} from "@nodetool-ai/audio-nodes";

type NodeClassLike = {
  nodeType?: string;
  platforms?: readonly Platform[];
  isStreamingInput?: boolean;
};

const HYBRID_GROUPS: Record<string, readonly unknown[]> = {
  "lib.audio (dsp)": LIB_AUDIO_DSP_NODES,
  "lib.audio (effects)": LIB_AUDIO_EFFECTS_HYBRID_NODES,
  "nodetool.audio.realtime": REALTIME_AUDIO_NODES
};

const HYBRID_AUDIO_TYPES = [
  "nodetool.audio.Normalize",
  "nodetool.audio.OverlayAudio",
  "nodetool.audio.RemoveSilence",
  "nodetool.audio.SliceAudio",
  "nodetool.audio.MonoToStereo",
  "nodetool.audio.StereoToMono",
  "nodetool.audio.Reverse",
  "nodetool.audio.FadeIn",
  "nodetool.audio.FadeOut",
  "nodetool.audio.Repeat",
  "nodetool.audio.AudioMixer",
  "nodetool.audio.Trim",
  "nodetool.audio.CreateSilence",
  "nodetool.audio.Concat",
  "nodetool.audio.ConcatList",
  "nodetool.audio.ChunkToAudio",
  "nodetool.audio.GetAudioInfo"
];

const SERVER_ONLY_TYPES = [
  "lib.audio.PitchShift",
  "lib.audio.TimeStretch",
  "nodetool.audio.LoadAudioAssets",
  "nodetool.audio.LoadAudioFile",
  "nodetool.audio.LoadAudioFolder",
  "nodetool.audio.SaveAudio",
  "nodetool.audio.SaveAudioFile",
  "nodetool.audio.TextToSpeech"
];

function byType(nodes: readonly unknown[]): Map<string, NodeClassLike> {
  const map = new Map<string, NodeClassLike>();
  for (const cls of nodes as NodeClassLike[]) {
    if (cls.nodeType) map.set(cls.nodeType, cls);
  }
  return map;
}

describe("hybrid audio nodes declare browser platform support", () => {
  for (const [group, nodes] of Object.entries(HYBRID_GROUPS)) {
    it(`${group} nodes are all browser-capable`, () => {
      expect(nodes.length).toBeGreaterThan(0);
      for (const cls of nodes as NodeClassLike[]) {
        expect(
          supportsPlatform(cls.platforms, "browser"),
          `${cls.nodeType} must support the browser platform`
        ).toBe(true);
      }
    });
  }

  it("the pure transforms in AUDIO_NODES are browser-capable", () => {
    const all = byType(AUDIO_NODES);
    for (const nodeType of HYBRID_AUDIO_TYPES) {
      const cls = all.get(nodeType);
      expect(cls, `${nodeType} must be registered`).toBeDefined();
      expect(
        supportsPlatform(cls?.platforms, "browser"),
        `${nodeType} must support the browser platform`
      ).toBe(true);
    }
  });
});

describe("server-only audio nodes do NOT declare browser support", () => {
  it("file I/O, TTS and rubberband nodes stay off the browser", () => {
    const all = byType([
      ...AUDIO_NODES,
      ...LIB_AUDIO_EFFECTS_SERVER_NODES
    ]);
    for (const nodeType of SERVER_ONLY_TYPES) {
      const cls = all.get(nodeType);
      expect(cls, `${nodeType} must be registered`).toBeDefined();
      expect(
        supportsPlatform(cls?.platforms, "browser"),
        `${nodeType} must NOT support the browser platform`
      ).toBe(false);
    }
  });
});

describe("realtime audio node streaming flags", () => {
  it("streaming-input nodes declare isStreamingInput", () => {
    expect(ChunksToAudioNode.isStreamingInput).toBe(true);
    expect(StreamingGainNode.isStreamingInput).toBe(true);
    expect(StreamingLowPassNode.isStreamingInput).toBe(true);
    expect(StreamingHighPassNode.isStreamingInput).toBe(true);
  });

  it("AudioToChunks streams output via a genProcess override", () => {
    expect(typeof AudioToChunksNode.prototype.genProcess).toBe("function");
    expect(AudioToChunksNode.isStreamingInput).not.toBe(true);
  });
});
