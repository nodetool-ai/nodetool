// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function loadEntity(inputs, options) {
  return createNode("nodetool.entity.LoadEntity", inputs, { id: options?.id, outputNames: ["entity", "descriptor", "name", "kind", "reference_image", "voice_id"], outputTypes: { "entity": "entity", "descriptor": "str", "name": "str", "kind": "str", "reference_image": "image", "voice_id": "str" } });
}
function listEntities(inputs, options) {
  return createNode("nodetool.entity.ListEntities", inputs, { id: options?.id, outputNames: ["entity", "entities"], outputTypes: { "entity": "entity", "entities": "list[entity]" }, streaming: true, inputMode: "buffered", outputCorrelation: { "entity": { "kind": "iteration", "source": "__execution__", "group": "items" }, "entities": { "kind": "single", "source": "__execution__" } } });
}
function createEntity(inputs, options) {
  return createNode("nodetool.entity.CreateEntity", inputs, { id: options?.id, outputNames: ["entity", "created"], outputTypes: { "entity": "entity", "created": "bool" } });
}
export {
  createEntity,
  listEntities,
  loadEntity
};
