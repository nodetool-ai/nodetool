// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function wait(inputs) {
  return callNode("nodetool.triggers.Wait", inputs);
}
function manualTrigger(inputs) {
  return callNode("nodetool.triggers.ManualTrigger", inputs);
}
manualTrigger.stream = function(inputs) {
  return streamNode("nodetool.triggers.ManualTrigger", inputs);
};
function intervalTrigger(inputs) {
  return callNode("nodetool.triggers.IntervalTrigger", inputs);
}
intervalTrigger.stream = function(inputs) {
  return streamNode("nodetool.triggers.IntervalTrigger", inputs);
};
function webhookTrigger(inputs) {
  return callNode("nodetool.triggers.WebhookTrigger", inputs ?? {});
}
function fileWatchTrigger(inputs) {
  return callNode("nodetool.triggers.FileWatchTrigger", inputs);
}
fileWatchTrigger.stream = function(inputs) {
  return streamNode("nodetool.triggers.FileWatchTrigger", inputs);
};
export {
  fileWatchTrigger,
  intervalTrigger,
  manualTrigger,
  wait,
  webhookTrigger
};
