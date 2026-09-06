// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function loadEntity(inputs) {
  return callNode("nodetool.entity.LoadEntity", inputs);
}
function listEntities(inputs) {
  return callNode("nodetool.entity.ListEntities", inputs);
}
listEntities.stream = function(inputs) {
  return streamNode("nodetool.entity.ListEntities", inputs);
};
function createEntity(inputs) {
  return callNode("nodetool.entity.CreateEntity", inputs);
}
export {
  createEntity,
  listEntities,
  loadEntity
};
