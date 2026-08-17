// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function bool(inputs) {
  return callNode("nodetool.constant.Bool", inputs);
}
function integer(inputs) {
  return callNode("nodetool.constant.Integer", inputs);
}
function float(inputs) {
  return callNode("nodetool.constant.Float", inputs);
}
function string(inputs) {
  return callNode("nodetool.constant.String", inputs);
}
function list(inputs) {
  return callNode("nodetool.constant.List", inputs);
}
function textList(inputs) {
  return callNode("nodetool.constant.TextList", inputs);
}
function dict(inputs) {
  return callNode("nodetool.constant.Dict", inputs);
}
function audio(inputs) {
  return callNode("nodetool.constant.Audio", inputs);
}
function image(inputs) {
  return callNode("nodetool.constant.Image", inputs);
}
function video(inputs) {
  return callNode("nodetool.constant.Video", inputs);
}
function document(inputs) {
  return callNode("nodetool.constant.Document", inputs);
}
function sketch(inputs) {
  return callNode("nodetool.constant.Sketch", inputs);
}
function timeline(inputs) {
  return callNode("nodetool.constant.Timeline", inputs);
}
function script(inputs) {
  return callNode("nodetool.constant.Script", inputs);
}
function json(inputs) {
  return callNode("nodetool.constant.JSON", inputs);
}
function model3D(inputs) {
  return callNode("nodetool.constant.Model3D", inputs);
}
function dataFrame(inputs) {
  return callNode("nodetool.constant.DataFrame", inputs);
}
function audioList(inputs) {
  return callNode("nodetool.constant.AudioList", inputs);
}
function imageList(inputs) {
  return callNode("nodetool.constant.ImageList", inputs);
}
function videoList(inputs) {
  return callNode("nodetool.constant.VideoList", inputs);
}
function select(inputs) {
  return callNode("nodetool.constant.Select", inputs);
}
function imageSize(inputs) {
  return callNode("nodetool.constant.ImageSize", inputs);
}
function date(inputs) {
  return callNode("nodetool.constant.Date", inputs);
}
function dateTime(inputs) {
  return callNode("nodetool.constant.DateTime", inputs);
}
function asrModelConstant(inputs) {
  return callNode("nodetool.constant.ASRModelConstant", inputs);
}
function embeddingModelConstant(inputs) {
  return callNode("nodetool.constant.EmbeddingModelConstant", inputs);
}
function imageModelConstant(inputs) {
  return callNode("nodetool.constant.ImageModelConstant", inputs);
}
function languageModelConstant(inputs) {
  return callNode("nodetool.constant.LanguageModelConstant", inputs);
}
function ttsModelConstant(inputs) {
  return callNode("nodetool.constant.TTSModelConstant", inputs);
}
function videoModelConstant(inputs) {
  return callNode("nodetool.constant.VideoModelConstant", inputs);
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
  string,
  textList,
  timeline,
  ttsModelConstant,
  video,
  videoList,
  videoModelConstant
};
