// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadScript(inputs) {
  return createNode("nodetool.script.LoadScript", inputs, { outputNames: ["text", "lines", "name", "line_count"] });
}
function voiceScript(inputs) {
  return createNode("nodetool.script.VoiceScript", inputs, { outputNames: ["output", "voiced_count"] });
}
function scriptToTimeline(inputs) {
  return createNode("nodetool.script.ScriptToTimeline", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function scriptToSubtitles(inputs) {
  return createNode("nodetool.script.ScriptToSubtitles", inputs, { outputNames: ["subtitles", "cue_count"] });
}
export {
  loadScript,
  scriptToSubtitles,
  scriptToTimeline,
  voiceScript
};
