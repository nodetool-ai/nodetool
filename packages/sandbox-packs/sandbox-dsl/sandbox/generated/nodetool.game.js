// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function spriteSheet(inputs, options) {
  return createNode("nodetool.game.SpriteSheet", inputs, { id: options?.id, outputNames: ["output", "fill"], outputTypes: { "output": "image", "fill": "dict" } });
}
function tileset(inputs, options) {
  return createNode("nodetool.game.Tileset", inputs, { id: options?.id, outputNames: ["output", "fill"], outputTypes: { "output": "image", "fill": "dict" } });
}
function seamlessImage(inputs, options) {
  return createNode("nodetool.game.SeamlessImage", inputs, { id: options?.id, outputNames: ["output", "fill"], outputTypes: { "output": "image", "fill": "dict" } });
}
function soundEffect(inputs, options) {
  return createNode("nodetool.game.SoundEffect", inputs, { id: options?.id, outputNames: ["output", "fill"], outputTypes: { "output": "audio", "fill": "dict" } });
}
function musicLoop(inputs, options) {
  return createNode("nodetool.game.MusicLoop", inputs, { id: options?.id, outputNames: ["output", "fill"], outputTypes: { "output": "audio", "fill": "dict" } });
}
function loadGameTemplate(inputs, options) {
  return createNode("nodetool.game.LoadGameTemplate", inputs, { id: options?.id, outputNames: ["manifest", "slots", "slot"], outputTypes: { "manifest": "dict", "slots": "list[game_slot]", "slot": "game_slot" }, streaming: true, inputMode: "buffered", outputCorrelation: { "slot": { "kind": "iteration", "source": "__execution__", "group": "slots" }, "slots": { "kind": "single", "source": "__execution__" }, "manifest": { "kind": "single", "source": "__execution__" } } });
}
function slotPrompt(inputs, options) {
  return createNode("nodetool.game.SlotPrompt", inputs, { id: options?.id, outputNames: ["prompt", "width", "height", "kind", "checker", "seconds", "reference_images", "reference_asset_id"], outputTypes: { "prompt": "str", "width": "int", "height": "int", "kind": "str", "checker": "dict", "seconds": "float", "reference_images": "list[image]", "reference_asset_id": "str" } });
}
function stageGameAssets(inputs, options) {
  return createNode("nodetool.game.StageGameAssets", inputs, { id: options?.id, outputNames: ["output", "bindings", "paths"], outputTypes: { "output": "dict", "bindings": "dict", "paths": "list[str]" } });
}
export {
  loadGameTemplate,
  musicLoop,
  seamlessImage,
  slotPrompt,
  soundEffect,
  spriteSheet,
  stageGameAssets,
  tileset
};
