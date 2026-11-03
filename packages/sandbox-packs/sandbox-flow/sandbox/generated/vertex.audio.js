// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function textToSpeech(inputs) {
  return callNode("vertex.audio.TextToSpeech", inputs);
}
function transcribe(inputs) {
  return callNode("vertex.audio.Transcribe", inputs);
}
export {
  textToSpeech,
  transcribe
};
