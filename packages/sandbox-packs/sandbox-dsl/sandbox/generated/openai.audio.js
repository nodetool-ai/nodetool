// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToSpeech(inputs, options) {
  return createNode("openai.audio.TextToSpeech", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function translate(inputs, options) {
  return createNode("openai.audio.Translate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function transcribe(inputs, options) {
  return createNode("openai.audio.Transcribe", inputs, { id: options?.id, outputNames: ["text", "words", "segments"], outputTypes: { "text": "str", "words": "list[audio_chunk]", "segments": "list[audio_chunk]" } });
}
export {
  textToSpeech,
  transcribe,
  translate
};
