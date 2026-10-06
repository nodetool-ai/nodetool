// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function liveTranscription(inputs, options) {
  return createNode("whisper_cpp.LiveTranscription", inputs, { id: options?.id, outputNames: ["chunk", "text"], outputTypes: { "chunk": "chunk", "text": "str" }, streaming: true, streamingInput: true, outputCorrelation: { "chunk": { "kind": "iteration", "source": "__execution__", "group": "stream" }, "text": { "kind": "single", "source": "__execution__" } } });
}
export {
  liveTranscription
};
