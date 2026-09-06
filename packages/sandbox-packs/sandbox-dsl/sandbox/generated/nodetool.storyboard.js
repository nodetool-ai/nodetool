// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadStoryboard(inputs) {
  return createNode("nodetool.storyboard.LoadStoryboard", inputs, { outputNames: ["storyboard", "shots", "entities", "style", "aspect_ratio", "name", "image_model", "video_model", "shot_count"] });
}
function storyboardShots(inputs) {
  return createNode("nodetool.storyboard.StoryboardShots", inputs, { outputNames: ["shot", "index", "slug", "keyframe", "clip", "output"], streaming: true });
}
function recastStoryboard(inputs) {
  return createNode("nodetool.storyboard.RecastStoryboard", inputs, { outputNames: ["storyboard", "invalidated", "kept"] });
}
function renderStills(inputs) {
  return createNode("nodetool.storyboard.RenderStills", inputs, { outputNames: ["storyboard", "keyframes", "rendered", "skipped", "failed"] });
}
function renderClips(inputs) {
  return createNode("nodetool.storyboard.RenderClips", inputs, { outputNames: ["storyboard", "clips", "rendered", "skipped", "failed"] });
}
function assembleTimeline(inputs) {
  return createNode("nodetool.storyboard.AssembleTimeline", inputs, { outputNames: ["timeline", "skipped_shots", "retimed"] });
}
export {
  assembleTimeline,
  loadStoryboard,
  recastStoryboard,
  renderClips,
  renderStills,
  storyboardShots
};
