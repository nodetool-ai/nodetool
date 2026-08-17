// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function loadScript(inputs) {
  return callNode("nodetool.script.LoadScript", inputs);
}
function voiceScript(inputs) {
  return callNode("nodetool.script.VoiceScript", inputs);
}
function scriptToTimeline(inputs) {
  return callNode("nodetool.script.ScriptToTimeline", inputs);
}
function scriptToSubtitles(inputs) {
  return callNode("nodetool.script.ScriptToSubtitles", inputs);
}
export {
  loadScript,
  scriptToSubtitles,
  scriptToTimeline,
  voiceScript
};
