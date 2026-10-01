// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadStoryboard(inputs, options) {
  return createNode("nodetool.storyboard.LoadStoryboard", inputs, { id: options?.id, outputNames: ["storyboard", "shots", "entities", "style", "aspect_ratio", "name", "image_model", "video_model", "shot_count"], outputTypes: { "storyboard": "storyboard", "shots": "list[dict]", "entities": "list[entity]", "style": "str", "aspect_ratio": "str", "name": "str", "image_model": "image_model", "video_model": "video_model", "shot_count": "int" } });
}
function storyboardShots(inputs, options) {
  return createNode("nodetool.storyboard.StoryboardShots", inputs, { id: options?.id, outputNames: ["shot", "index", "slug", "keyframe", "clip", "output"], outputTypes: { "shot": "dict", "index": "int", "slug": "str", "keyframe": "image", "clip": "video", "output": "list[dict]" }, streaming: true, inputMode: "buffered", outputCorrelation: { "shot": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" }, "slug": { "kind": "iteration", "source": "__execution__", "group": "items" }, "keyframe": { "kind": "iteration", "source": "__execution__", "group": "items" }, "clip": { "kind": "iteration", "source": "__execution__", "group": "items" }, "output": { "kind": "single", "source": "__execution__" } } });
}
function recastStoryboard(inputs, options) {
  return createNode("nodetool.storyboard.RecastStoryboard", inputs, { id: options?.id, outputNames: ["storyboard", "invalidated", "kept"], outputTypes: { "storyboard": "storyboard", "invalidated": "list[str]", "kept": "list[str]" } });
}
function renderStills(inputs, options) {
  return createNode("nodetool.storyboard.RenderStills", inputs, { id: options?.id, outputNames: ["storyboard", "keyframes", "rendered", "skipped", "failed"], outputTypes: { "storyboard": "storyboard", "keyframes": "list[image]", "rendered": "list[str]", "skipped": "list[str]", "failed": "list[str]" } });
}
function renderClips(inputs, options) {
  return createNode("nodetool.storyboard.RenderClips", inputs, { id: options?.id, outputNames: ["storyboard", "clips", "rendered", "skipped", "failed"], outputTypes: { "storyboard": "storyboard", "clips": "list[video]", "rendered": "list[str]", "skipped": "list[str]", "failed": "list[str]" } });
}
function assembleTimeline(inputs, options) {
  return createNode("nodetool.storyboard.AssembleTimeline", inputs, { id: options?.id, outputNames: ["timeline", "skipped_shots", "retimed"], outputTypes: { "timeline": "timeline", "skipped_shots": "list[str]", "retimed": "list[dict]" } });
}
export {
  assembleTimeline,
  loadStoryboard,
  recastStoryboard,
  renderClips,
  renderStills,
  storyboardShots
};
