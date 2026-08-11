// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function bool(inputs) {
  return createNode("nodetool.constant.Bool", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function integer(inputs) {
  return createNode("nodetool.constant.Integer", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function float(inputs) {
  return createNode("nodetool.constant.Float", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function string(inputs) {
  return createNode("nodetool.constant.String", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function list(inputs) {
  return createNode("nodetool.constant.List", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function textList(inputs) {
  return createNode("nodetool.constant.TextList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function dict(inputs) {
  return createNode("nodetool.constant.Dict", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function audio(inputs) {
  return createNode("nodetool.constant.Audio", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function image(inputs) {
  return createNode("nodetool.constant.Image", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function video(inputs) {
  return createNode("nodetool.constant.Video", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function document(inputs) {
  return createNode("nodetool.constant.Document", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function sketch(inputs) {
  return createNode("nodetool.constant.Sketch", inputs, { outputNames: ["output", "image", "mask", "layers"] });
}
function timeline(inputs) {
  return createNode("nodetool.constant.Timeline", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function script(inputs) {
  return createNode("nodetool.constant.Script", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function json(inputs) {
  return createNode("nodetool.constant.JSON", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function model3D(inputs) {
  return createNode("nodetool.constant.Model3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function dataFrame(inputs) {
  return createNode("nodetool.constant.DataFrame", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function audioList(inputs) {
  return createNode("nodetool.constant.AudioList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageList(inputs) {
  return createNode("nodetool.constant.ImageList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function videoList(inputs) {
  return createNode("nodetool.constant.VideoList", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function select(inputs) {
  return createNode("nodetool.constant.Select", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageSize(inputs) {
  return createNode("nodetool.constant.ImageSize", inputs, { outputNames: ["image_size", "width", "height"] });
}
function date(inputs) {
  return createNode("nodetool.constant.Date", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function dateTime(inputs) {
  return createNode("nodetool.constant.DateTime", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function asrModelConstant(inputs) {
  return createNode("nodetool.constant.ASRModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function embeddingModelConstant(inputs) {
  return createNode("nodetool.constant.EmbeddingModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageModelConstant(inputs) {
  return createNode("nodetool.constant.ImageModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function languageModelConstant(inputs) {
  return createNode("nodetool.constant.LanguageModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function ttsModelConstant(inputs) {
  return createNode("nodetool.constant.TTSModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function videoModelConstant(inputs) {
  return createNode("nodetool.constant.VideoModelConstant", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
