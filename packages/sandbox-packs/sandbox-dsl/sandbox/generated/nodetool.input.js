// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function floatInput(inputs) {
  return createNode("nodetool.input.FloatInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function booleanInput(inputs) {
  return createNode("nodetool.input.BooleanInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function integerInput(inputs) {
  return createNode("nodetool.input.IntegerInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function stringInput(inputs) {
  return createNode("nodetool.input.StringInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function selectInput(inputs) {
  return createNode("nodetool.input.SelectInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function stringListInput(inputs) {
  return createNode("nodetool.input.StringListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function folderPathInput(inputs) {
  return createNode("nodetool.input.FolderPathInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function huggingFaceModelInput(inputs) {
  return createNode("nodetool.input.HuggingFaceModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function colorInput(inputs) {
  return createNode("nodetool.input.ColorInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageSizeInput(inputs) {
  return createNode("nodetool.input.ImageSizeInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function languageModelInput(inputs) {
  return createNode("nodetool.input.LanguageModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageModelInput(inputs) {
  return createNode("nodetool.input.ImageModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function videoModelInput(inputs) {
  return createNode("nodetool.input.VideoModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function ttsModelInput(inputs) {
  return createNode("nodetool.input.TTSModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function asrModelInput(inputs) {
  return createNode("nodetool.input.ASRModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function embeddingModelInput(inputs) {
  return createNode("nodetool.input.EmbeddingModelInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function dataframeInput(inputs) {
  return createNode("nodetool.input.DataframeInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function documentInput(inputs) {
  return createNode("nodetool.input.DocumentInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageInput(inputs) {
  return createNode("nodetool.input.ImageInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageListInput(inputs) {
  return createNode("nodetool.input.ImageListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function videoListInput(inputs) {
  return createNode("nodetool.input.VideoListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function audioListInput(inputs) {
  return createNode("nodetool.input.AudioListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function textListInput(inputs) {
  return createNode("nodetool.input.TextListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function videoInput(inputs) {
  return createNode("nodetool.input.VideoInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function audioInput(inputs) {
  return createNode("nodetool.input.AudioInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function model3DInput(inputs) {
  return createNode("nodetool.input.Model3DInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function realtimeAudioInput(inputs) {
  return createNode("nodetool.input.RealtimeAudioInput", inputs, { outputNames: ["chunk"], defaultOutput: "chunk", streaming: true });
}
function assetFolderInput(inputs) {
  return createNode("nodetool.input.AssetFolderInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function filePathInput(inputs) {
  return createNode("nodetool.input.FilePathInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function documentFileInput(inputs) {
  return createNode("nodetool.input.DocumentFileInput", inputs, { outputNames: ["document", "path"] });
}
function messageInput(inputs) {
  return createNode("nodetool.input.MessageInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function messageListInput(inputs) {
  return createNode("nodetool.input.MessageListInput", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function messageDeconstructor(inputs) {
  return createNode("nodetool.input.MessageDeconstructor", inputs, { outputNames: ["id", "thread_id", "role", "text", "image", "audio", "model"] });
}
export {
  asrModelInput,
  assetFolderInput,
  audioInput,
  audioListInput,
  booleanInput,
  colorInput,
  dataframeInput,
  documentFileInput,
  documentInput,
  embeddingModelInput,
  filePathInput,
  floatInput,
  folderPathInput,
  huggingFaceModelInput,
  imageInput,
  imageListInput,
  imageModelInput,
  imageSizeInput,
  integerInput,
  languageModelInput,
  messageDeconstructor,
  messageInput,
  messageListInput,
  model3DInput,
  realtimeAudioInput,
  selectInput,
  stringInput,
  stringListInput,
  textListInput,
  ttsModelInput,
  videoInput,
  videoListInput,
  videoModelInput
};
