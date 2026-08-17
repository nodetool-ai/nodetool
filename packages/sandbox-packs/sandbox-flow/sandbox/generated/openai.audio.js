// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function textToSpeech(inputs) {
  return callNode("openai.audio.TextToSpeech", inputs);
}
function translate(inputs) {
  return callNode("openai.audio.Translate", inputs);
}
function transcribe(inputs) {
  return callNode("openai.audio.Transcribe", inputs);
}
export {
  textToSpeech,
  transcribe,
  translate
};
