// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function textToSpeech(inputs) {
  return callNode("gemini.audio.TextToSpeech", inputs);
}
function transcribe(inputs) {
  return callNode("gemini.audio.Transcribe", inputs);
}
export {
  textToSpeech,
  transcribe
};
