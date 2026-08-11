// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function wait(inputs) {
  return createNode("nodetool.triggers.Wait", inputs, { outputNames: ["data", "resumed_at", "waited_seconds"] });
}
function manualTrigger(inputs) {
  return createNode("nodetool.triggers.ManualTrigger", inputs, { outputNames: ["data", "timestamp", "source", "event_type"], streamingInput: true });
}
function intervalTrigger(inputs) {
  return createNode("nodetool.triggers.IntervalTrigger", inputs, { outputNames: ["tick", "elapsed_seconds", "interval_seconds", "timestamp", "source", "event_type"], streaming: true });
}
function webhookTrigger(inputs) {
  return createNode("nodetool.triggers.WebhookTrigger", inputs ?? {}, { outputNames: ["body", "headers", "query", "method", "path", "timestamp", "source", "event_type"] });
}
function fileWatchTrigger(inputs) {
  return createNode("nodetool.triggers.FileWatchTrigger", inputs, { outputNames: ["event", "path", "dest_path", "is_directory", "timestamp"], streaming: true });
}
export {
  fileWatchTrigger,
  intervalTrigger,
  manualTrigger,
  wait,
  webhookTrigger
};
