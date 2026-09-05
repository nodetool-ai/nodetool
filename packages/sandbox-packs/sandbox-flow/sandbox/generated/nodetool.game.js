// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
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
export {
  musicLoop,
  seamlessImage,
  soundEffect,
  spriteSheet,
  tileset
};
