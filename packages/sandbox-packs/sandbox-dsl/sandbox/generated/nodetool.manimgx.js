// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function renderScene(inputs, options) {
  return createNode("nodetool.manimgx.RenderScene", inputs, { id: options?.id, outputNames: ["video", "storyboard", "report", "subtitles", "duration"], outputTypes: { "video": "video", "storyboard": "list[image]", "report": "str", "subtitles": "str", "duration": "float" } });
}
function inspectScene(inputs, options) {
  return createNode("nodetool.manimgx.InspectScene", inputs, { id: options?.id, outputNames: ["ok", "problems", "report", "storyboard", "duration"], outputTypes: { "ok": "bool", "problems": "bool", "report": "str", "storyboard": "list[image]", "duration": "float" } });
}
function generateScene(inputs, options) {
  return createNode("nodetool.manimgx.GenerateScene", inputs, { id: options?.id, outputNames: ["video", "code", "storyboard", "report", "attempts"], outputTypes: { "video": "video", "code": "str", "storyboard": "list[image]", "report": "str", "attempts": "int" } });
}
export {
  generateScene,
  inspectScene,
  renderScene
};
