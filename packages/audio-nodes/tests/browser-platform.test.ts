/**
 * Browser-eligibility guard for the audio nodes.
 *
 * The in-browser workflow runner routes a sub-graph client-side only when
 * every node type is in a registry built with `createBrowserRegistry`, which
 * keeps a class iff `supportsPlatform(cls.platforms, "browser")`.
 *
 * Contract: only the realtime/synthesis streaming nodes run in the browser.
 * Everything that decodes audio to PCM (the effects, DSP filters, and the
 * sample/byte transforms) is server-only — decoding compressed input needs
 * Node's `node-web-audio-api`, and stored `/api/storage/<key>` refs resolve
 * reliably only against the server's storage. This test pins that in both
 * directions: a browser retag of a decode node would crash in the browser, and
 * a server retag of a streaming node would silently drop it back to the server.
 */
import { describe, it, expect } from "vitest";
import { supportsPlatform, type Platform } from "@nodetool-ai/protocol";
import {
  AUDIO_NODES,
  LIB_AUDIO_DSP_NODES,
  LIB_AUDIO_EFFECTS_NODES,
  REALTIME_AUDIO_NODES,
  SYNTHESIS_NODES,
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

/** Streaming nodes are the only audio nodes that run in the browser. */
const BROWSER_GROUPS: Record<string, readonly unknown[]> = {
  "nodetool.audio.realtime": REALTIME_AUDIO_NODES,
  "nodetool.audio.synth": SYNTHESIS_NODES
};

/** Everything that decodes audio to PCM is server-only. */
const SERVER_GROUPS: Record<string, readonly unknown[]> = {
  "lib.audio (dsp)": LIB_AUDIO_DSP_NODES,
  "lib.audio (effects)": LIB_AUDIO_EFFECTS_NODES
};

const SERVER_ONLY_AUDIO_TYPES = [
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
  "nodetool.audio.GetAudioInfo",
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

describe("streaming audio nodes declare browser platform support", () => {
  for (const [group, nodes] of Object.entries(BROWSER_GROUPS)) {
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
});

describe("decode-to-PCM audio nodes are server-only", () => {
  for (const [group, nodes] of Object.entries(SERVER_GROUPS)) {
    it(`${group} nodes do NOT declare browser support`, () => {
      expect(nodes.length).toBeGreaterThan(0);
      for (const cls of nodes as NodeClassLike[]) {
        expect(
          supportsPlatform(cls.platforms, "browser"),
          `${cls.nodeType} must NOT support the browser platform`
        ).toBe(false);
      }
    });
  }

  it("the AUDIO_NODES transforms and file/TTS nodes stay off the browser", () => {
    const all = byType(AUDIO_NODES);
    for (const nodeType of SERVER_ONLY_AUDIO_TYPES) {
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

  it("every synthesis node is streaming-input (generators included)", () => {
    expect(SYNTHESIS_NODES.length).toBe(9);
    for (const cls of SYNTHESIS_NODES as Array<
      NodeClassLike & { isStreamingInput?: boolean }
    >) {
      expect(
        cls.isStreamingInput,
        `${cls.nodeType} must declare isStreamingInput`
      ).toBe(true);
    }
  });
});
