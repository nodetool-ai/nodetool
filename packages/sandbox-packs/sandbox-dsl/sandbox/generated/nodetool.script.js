// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadScript(inputs, options) {
  return createNode("nodetool.script.LoadScript", inputs, { id: options?.id, outputNames: ["text", "lines", "name", "line_count"], outputTypes: { "text": "str", "lines": "list[str]", "name": "str", "line_count": "int" } });
}
function voiceScript(inputs, options) {
  return createNode("nodetool.script.VoiceScript", inputs, { id: options?.id, outputNames: ["output", "voiced_count"], outputTypes: { "output": "script", "voiced_count": "int" } });
}
function scriptToTimeline(inputs, options) {
  return createNode("nodetool.script.ScriptToTimeline", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "timeline" }, defaultOutput: "output" });
}
function scriptToSubtitles(inputs, options) {
  return createNode("nodetool.script.ScriptToSubtitles", inputs, { id: options?.id, outputNames: ["subtitles", "cue_count"], outputTypes: { "subtitles": "str", "cue_count": "int" } });
}
function writeScript(inputs, options) {
  return createNode("nodetool.script.WriteScript", inputs, { id: options?.id, outputNames: ["script", "line_count"], outputTypes: { "script": "script", "line_count": "int" } });
}
function fillScript(inputs, options) {
  return createNode("nodetool.script.FillScript", inputs, { id: options?.id, outputNames: ["script", "filled", "unresolved"], outputTypes: { "script": "script", "filled": "list[str]", "unresolved": "list[str]" } });
}
export {
  fillScript,
  loadScript,
  scriptToSubtitles,
  scriptToTimeline,
  voiceScript,
  writeScript
};
