// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function spriteSheet(inputs) {
  return createNode("nodetool.game.SpriteSheet", inputs, { outputNames: ["output", "fill"] });
}
function tileset(inputs) {
  return createNode("nodetool.game.Tileset", inputs, { outputNames: ["output", "fill"] });
}
function seamlessImage(inputs) {
  return createNode("nodetool.game.SeamlessImage", inputs, { outputNames: ["output", "fill"] });
}
function soundEffect(inputs) {
  return createNode("nodetool.game.SoundEffect", inputs, { outputNames: ["output", "fill"] });
}
function musicLoop(inputs) {
  return createNode("nodetool.game.MusicLoop", inputs, { outputNames: ["output", "fill"] });
}
export {
  musicLoop,
  seamlessImage,
  soundEffect,
  spriteSheet,
  tileset
};
