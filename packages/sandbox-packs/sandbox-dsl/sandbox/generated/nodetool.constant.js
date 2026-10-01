// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function bool(inputs, options) {
  return createNode("nodetool.constant.Bool", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "bool" }, defaultOutput: "output" });
}
function integer(inputs, options) {
  return createNode("nodetool.constant.Integer", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "int" }, defaultOutput: "output" });
}
function float(inputs, options) {
  return createNode("nodetool.constant.Float", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "float" }, defaultOutput: "output" });
}
function string(inputs, options) {
  return createNode("nodetool.constant.String", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function list(inputs, options) {
  return createNode("nodetool.constant.List", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[any]" }, defaultOutput: "output" });
}
function textList(inputs, options) {
  return createNode("nodetool.constant.TextList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[str]" }, defaultOutput: "output" });
}
function dict(inputs, options) {
  return createNode("nodetool.constant.Dict", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dict[str, any]" }, defaultOutput: "output" });
}
function audio(inputs, options) {
  return createNode("nodetool.constant.Audio", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "audio" }, defaultOutput: "output" });
}
function image(inputs, options) {
  return createNode("nodetool.constant.Image", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function video(inputs, options) {
  return createNode("nodetool.constant.Video", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function document(inputs, options) {
  return createNode("nodetool.constant.Document", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "document" }, defaultOutput: "output" });
}
function sketch(inputs, options) {
  return createNode("nodetool.constant.Sketch", inputs, { id: options?.id, outputNames: ["output", "image", "mask", "layers"], outputTypes: { "output": "sketch", "image": "image", "mask": "image", "layers": "list[image]" } });
}
function timeline(inputs, options) {
  return createNode("nodetool.constant.Timeline", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "timeline" }, defaultOutput: "output" });
}
function script(inputs, options) {
  return createNode("nodetool.constant.Script", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "script" }, defaultOutput: "output" });
}
function storyboard(inputs, options) {
  return createNode("nodetool.constant.Storyboard", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "storyboard" }, defaultOutput: "output" });
}
function entity(inputs, options) {
  return createNode("nodetool.constant.Entity", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "entity" }, defaultOutput: "output" });
}
function json(inputs, options) {
  return createNode("nodetool.constant.JSON", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "json" }, defaultOutput: "output" });
}
function model3D(inputs, options) {
  return createNode("nodetool.constant.Model3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "model_3d" }, defaultOutput: "output" });
}
function dataFrame(inputs, options) {
  return createNode("nodetool.constant.DataFrame", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dataframe" }, defaultOutput: "output" });
}
function audioList(inputs, options) {
  return createNode("nodetool.constant.AudioList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[audio]" }, defaultOutput: "output" });
}
function imageList(inputs, options) {
  return createNode("nodetool.constant.ImageList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
function videoList(inputs, options) {
  return createNode("nodetool.constant.VideoList", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[video]" }, defaultOutput: "output" });
}
function select(inputs, options) {
  return createNode("nodetool.constant.Select", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "str" }, defaultOutput: "output" });
}
function imageSize(inputs, options) {
  return createNode("nodetool.constant.ImageSize", inputs, { id: options?.id, outputNames: ["image_size", "width", "height"], outputTypes: { "image_size": "image_size", "width": "int", "height": "int" } });
}
function date(inputs, options) {
  return createNode("nodetool.constant.Date", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "date" }, defaultOutput: "output" });
}
function dateTime(inputs, options) {
  return createNode("nodetool.constant.DateTime", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "datetime" }, defaultOutput: "output" });
}
function asrModelConstant(inputs, options) {
  return createNode("nodetool.constant.ASRModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "asr_model" }, defaultOutput: "output" });
}
function embeddingModelConstant(inputs, options) {
  return createNode("nodetool.constant.EmbeddingModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "embedding_model" }, defaultOutput: "output" });
}
function imageModelConstant(inputs, options) {
  return createNode("nodetool.constant.ImageModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image_model" }, defaultOutput: "output" });
}
function languageModelConstant(inputs, options) {
  return createNode("nodetool.constant.LanguageModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "language_model" }, defaultOutput: "output" });
}
function ttsModelConstant(inputs, options) {
  return createNode("nodetool.constant.TTSModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "tts_model" }, defaultOutput: "output" });
}
function videoModelConstant(inputs, options) {
  return createNode("nodetool.constant.VideoModelConstant", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video_model" }, defaultOutput: "output" });
}
export {
  asrModelConstant,
  audio,
  audioList,
  bool,
  dataFrame,
  date,
  dateTime,
  dict,
  document,
  embeddingModelConstant,
  entity,
  float,
  image,
  imageList,
  imageModelConstant,
  imageSize,
  integer,
  json,
  languageModelConstant,
  list,
  model3D,
  script,
  select,
  sketch,
  storyboard,
  string,
  textList,
  timeline,
  ttsModelConstant,
  video,
  videoList,
  videoModelConstant
};
