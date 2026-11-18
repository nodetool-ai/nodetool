// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function streamingBitcrush(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingBitcrush", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingCompress(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingCompress", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingDistortion(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingDistortion", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingLimiter(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingLimiter", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingReverb(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingReverb", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingNoiseGate(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingNoiseGate", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingPhaser(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingPhaser", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingDelay(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingDelay", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingHighShelf(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingHighShelf", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingLowShelf(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingLowShelf", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingPeak(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingPeak", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function audioToChunks(inputs, options) {
  return createNode("nodetool.audio.realtime.AudioToChunks", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streaming: true, outputCorrelation: { "chunk": { "kind": "iteration", "source": "__execution__", "group": "stream" } } });
}
function audioOutput(inputs, options) {
  return createNode("nodetool.audio.realtime.AudioOutput", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function chunksToAudio(inputs, options) {
  return createNode("nodetool.audio.realtime.ChunksToAudio", inputs, { id: options?.id, outputNames: ["audio"], outputTypes: { "audio": "audio" }, defaultOutput: "audio", streamingInput: true });
}
function streamingGain(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingGain", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingLowPass(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingLowPass", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
function streamingHighPass(inputs, options) {
  return createNode("nodetool.audio.realtime.StreamingHighPass", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streamingInput: true });
}
export {
  audioOutput,
  audioToChunks,
  chunksToAudio,
  streamingBitcrush,
  streamingCompress,
  streamingDelay,
  streamingDistortion,
  streamingGain,
  streamingHighPass,
  streamingHighShelf,
  streamingLimiter,
  streamingLowPass,
  streamingLowShelf,
  streamingNoiseGate,
  streamingPeak,
  streamingPhaser,
  streamingReverb
};
