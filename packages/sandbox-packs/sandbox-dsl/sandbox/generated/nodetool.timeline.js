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
export {
  addClips,
  renderTimeline,
  transcript
};
