// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function loadStoryboard(inputs) {
  return callNode("nodetool.storyboard.LoadStoryboard", inputs);
}
function storyboardShots(inputs) {
  return callNode("nodetool.storyboard.StoryboardShots", inputs);
}
storyboardShots.stream = function(inputs) {
  return streamNode("nodetool.storyboard.StoryboardShots", inputs);
};
function recastStoryboard(inputs) {
  return callNode("nodetool.storyboard.RecastStoryboard", inputs);
}
function renderStills(inputs) {
  return callNode("nodetool.storyboard.RenderStills", inputs);
}
function renderClips(inputs) {
  return callNode("nodetool.storyboard.RenderClips", inputs);
}
function assembleTimeline(inputs) {
  return callNode("nodetool.storyboard.AssembleTimeline", inputs);
}
export {
  assembleTimeline,
  loadStoryboard,
  recastStoryboard,
  renderClips,
  renderStills,
  storyboardShots
};
