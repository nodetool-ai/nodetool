// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadEntity(inputs) {
  return createNode("nodetool.entity.LoadEntity", inputs, { outputNames: ["entity", "descriptor", "name", "kind", "reference_image", "voice_id"] });
}
function listEntities(inputs) {
  return createNode("nodetool.entity.ListEntities", inputs, { outputNames: ["entity", "entities"], streaming: true });
}
function createEntity(inputs) {
  return createNode("nodetool.entity.CreateEntity", inputs, { outputNames: ["entity", "created"] });
}
export {
  createEntity,
  listEntities,
  loadEntity
};
