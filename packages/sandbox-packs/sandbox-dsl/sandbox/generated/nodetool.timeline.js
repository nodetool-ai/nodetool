// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderTimeline(inputs, options) {
  return createNode("nodetool.timeline.RenderTimeline", inputs, { id: options?.id, outputNames: ["output", "frames"], outputTypes: { "output": "video", "frames": "document" } });
}
function transcript(inputs, options) {
  return createNode("nodetool.timeline.Transcript", inputs, { id: options?.id, outputNames: ["text", "lines"], outputTypes: { "text": "str", "lines": "list[str]" } });
}
function addClips(inputs, options) {
  return createNode("nodetool.timeline.AddClips", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "timeline" }, defaultOutput: "output" });
}
function fillTimelineText(inputs, options) {
  return createNode("nodetool.timeline.FillTimelineText", inputs, { id: options?.id, outputNames: ["timeline", "filled", "unresolved"], outputTypes: { "timeline": "timeline", "filled": "list[str]", "unresolved": "list[str]" } });
}
function retargetTimeline(inputs, options) {
  return createNode("nodetool.timeline.RetargetTimeline", inputs, { id: options?.id, outputNames: ["timeline", "cropped"], outputTypes: { "timeline": "timeline", "cropped": "list[str]" } });
}
export {
  addClips,
  fillTimelineText,
  renderTimeline,
  retargetTimeline,
  transcript
};
