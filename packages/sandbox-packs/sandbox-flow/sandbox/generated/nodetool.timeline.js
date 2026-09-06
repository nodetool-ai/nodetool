// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function renderTimeline(inputs) {
  return callNode("nodetool.timeline.RenderTimeline", inputs);
}
function transcript(inputs) {
  return callNode("nodetool.timeline.Transcript", inputs);
}
function addClips(inputs) {
  return callNode("nodetool.timeline.AddClips", inputs);
}
function fillTimelineText(inputs) {
  return callNode("nodetool.timeline.FillTimelineText", inputs);
}
function retargetTimeline(inputs) {
  return callNode("nodetool.timeline.RetargetTimeline", inputs);
}
export {
  addClips,
  fillTimelineText,
  renderTimeline,
  retargetTimeline,
  transcript
};
