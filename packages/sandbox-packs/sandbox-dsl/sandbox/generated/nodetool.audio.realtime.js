// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
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
  streamingGain,
  streamingHighPass,
  streamingLowPass
};
