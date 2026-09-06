// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function spriteSheet(inputs) {
  return callNode("nodetool.game.SpriteSheet", inputs);
}
function tileset(inputs) {
  return callNode("nodetool.game.Tileset", inputs);
}
function seamlessImage(inputs) {
  return callNode("nodetool.game.SeamlessImage", inputs);
}
function soundEffect(inputs) {
  return callNode("nodetool.game.SoundEffect", inputs);
}
function musicLoop(inputs) {
  return callNode("nodetool.game.MusicLoop", inputs);
}
function loadGameTemplate(inputs) {
  return callNode("nodetool.game.LoadGameTemplate", inputs);
}
loadGameTemplate.stream = function(inputs) {
  return streamNode("nodetool.game.LoadGameTemplate", inputs);
};
function slotPrompt(inputs) {
  return callNode("nodetool.game.SlotPrompt", inputs);
}
function exportGodotProject(inputs) {
  return callNode("nodetool.game.ExportGodotProject", inputs);
}
export {
  exportGodotProject,
  loadGameTemplate,
  musicLoop,
  seamlessImage,
  slotPrompt,
  soundEffect,
  spriteSheet,
  tileset
};
