// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToSpeech(inputs) {
  return createNode("openai.audio.TextToSpeech", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function translate(inputs) {
  return createNode("openai.audio.Translate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function transcribe(inputs) {
  return createNode("openai.audio.Transcribe", inputs, { outputNames: ["text", "words", "segments"] });
}
export {
  textToSpeech,
  transcribe,
  translate
};
