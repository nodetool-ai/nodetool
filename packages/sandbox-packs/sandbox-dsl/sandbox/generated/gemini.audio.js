// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToSpeech(inputs) {
  return createNode("gemini.audio.TextToSpeech", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function transcribe(inputs) {
  return createNode("gemini.audio.Transcribe", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  textToSpeech,
  transcribe
};
