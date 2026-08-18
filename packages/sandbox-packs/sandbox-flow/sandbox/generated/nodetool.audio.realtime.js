// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function audioToChunks(inputs) {
  return callNode("nodetool.audio.realtime.AudioToChunks", inputs);
}
audioToChunks.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.AudioToChunks", inputs);
};
function audioOutput(inputs) {
  return callNode("nodetool.audio.realtime.AudioOutput", inputs);
}
audioOutput.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.AudioOutput", inputs);
};
function chunksToAudio(inputs) {
  return callNode("nodetool.audio.realtime.ChunksToAudio", inputs);
}
chunksToAudio.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.ChunksToAudio", inputs);
};
function streamingGain(inputs) {
  return callNode("nodetool.audio.realtime.StreamingGain", inputs);
}
streamingGain.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingGain", inputs);
};
function streamingLowPass(inputs) {
  return callNode("nodetool.audio.realtime.StreamingLowPass", inputs);
}
streamingLowPass.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingLowPass", inputs);
};
function streamingHighPass(inputs) {
  return callNode("nodetool.audio.realtime.StreamingHighPass", inputs);
}
streamingHighPass.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingHighPass", inputs);
};
export {
  audioOutput,
  audioToChunks,
  chunksToAudio,
  streamingGain,
  streamingHighPass,
  streamingLowPass
};
