// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function automaticSpeechRecognition(inputs) {
  return createNode("nodetool.text.AutomaticSpeechRecognition", inputs, { outputNames: ["text"], defaultOutput: "text" });
}
function embedding(inputs) {
  return createNode("nodetool.text.Embedding", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveTextFile(inputs) {
  return createNode("nodetool.text.SaveTextFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function saveText(inputs) {
  return createNode("nodetool.text.SaveText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function loadTextFolder(inputs) {
  return createNode("nodetool.text.LoadTextFolder", inputs, { outputNames: ["text", "path", "texts", "paths"], streaming: true });
}
function loadTextAssets(inputs) {
  return createNode("nodetool.text.LoadTextAssets", inputs, { outputNames: ["text", "name", "texts", "names"], streaming: true });
}
function filterString(inputs) {
  return createNode("nodetool.text.FilterString", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
function filterRegexString(inputs) {
  return createNode("nodetool.text.FilterRegexString", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
function concat(inputs) {
  return createNode("nodetool.text.Concat", inputs ?? {}, { outputNames: ["output"], defaultOutput: "output" });
}
function collect(inputs) {
  return createNode("nodetool.text.Collect", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function prompt(inputs) {
  return createNode("nodetool.text.Prompt", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function template(inputs) {
  return createNode("nodetool.text.Template", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
