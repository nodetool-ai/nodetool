// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function floatInput(inputs) {
  return callNode("nodetool.input.FloatInput", inputs);
}
function booleanInput(inputs) {
  return callNode("nodetool.input.BooleanInput", inputs);
}
function integerInput(inputs) {
  return callNode("nodetool.input.IntegerInput", inputs);
}
function stringInput(inputs) {
  return callNode("nodetool.input.StringInput", inputs);
}
function selectInput(inputs) {
  return callNode("nodetool.input.SelectInput", inputs);
}
function stringListInput(inputs) {
  return callNode("nodetool.input.StringListInput", inputs);
}
function folderPathInput(inputs) {
  return callNode("nodetool.input.FolderPathInput", inputs);
}
function huggingFaceModelInput(inputs) {
  return callNode("nodetool.input.HuggingFaceModelInput", inputs);
}
function colorInput(inputs) {
  return callNode("nodetool.input.ColorInput", inputs);
}
function imageSizeInput(inputs) {
  return callNode("nodetool.input.ImageSizeInput", inputs);
}
function languageModelInput(inputs) {
  return callNode("nodetool.input.LanguageModelInput", inputs);
}
function imageModelInput(inputs) {
  return callNode("nodetool.input.ImageModelInput", inputs);
}
function videoModelInput(inputs) {
  return callNode("nodetool.input.VideoModelInput", inputs);
}
function ttsModelInput(inputs) {
  return callNode("nodetool.input.TTSModelInput", inputs);
}
function asrModelInput(inputs) {
  return callNode("nodetool.input.ASRModelInput", inputs);
}
function embeddingModelInput(inputs) {
  return callNode("nodetool.input.EmbeddingModelInput", inputs);
}
function dataframeInput(inputs) {
  return callNode("nodetool.input.DataframeInput", inputs);
}
function documentInput(inputs) {
  return callNode("nodetool.input.DocumentInput", inputs);
}
function imageInput(inputs) {
  return callNode("nodetool.input.ImageInput", inputs);
}
function imageListInput(inputs) {
  return callNode("nodetool.input.ImageListInput", inputs);
}
function videoListInput(inputs) {
  return callNode("nodetool.input.VideoListInput", inputs);
}
function audioListInput(inputs) {
  return callNode("nodetool.input.AudioListInput", inputs);
}
function textListInput(inputs) {
  return callNode("nodetool.input.TextListInput", inputs);
}
function videoInput(inputs) {
  return callNode("nodetool.input.VideoInput", inputs);
}
function audioInput(inputs) {
  return callNode("nodetool.input.AudioInput", inputs);
}
function model3DInput(inputs) {
  return callNode("nodetool.input.Model3DInput", inputs);
}
function realtimeAudioInput(inputs) {
  return callNode("nodetool.input.RealtimeAudioInput", inputs);
}
realtimeAudioInput.stream = function(inputs) {
  return streamNode("nodetool.input.RealtimeAudioInput", inputs);
};
function assetFolderInput(inputs) {
  return callNode("nodetool.input.AssetFolderInput", inputs);
}
function filePathInput(inputs) {
  return callNode("nodetool.input.FilePathInput", inputs);
}
function documentFileInput(inputs) {
  return callNode("nodetool.input.DocumentFileInput", inputs);
}
function messageInput(inputs) {
  return callNode("nodetool.input.MessageInput", inputs);
}
function messageListInput(inputs) {
  return callNode("nodetool.input.MessageListInput", inputs);
}
function messageDeconstructor(inputs) {
  return callNode("nodetool.input.MessageDeconstructor", inputs);
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
