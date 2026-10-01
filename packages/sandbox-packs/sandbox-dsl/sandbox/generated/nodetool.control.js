// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function if_(inputs, options) {
  return createNode("nodetool.control.If", inputs, { id: options?.id, outputNames: ["if_true", "if_false"], outputTypes: { "if_true": "any", "if_false": "any" }, streaming: true, inputMode: "buffered", outputCorrelation: { "if_true": { "kind": "forward", "source": "value" }, "if_false": { "kind": "forward", "source": "value" } } });
}
function loop(inputs, options) {
  return createNode("nodetool.control.Loop", inputs, { id: options?.id, outputNames: ["value", "index", "done"], outputTypes: { "value": "any", "index": "int", "done": "any" }, streaming: true, inputMode: "buffered", outputCorrelation: { "value": { "kind": "iteration", "source": "initial", "group": "loop" }, "index": { "kind": "iteration", "source": "initial", "group": "loop" }, "done": { "kind": "single", "source": "initial" } } });
}
function forEach(inputs, options) {
  return createNode("nodetool.control.ForEach", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "any", "index": "int" }, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" } } });
}
function collection(inputs, options) {
  return createNode("nodetool.control.Collection", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "any", "index": "int" }, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" } } });
}
function repeatCount(inputs, options) {
  return createNode("nodetool.control.RepeatCount", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "int", "index": "int" }, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" } } });
}
function repeatValue(inputs, options) {
  return createNode("nodetool.control.RepeatValue", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "any", "index": "int" }, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "iteration", "source": "__execution__", "group": "items" }, "index": { "kind": "iteration", "source": "__execution__", "group": "items" } } });
}
function take(inputs, options) {
  return createNode("nodetool.control.Take", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "any", "index": "int" }, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" }, "index": { "kind": "forward", "source": "input_item" } } });
}
function drop(inputs, options) {
  return createNode("nodetool.control.Drop", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "any", "index": "int" }, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" }, "index": { "kind": "forward", "source": "input_item" } } });
}
function takeWhile(inputs, options) {
  return createNode("nodetool.control.TakeWhile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" } } });
}
function dropWhile(inputs, options) {
  return createNode("nodetool.control.DropWhile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" } } });
}
function filterEqual(inputs, options) {
  return createNode("nodetool.control.FilterEqual", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" } } });
}
function filterCode(inputs, options) {
  return createNode("nodetool.control.FilterCode", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" } } });
}
function chunk(inputs, options) {
  return createNode("nodetool.control.Chunk", inputs, { id: options?.id, outputNames: ["output", "index"], outputTypes: { "output": "list[any]", "index": "int" }, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "iteration", "source": "input_item", "group": "batch" }, "index": { "kind": "iteration", "source": "input_item", "group": "batch" } } });
}
function last(inputs, options) {
  return createNode("nodetool.control.Last", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "aggregate", "source": "input_item", "collapse": "innermost" } } });
}
function count(inputs, options) {
  return createNode("nodetool.control.Count", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "int" }, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "aggregate", "source": "input_item", "collapse": "innermost" } } });
}
function distinct(inputs, options) {
  return createNode("nodetool.control.Distinct", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" } } });
}
function tap(inputs, options) {
  return createNode("nodetool.control.Tap", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "forward", "source": "input_item" } } });
}
function collect(inputs, options) {
  return createNode("nodetool.control.Collect", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[any]" }, defaultOutput: "output", streamingInput: true, inputMode: "stream", outputCorrelation: { "output": { "kind": "aggregate", "source": "input_item", "collapse": "innermost" } } });
}
function reroute(inputs, options) {
  return createNode("nodetool.control.Reroute", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "forward", "source": "input_value" } } });
}
function switch_(inputs, options) {
  return createNode("nodetool.control.Switch", inputs, { id: options?.id, outputNames: ["matched", "default", "index"], outputTypes: { "matched": "any", "default": "any", "index": "int" }, streaming: true, inputMode: "buffered", outputCorrelation: { "matched": { "kind": "forward", "source": "input" }, "default": { "kind": "forward", "source": "input" }, "index": { "kind": "single", "source": "input" } } });
}
function tryCatch(inputs, options) {
  return createNode("nodetool.control.TryCatch", inputs, { id: options?.id, outputNames: ["output", "error", "has_error"], outputTypes: { "output": "any", "error": "str", "has_error": "bool" }, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "forward", "source": "value" }, "error": { "kind": "single", "source": "value" }, "has_error": { "kind": "single", "source": "value" } } });
}
function zip(inputs, options) {
  return createNode("nodetool.control.Zip", inputs, { id: options?.id, outputNames: ["left", "right", "index"], outputTypes: { "left": "any", "right": "any", "index": "int" }, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "left": { "kind": "iteration", "source": "__execution__", "group": "zip" }, "right": { "kind": "iteration", "source": "__execution__", "group": "zip" }, "index": { "kind": "iteration", "source": "__execution__", "group": "zip" } } });
}
function cross(inputs, options) {
  return createNode("nodetool.control.Cross", inputs, { id: options?.id, outputNames: ["left", "right"], outputTypes: { "left": "any", "right": "any" }, streaming: true, streamingInput: true, inputMode: "stream", outputCorrelation: { "left": { "kind": "iteration", "source": "__execution__", "group": "cross" }, "right": { "kind": "iteration", "source": "__execution__", "group": "cross" } } });
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
  loop,
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
