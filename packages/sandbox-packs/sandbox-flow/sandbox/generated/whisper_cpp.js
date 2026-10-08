// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function liveTranscription(inputs) {
  return callNode("whisper_cpp.LiveTranscription", inputs);
}
liveTranscription.stream = function(inputs) {
  return streamNode("whisper_cpp.LiveTranscription", inputs);
};
export {
  liveTranscription
};
