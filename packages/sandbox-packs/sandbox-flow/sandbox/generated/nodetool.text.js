// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function automaticSpeechRecognition(inputs) {
  return callNode("nodetool.text.AutomaticSpeechRecognition", inputs);
}
function embedding(inputs) {
  return callNode("nodetool.text.Embedding", inputs);
}
function saveTextFile(inputs) {
  return callNode("nodetool.text.SaveTextFile", inputs);
}
function saveText(inputs) {
  return callNode("nodetool.text.SaveText", inputs);
}
function loadTextFolder(inputs) {
  return callNode("nodetool.text.LoadTextFolder", inputs);
}
loadTextFolder.stream = function(inputs) {
  return streamNode("nodetool.text.LoadTextFolder", inputs);
};
function loadTextAssets(inputs) {
  return callNode("nodetool.text.LoadTextAssets", inputs);
}
loadTextAssets.stream = function(inputs) {
  return streamNode("nodetool.text.LoadTextAssets", inputs);
};
function filterString(inputs) {
  return callNode("nodetool.text.FilterString", inputs);
}
filterString.stream = function(inputs) {
  return streamNode("nodetool.text.FilterString", inputs);
};
function filterRegexString(inputs) {
  return callNode("nodetool.text.FilterRegexString", inputs);
}
filterRegexString.stream = function(inputs) {
  return streamNode("nodetool.text.FilterRegexString", inputs);
};
function concat(inputs) {
  return callNode("nodetool.text.Concat", inputs ?? {});
}
function collect(inputs) {
  return callNode("nodetool.text.Collect", inputs);
}
function prompt(inputs) {
  return callNode("nodetool.text.Prompt", inputs);
}
function template(inputs) {
  return callNode("nodetool.text.Template", inputs);
}
export {
  automaticSpeechRecognition,
  collect,
  concat,
  embedding,
  filterRegexString,
  filterString,
  loadTextAssets,
  loadTextFolder,
  prompt,
  saveText,
  saveTextFile,
  template
};
