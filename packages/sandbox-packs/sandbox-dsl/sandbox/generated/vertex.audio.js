// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToSpeech(inputs, options) {
  return createNode("vertex.audio.TextToSpeech", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function transcribe(inputs, options) {
  return createNode("vertex.audio.Transcribe", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
export {
  textToSpeech,
  transcribe
};
