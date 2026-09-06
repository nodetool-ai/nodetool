// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderTimeline(inputs) {
  return createNode("nodetool.timeline.RenderTimeline", inputs, { outputNames: ["output", "frames"] });
}
function transcript(inputs) {
  return createNode("nodetool.timeline.Transcript", inputs, { outputNames: ["text", "lines"] });
}
function addClips(inputs) {
  return createNode("nodetool.timeline.AddClips", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function fillTimelineText(inputs) {
  return createNode("nodetool.timeline.FillTimelineText", inputs, { outputNames: ["timeline", "filled", "unresolved"] });
}
function retargetTimeline(inputs) {
  return createNode("nodetool.timeline.RetargetTimeline", inputs, { outputNames: ["timeline", "cropped"] });
}
export {
  addClips,
  fillTimelineText,
  renderTimeline,
  retargetTimeline,
  transcript
};
