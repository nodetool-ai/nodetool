// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function valueInput(inputs, options) {
  return createNode("nodetool.input.ValueInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output" });
}
function floatInput(inputs, options) {
  return createNode("nodetool.input.FloatInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "float" }, defaultOutput: "output" });
}
function booleanInput(inputs, options) {
  return createNode("nodetool.input.BooleanInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "bool" }, defaultOutput: "output" });
}
function integerInput(inputs, options) {
  return createNode("nodetool.input.IntegerInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "int" }, defaultOutput: "output" });
}
function stringInput(inputs, options) {
  return createNode("nodetool.input.StringInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function selectInput(inputs, options) {
  return createNode("nodetool.input.SelectInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function stringListInput(inputs, options) {
  return createNode("nodetool.input.StringListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[str]" }, defaultOutput: "output" });
}
function folderPathInput(inputs, options) {
  return createNode("nodetool.input.FolderPathInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function huggingFaceModelInput(inputs, options) {
  return createNode("nodetool.input.HuggingFaceModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "hf.model" }, defaultOutput: "output" });
}
function colorInput(inputs, options) {
  return createNode("nodetool.input.ColorInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "color" }, defaultOutput: "output" });
}
function imageSizeInput(inputs, options) {
  return createNode("nodetool.input.ImageSizeInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image_size" }, defaultOutput: "output" });
}
function languageModelInput(inputs, options) {
  return createNode("nodetool.input.LanguageModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "language_model" }, defaultOutput: "output" });
}
function imageModelInput(inputs, options) {
  return createNode("nodetool.input.ImageModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image_model" }, defaultOutput: "output" });
}
function videoModelInput(inputs, options) {
  return createNode("nodetool.input.VideoModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video_model" }, defaultOutput: "output" });
}
function ttsModelInput(inputs, options) {
  return createNode("nodetool.input.TTSModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "tts_model" }, defaultOutput: "output" });
}
function asrModelInput(inputs, options) {
  return createNode("nodetool.input.ASRModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "asr_model" }, defaultOutput: "output" });
}
function embeddingModelInput(inputs, options) {
  return createNode("nodetool.input.EmbeddingModelInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "embedding_model" }, defaultOutput: "output" });
}
function dataframeInput(inputs, options) {
  return createNode("nodetool.input.DataframeInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dataframe" }, defaultOutput: "output" });
}
function documentInput(inputs, options) {
  return createNode("nodetool.input.DocumentInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "document" }, defaultOutput: "output" });
}
function imageInput(inputs, options) {
  return createNode("nodetool.input.ImageInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function imageListInput(inputs, options) {
  return createNode("nodetool.input.ImageListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
function videoListInput(inputs, options) {
  return createNode("nodetool.input.VideoListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[video]" }, defaultOutput: "output" });
}
function audioListInput(inputs, options) {
  return createNode("nodetool.input.AudioListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[audio]" }, defaultOutput: "output" });
}
function textListInput(inputs, options) {
  return createNode("nodetool.input.TextListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[str]" }, defaultOutput: "output" });
}
function videoInput(inputs, options) {
  return createNode("nodetool.input.VideoInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function audioInput(inputs, options) {
  return createNode("nodetool.input.AudioInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function model3DInput(inputs, options) {
  return createNode("nodetool.input.Model3DInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function realtimeAudioInput(inputs, options) {
  return createNode("nodetool.input.RealtimeAudioInput", inputs, { id: options?.id, outputNames: ["chunk"], outputTypes: { "chunk": "chunk" }, defaultOutput: "chunk", streaming: true, inputMode: "buffered", outputCorrelation: { "chunk": { "kind": "chunk", "source": "__execution__" } } });
}
function assetFolderInput(inputs, options) {
  return createNode("nodetool.input.AssetFolderInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "folder" }, defaultOutput: "output" });
}
function filePathInput(inputs, options) {
  return createNode("nodetool.input.FilePathInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function documentFileInput(inputs, options) {
  return createNode("nodetool.input.DocumentFileInput", inputs, { id: options?.id, outputNames: ["document", "path"], outputTypes: { "document": "document", "path": "str" } });
}
function messageInput(inputs, options) {
  return createNode("nodetool.input.MessageInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "message" }, defaultOutput: "output" });
}
function messageListInput(inputs, options) {
  return createNode("nodetool.input.MessageListInput", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[message]" }, defaultOutput: "output" });
}
function messageDeconstructor(inputs, options) {
  return createNode("nodetool.input.MessageDeconstructor", inputs, { id: options?.id, outputNames: ["id", "thread_id", "role", "text", "image", "audio", "model"], outputTypes: { "id": "str", "thread_id": "str", "role": "str", "text": "str", "image": "image", "audio": "audio", "model": "language_model" } });
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
  valueInput,
  videoInput,
  videoListInput,
  videoModelInput
};
