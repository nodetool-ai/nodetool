// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function streamingBitcrush(inputs) {
  return callNode("nodetool.audio.realtime.StreamingBitcrush", inputs);
}
streamingBitcrush.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingBitcrush", inputs);
};
function streamingCompress(inputs) {
  return callNode("nodetool.audio.realtime.StreamingCompress", inputs);
}
streamingCompress.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingCompress", inputs);
};
function streamingDistortion(inputs) {
  return callNode("nodetool.audio.realtime.StreamingDistortion", inputs);
}
streamingDistortion.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingDistortion", inputs);
};
function streamingLimiter(inputs) {
  return callNode("nodetool.audio.realtime.StreamingLimiter", inputs);
}
streamingLimiter.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingLimiter", inputs);
};
function streamingReverb(inputs) {
  return callNode("nodetool.audio.realtime.StreamingReverb", inputs);
}
streamingReverb.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingReverb", inputs);
};
function streamingNoiseGate(inputs) {
  return callNode("nodetool.audio.realtime.StreamingNoiseGate", inputs);
}
streamingNoiseGate.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingNoiseGate", inputs);
};
function streamingPhaser(inputs) {
  return callNode("nodetool.audio.realtime.StreamingPhaser", inputs);
}
streamingPhaser.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingPhaser", inputs);
};
function streamingDelay(inputs) {
  return callNode("nodetool.audio.realtime.StreamingDelay", inputs);
}
streamingDelay.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingDelay", inputs);
};
function streamingHighShelf(inputs) {
  return callNode("nodetool.audio.realtime.StreamingHighShelf", inputs);
}
streamingHighShelf.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingHighShelf", inputs);
};
function streamingLowShelf(inputs) {
  return callNode("nodetool.audio.realtime.StreamingLowShelf", inputs);
}
streamingLowShelf.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingLowShelf", inputs);
};
function streamingPeak(inputs) {
  return callNode("nodetool.audio.realtime.StreamingPeak", inputs);
}
streamingPeak.stream = function(inputs) {
  return streamNode("nodetool.audio.realtime.StreamingPeak", inputs);
};
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
