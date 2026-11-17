import type { CompileInput } from "../../src/Types.js";
import { audioFixture } from "./AudioGraph.js";

export const PCM_SOURCE_ID = "0123456789abcdef0123456789abcdef";
export const PCM_FIXTURE_HASH = "d219cc99561e1563a174feabe0738bb466845a432ac708e49edf15e4b43f7f2a";

export function pcmFixture(multiple = false): CompileInput {
  const input = audioFixture(); const descriptors = new Map(input.descriptors);
  descriptors.set("player", { kind: "dsp", kernel: "sample-player", stateVersion: 1, inputs: [], output: "audio", bufferInput: "clip",
    params: [{ property: "gain", default: 1 }] });
  descriptors.set("tap-out", { kind: "audio-output", input: "audio", sink: "tap" });
  descriptors.set("record-out", { kind: "audio-output", input: "audio", sink: "record" });
  return { ...input, descriptors, outputs: multiple ? ["out-source", "out-b", "out-a"] : ["out-a"],
    graph: { nodes: [
      { id: PCM_SOURCE_ID, type: "batch-audio" }, { id: "player", type: "player" }, { id: "gain-a", type: "gain" }, { id: "out-a", type: "audio-out" },
      ...(multiple ? [{ id: "gain-b", type: "gain", properties: { gain: 0.25 } }, { id: "out-b", type: "record-out" }, { id: "out-source", type: "tap-out" }] : [])
    ], edges: [
      { source: PCM_SOURCE_ID, sourceHandle: "audio", target: "player", targetHandle: "clip" },
      { source: "player", sourceHandle: "audio", target: "gain-a", targetHandle: "source" },
      { source: "gain-a", sourceHandle: "audio", target: "out-a", targetHandle: "audio" },
      ...(multiple ? [
        { source: "player", sourceHandle: "audio", target: "gain-b", targetHandle: "source" },
        { source: "gain-b", sourceHandle: "audio", target: "out-b", targetHandle: "audio" },
        { source: "player", sourceHandle: "audio", target: "out-source", targetHandle: "audio" }
      ] : [])
    ] }, batchPcm: [{ node: PCM_SOURCE_ID, output: "audio", sampleRate: 48000, channels: "stereo", frames: 193, contentHash: PCM_FIXTURE_HASH }] };
}
