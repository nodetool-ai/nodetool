// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function automaticSpeechRecognition(inputs, options) {
  return createNode("nodetool.text.AutomaticSpeechRecognition", inputs, { id: options?.id, outputNames: ["text"], outputTypes: { "text": "str" }, defaultOutput: "text" });
}
function embedding(inputs, options) {
  return createNode("nodetool.text.Embedding", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list" }, defaultOutput: "output" });
}
function rerank(inputs, options) {
  return createNode("nodetool.text.Rerank", inputs, { id: options?.id, outputNames: ["documents", "scores", "indices"], outputTypes: { "documents": "list[str]", "scores": "list[float]", "indices": "list[int]" } });
}
function saveTextFile(inputs, options) {
  return createNode("nodetool.text.SaveTextFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "text" }, defaultOutput: "output" });
}
function saveText(inputs, options) {
  return createNode("nodetool.text.SaveText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "text" }, defaultOutput: "output" });
}
function loadTextFolder(inputs, options) {
  return createNode("nodetool.text.LoadTextFolder", inputs, { id: options?.id, outputNames: ["text", "path", "texts", "paths"], outputTypes: { "text": "str", "path": "str", "texts": "list", "paths": "list" }, streaming: true });
}
function loadTextAssets(inputs, options) {
  return createNode("nodetool.text.LoadTextAssets", inputs, { id: options?.id, outputNames: ["text", "name", "texts", "names"], outputTypes: { "text": "text", "name": "str", "texts": "list", "names": "list" }, streaming: true });
}
function filterString(inputs, options) {
  return createNode("nodetool.text.FilterString", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output", streaming: true, outputCorrelation: { "output": { "kind": "forward", "source": "value" } } });
}
function filterRegexString(inputs, options) {
  return createNode("nodetool.text.FilterRegexString", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output", streaming: true, outputCorrelation: { "output": { "kind": "forward", "source": "value" } } });
}
function concat(inputs, options) {
  return createNode("nodetool.text.Concat", inputs ?? {}, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function collect(inputs, options) {
  return createNode("nodetool.text.Collect", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function prompt(inputs, options) {
  return createNode("nodetool.text.Prompt", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function template(inputs, options) {
  return createNode("nodetool.text.Template", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
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
  rerank,
  saveText,
  saveTextFile,
  template
};
