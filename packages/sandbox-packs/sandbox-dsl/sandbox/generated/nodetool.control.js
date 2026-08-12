// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function if_(inputs) {
  return createNode("nodetool.control.If", inputs, { outputNames: ["if_true", "if_false"], streaming: true });
}
function forEach(inputs) {
  return createNode("nodetool.control.ForEach", inputs, { outputNames: ["output", "index"], streaming: true });
}
function collection(inputs) {
  return createNode("nodetool.control.Collection", inputs, { outputNames: ["output", "index"], streaming: true });
}
function repeatCount(inputs) {
  return createNode("nodetool.control.RepeatCount", inputs, { outputNames: ["output", "index"], streaming: true });
}
function repeatValue(inputs) {
  return createNode("nodetool.control.RepeatValue", inputs, { outputNames: ["output", "index"], streaming: true });
}
function take(inputs) {
  return createNode("nodetool.control.Take", inputs, { outputNames: ["output", "index"], streaming: true, streamingInput: true });
}
function drop(inputs) {
  return createNode("nodetool.control.Drop", inputs, { outputNames: ["output", "index"], streaming: true, streamingInput: true });
}
function takeWhile(inputs) {
  return createNode("nodetool.control.TakeWhile", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}
function dropWhile(inputs) {
  return createNode("nodetool.control.DropWhile", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}
function filterEqual(inputs) {
  return createNode("nodetool.control.FilterEqual", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}
function filterCode(inputs) {
  return createNode("nodetool.control.FilterCode", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}
function chunk(inputs) {
  return createNode("nodetool.control.Chunk", inputs, { outputNames: ["output", "index"], streaming: true, streamingInput: true });
}
function last(inputs) {
  return createNode("nodetool.control.Last", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}
function count(inputs) {
  return createNode("nodetool.control.Count", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}
function distinct(inputs) {
  return createNode("nodetool.control.Distinct", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}
function tap(inputs) {
  return createNode("nodetool.control.Tap", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true, streamingInput: true });
}
function collect(inputs) {
  return createNode("nodetool.control.Collect", inputs, { outputNames: ["output"], defaultOutput: "output", streamingInput: true });
}
function reroute(inputs) {
  return createNode("nodetool.control.Reroute", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
function switch_(inputs) {
  return createNode("nodetool.control.Switch", inputs, { outputNames: ["matched", "default", "index"], streaming: true });
}
function tryCatch(inputs) {
  return createNode("nodetool.control.TryCatch", inputs, { outputNames: ["output", "error", "has_error"], streaming: true });
}
function zip(inputs) {
  return createNode("nodetool.control.Zip", inputs, { outputNames: ["left", "right", "index"], streaming: true, streamingInput: true });
}
function cross(inputs) {
  return createNode("nodetool.control.Cross", inputs, { outputNames: ["left", "right"], streaming: true, streamingInput: true });
}
export {
  chunk,
  collect,
  collection,
  count,
  cross,
  distinct,
  drop,
  dropWhile,
  filterCode,
  filterEqual,
  forEach,
  if_,
  last,
  repeatCount,
  repeatValue,
  reroute,
  switch_,
  take,
  takeWhile,
  tap,
  tryCatch,
  zip
};
