// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function renderScene(inputs) {
  return callNode("nodetool.manimgx.RenderScene", inputs);
}
function inspectScene(inputs) {
  return callNode("nodetool.manimgx.InspectScene", inputs);
}
function generateScene(inputs) {
  return callNode("nodetool.manimgx.GenerateScene", inputs);
}
export {
  generateScene,
  inspectScene,
  renderScene
};
