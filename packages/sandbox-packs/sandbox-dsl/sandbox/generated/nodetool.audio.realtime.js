// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function audioToChunks(inputs) {
  return createNode("nodetool.audio.realtime.AudioToChunks", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streaming: true });
}
function audioOutput(inputs) {
  return createNode("nodetool.audio.realtime.AudioOutput", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
function chunksToAudio(inputs) {
  return createNode("nodetool.audio.realtime.ChunksToAudio", inputs, { outputNames: ["audio"], defaultOutput: "audio", streamingInput: true });
}
function streamingGain(inputs) {
  return createNode("nodetool.audio.realtime.StreamingGain", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
function streamingLowPass(inputs) {
  return createNode("nodetool.audio.realtime.StreamingLowPass", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
function streamingHighPass(inputs) {
  return createNode("nodetool.audio.realtime.StreamingHighPass", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streamingInput: true });
}
export {
  audioOutput,
  audioToChunks,
  chunksToAudio,
  streamingGain,
  streamingHighPass,
  streamingLowPass
};
