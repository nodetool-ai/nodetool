// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function wait(inputs, options) {
  return createNode("nodetool.triggers.Wait", inputs, { id: options?.id, outputNames: ["data", "resumed_at", "waited_seconds"], outputTypes: { "data": "any", "resumed_at": "str", "waited_seconds": "float" } });
}
function manualTrigger(inputs, options) {
  return createNode("nodetool.triggers.ManualTrigger", inputs, { id: options?.id, outputNames: ["data", "timestamp", "source", "event_type"], outputTypes: { "data": "any", "timestamp": "str", "source": "str", "event_type": "str" }, streamingInput: true });
}
function intervalTrigger(inputs, options) {
  return createNode("nodetool.triggers.IntervalTrigger", inputs, { id: options?.id, outputNames: ["tick", "elapsed_seconds", "interval_seconds", "timestamp", "source", "event_type"], outputTypes: { "tick": "int", "elapsed_seconds": "float", "interval_seconds": "float", "timestamp": "str", "source": "str", "event_type": "str" }, streaming: true });
}
function webhookTrigger(inputs, options) {
  return createNode("nodetool.triggers.WebhookTrigger", inputs ?? {}, { id: options?.id, outputNames: ["body", "headers", "query", "method", "path", "timestamp", "source", "event_type"], outputTypes: { "body": "any", "headers": "dict[str, any]", "query": "dict[str, any]", "method": "str", "path": "str", "timestamp": "str", "source": "str", "event_type": "str" } });
}
function fileWatchTrigger(inputs, options) {
  return createNode("nodetool.triggers.FileWatchTrigger", inputs, { id: options?.id, outputNames: ["event", "path", "dest_path", "is_directory", "timestamp"], outputTypes: { "event": "str", "path": "str", "dest_path": "str", "is_directory": "bool", "timestamp": "str" }, streaming: true });
}
export {
  fileWatchTrigger,
  intervalTrigger,
  manualTrigger,
  wait,
  webhookTrigger
};
