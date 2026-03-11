import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  // boolean
  ConditionalSwitchNode,
  LogicalOperatorNode,
  NotNode,
  CompareNode,
  IsNoneNode,
  IsInNode,
  AllNode,
  SomeNode,
  // list
  LengthNode,
  ListRangeNode,
  GenerateSequenceNode,
  SliceNode,
  SelectElementsNode,
  GetElementNode,
  AppendNode,
  ExtendNode,
  DedupeNode,
  ReverseNode,
  RandomizeNode,
  SortNode,
  IntersectionNode,
  UnionNode,
  DifferenceNode,
  ChunkNode,
  SumNode,
  AverageNode,
  MinimumNode,
  MaximumNode,
  ProductNode,
  FlattenNode,
  SaveListNode,
  // dictionary
  GetValueNode,
  UpdateDictionaryNode,
  RemoveDictionaryKeyNode,
  ParseJSONNode,
  ZipDictionaryNode,
  CombineDictionaryNode,
  FilterDictionaryNode,
  ReduceDictionariesNode,
  MakeDictionaryNode,
  ArgMaxNode,
  ToJSONNode,
  ToYAMLNode,
  LoadCSVFileNode,
  SaveCSVFileNode,
  FilterDictByQueryNode,
  FilterDictByNumberNode,
  FilterDictByRangeNode,
  FilterDictRegexNode,
  FilterDictByValueNode,
  // text
  ToStringNode,
  ConcatTextNode,
  JoinTextNode,
  ReplaceTextNode,
  CollectTextNode,
  FormatTextNode,
  TemplateTextNode,
  // text-extra
  SplitTextNode,
  ExtractTextNode,
  ChunkTextNode,
  ExtractRegexNode,
  FindAllRegexNode,
  TextParseJSONNode,
  ExtractJSONNode,
  RegexMatchNode,
  RegexReplaceNode,
  RegexSplitNode,
  RegexValidateNode,
  CompareTextNode,
  EqualsTextNode,
  ToUppercaseNode,
  ToLowercaseNode,
  ToTitlecaseNode,
  CapitalizeTextNode,
  SliceTextNode,
  StartsWithTextNode,
  EndsWithTextNode,
  ContainsTextNode,
  TrimWhitespaceNode,
  CollapseWhitespaceNode,
  IsEmptyTextNode,
  RemovePunctuationNode,
  StripAccentsNode,
  SlugifyNode,
  HasLengthTextNode,
  TruncateTextNode,
  PadTextNode,
  LengthTextNode,
  IndexOfTextNode,
  SurroundWithTextNode,
  CountTokensNode,
  HtmlToTextNode,
  AutomaticSpeechRecognitionNode,
  EmbeddingTextNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  LoadTextAssetsNode,
  FilterStringNode,
  FilterRegexStringNode,
  // numbers
  FilterNumberNode,
  FilterNumberRangeNode,
  // compare
  CompareImagesNode,
} from "../src/index.js";

// Helper to create node, assign props, and run process
async function run(
  NodeClass: new () => any,
  inputs: Record<string, unknown>,
  props?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const node = new NodeClass();
  if (props) node.assign(props);
  return node.process(inputs);
}

// Helper to create node, assign props, initialize, and run process
async function runInit(
  NodeClass: new () => any,
  inputs: Record<string, unknown>,
  props?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const node = new NodeClass();
  if (props) node.assign(props);
  if (node.initialize) await node.initialize();
  return node.process(inputs);
}

// Helper to collect genProcess results
async function collectGen(
  NodeClass: new () => any,
  inputs: Record<string, unknown>,
  props?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const node = new NodeClass();
  if (props) node.assign(props);
  const results: Record<string, unknown>[] = [];
  for await (const item of node.genProcess(inputs)) {
    results.push(item);
  }
  return results;
}

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}

describe("boolean coverage", () => {
  it("ConditionalSwitchNode defaults and process", async () => {
    expectMetadataDefaults(ConditionalSwitchNode);
    expect(await run(ConditionalSwitchNode, { condition: true, if_true: "yes", if_false: "no" }))
      .toEqual({ output: "yes" });
    expect(await run(ConditionalSwitchNode, { condition: false, if_true: "yes", if_false: "no" }))
      .toEqual({ output: "no" });
    expect(await run(ConditionalSwitchNode, {})).toEqual({ output: [] });
  });

  it("LogicalOperatorNode defaults and all operations", async () => {
    const node = new LogicalOperatorNode();
    expect(node.serialize()).toEqual({ a: false, b: false, operation: "and" });
    // and
    expect(await run(LogicalOperatorNode, { a: true, b: true, operation: "and" }))
      .toEqual({ output: true });
    // or
    expect(await run(LogicalOperatorNode, { a: false, b: true, operation: "or" }))
      .toEqual({ output: true });
    // xor
    expect(await run(LogicalOperatorNode, { a: true, b: false, operation: "xor" }))
      .toEqual({ output: true });
    expect(await run(LogicalOperatorNode, { a: true, b: true, operation: "xor" }))
      .toEqual({ output: false });
    // nand
    expect(await run(LogicalOperatorNode, { a: true, b: true, operation: "nand" }))
      .toEqual({ output: false });
    expect(await run(LogicalOperatorNode, { a: true, b: false, operation: "nand" }))
      .toEqual({ output: true });
    // nor
    expect(await run(LogicalOperatorNode, { a: false, b: false, operation: "nor" }))
      .toEqual({ output: true });
    expect(await run(LogicalOperatorNode, { a: true, b: false, operation: "nor" }))
      .toEqual({ output: false });
    // unsupported operation
    await expect(run(LogicalOperatorNode, { a: true, b: false, operation: "bad" }))
      .rejects.toThrow("Unsupported operation");
  });

  it("NotNode defaults and process", async () => {
    const node = new NotNode();
    expect(node.serialize()).toEqual({ value: false });
    expect(await run(NotNode, { value: true })).toEqual({ output: false });
    expect(await run(NotNode, { value: false })).toEqual({ output: true });
    expect(await run(NotNode, {})).toEqual({ output: true });
  });

  it("CompareNode defaults and all comparisons", async () => {
    const node = new CompareNode();
    expect(node.serialize()).toEqual({ a: 0, b: 0, comparison: "==" });
    expect(await run(CompareNode, { a: 5, b: 5, comparison: "==" })).toEqual({ output: true });
    expect(await run(CompareNode, { a: 5, b: 3, comparison: "!=" })).toEqual({ output: true });
    expect(await run(CompareNode, { a: 5, b: 3, comparison: ">" })).toEqual({ output: true });
    expect(await run(CompareNode, { a: 3, b: 5, comparison: "<" })).toEqual({ output: true });
    expect(await run(CompareNode, { a: 5, b: 5, comparison: ">=" })).toEqual({ output: true });
    expect(await run(CompareNode, { a: 5, b: 5, comparison: "<=" })).toEqual({ output: true });
    await expect(run(CompareNode, { a: 5, b: 5, comparison: "bad" }))
      .rejects.toThrow("Unsupported comparison");
  });

  it("IsNoneNode defaults and process", async () => {
    const node = new IsNoneNode();
    expect(node.serialize()).toEqual({ value: null });
    expect(await run(IsNoneNode, { value: null })).toEqual({ output: true });
    expect(await run(IsNoneNode, { value: 0 })).toEqual({ output: false });
  });

  it("IsInNode defaults and edge cases", async () => {
    expectMetadataDefaults(IsInNode);
    expect(await run(IsInNode, { value: "a", options: ["a", "b"] })).toEqual({ output: true });
    expect(await run(IsInNode, { value: "c", options: ["a", "b"] })).toEqual({ output: false });
    // options not an array
    expect(await run(IsInNode, { value: "a", options: "not-array" })).toEqual({ output: false });
  });

  it("AllNode defaults and process", async () => {
    const node = new AllNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(AllNode, { values: [true, true] })).toEqual({ output: true });
    expect(await run(AllNode, { values: [true, false] })).toEqual({ output: false });
    expect(await run(AllNode, { values: [] })).toEqual({ output: true });
  });

  it("SomeNode defaults and process", async () => {
    const node = new SomeNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(SomeNode, { values: [false, true] })).toEqual({ output: true });
    expect(await run(SomeNode, { values: [false, false] })).toEqual({ output: false });
  });
});

describe("compare coverage", () => {
  it("CompareImagesNode defaults", async () => {
    expectMetadataDefaults(CompareImagesNode);
  });

  it("handles base64 string data", async () => {
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const result = await run(CompareImagesNode, {
      image_a: { data },
      image_b: { data },
    });
    expect(result.score).toBe(1);
    expect(result.equal).toBe(true);
  });

  it("handles data URI", async () => {
    const payload = Buffer.from([1, 2, 3]).toString("base64");
    const result = await run(CompareImagesNode, {
      image_a: { uri: `data:image/png;base64,${payload}` },
      image_b: { uri: `data:image/png;base64,${payload}` },
    });
    expect(result.score).toBe(1);
  });

  it("handles one empty image", async () => {
    const result = await run(CompareImagesNode, {
      image_a: { data: new Uint8Array([1, 2, 3]) },
      image_b: {},
    });
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("handles different length images", async () => {
    const result = await run(CompareImagesNode, {
      image_a: { data: new Uint8Array([1, 2, 3, 4]) },
      image_b: { data: new Uint8Array([1, 2, 3]) },
    });
    expect(result.score).toBeLessThan(1);
  });

  it("handles undefined image", async () => {
    const result = await run(CompareImagesNode, {
      image_a: undefined,
      image_b: undefined,
    });
    expect(result.score).toBe(1);
  });
});

describe("list coverage", () => {
  it("LengthNode defaults and non-array", async () => {
    const node = new LengthNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(LengthNode, { values: [1, 2, 3] })).toEqual({ output: 3 });
    expect(await run(LengthNode, { values: "not-array" })).toEqual({ output: 0 });
  });

  it("ListRangeNode defaults and negative step", async () => {
    const node = new ListRangeNode();
    expect(node.serialize()).toEqual({ start: 0, stop: 0, step: 1 });
    expect(await run(ListRangeNode, { start: 0, stop: 5, step: 1 }))
      .toEqual({ output: [0, 1, 2, 3, 4] });
    expect(await run(ListRangeNode, { start: 5, stop: 0, step: -1 }))
      .toEqual({ output: [5, 4, 3, 2, 1] });
    await expect(run(ListRangeNode, { start: 0, stop: 5, step: 0 }))
      .rejects.toThrow("step must not be 0");
  });

  it("GenerateSequenceNode genProcess negative step", async () => {
    const results = await collectGen(GenerateSequenceNode, { start: 5, stop: 0, step: -1 });
    expect(results).toEqual([
      { output: 5 }, { output: 4 }, { output: 3 }, { output: 2 }, { output: 1 },
    ]);
    await expect(collectGen(GenerateSequenceNode, { start: 0, stop: 5, step: 0 }))
      .rejects.toThrow("step must not be 0");
    // process returns empty
    expect(await run(GenerateSequenceNode, {})).toEqual({});
  });

  it("GenerateSequenceNode genProcess positive step", async () => {
    const results = await collectGen(GenerateSequenceNode, { start: 0, stop: 3, step: 1 });
    expect(results).toEqual([{ output: 0 }, { output: 1 }, { output: 2 }]);
  });

  it("SliceNode defaults and step variants", async () => {
    const node = new SliceNode();
    expect(node.serialize()).toEqual({ values: [], start: 0, stop: 0, step: 1 });
    // step=0 error
    await expect(run(SliceNode, { values: [1,2,3], step: 0 })).rejects.toThrow("slice step cannot be zero");
    // step > 1
    expect(await run(SliceNode, { values: [0,1,2,3,4,5], start: 0, stop: 6, step: 2 }))
      .toEqual({ output: [0, 2, 4] });
    // negative step: effectiveStop=undefined (stop=0), so normStop = step>0?len:-1 = -1
    // loop: i = min(4, 4)=4; i > max(-1, -1)=-1 => 4,3,2,1,0
    expect(await run(SliceNode, { values: [0,1,2,3,4], start: 4, stop: 0, step: -1 }))
      .toEqual({ output: [4, 3, 2, 1, 0] });
    // step=1 with stop=0 (slice to end)
    expect(await run(SliceNode, { values: [1,2,3], start: 1, stop: 0, step: 1 }))
      .toEqual({ output: [2, 3] });
    // negative start with step > 1
    expect(await run(SliceNode, { values: [0,1,2,3,4], start: -3, stop: 5, step: 2 }))
      .toEqual({ output: [2, 4] });
    // negative stop with step > 1
    expect(await run(SliceNode, { values: [0,1,2,3,4], start: 0, stop: -1, step: 2 }))
      .toEqual({ output: [0, 2] });
  });

  it("SelectElementsNode defaults", async () => {
    const node = new SelectElementsNode();
    expect(node.serialize()).toEqual({ values: [], indices: [] });
  });

  it("GetElementNode defaults and non-array error", async () => {
    const node = new GetElementNode();
    expect(node.serialize()).toEqual({ values: [], index: 0 });
    await expect(run(GetElementNode, { values: "not-array", index: 0 }))
      .rejects.toThrow("values must be a list");
  });

  it("AppendNode defaults and non-array values", async () => {
    expectMetadataDefaults(AppendNode);
    expect(await run(AppendNode, { values: [1,2], value: 3 })).toEqual({ output: [1, 2, 3] });
    // non-array values => wrapped
    expect(await run(AppendNode, { values: "single", value: "x" })).toEqual({ output: ["single", "x"] });
  });

  it("ExtendNode defaults", async () => {
    const node = new ExtendNode();
    expect(node.serialize()).toEqual({ values: [], other_values: [] });
    expect(await run(ExtendNode, { values: [1], other_values: [2] })).toEqual({ output: [1, 2] });
  });

  it("DedupeNode defaults", async () => {
    const node = new DedupeNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(DedupeNode, { values: [1, 2, 2, 3] })).toEqual({ output: [1, 2, 3] });
  });

  it("ReverseNode defaults", async () => {
    const node = new ReverseNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(ReverseNode, { values: [1, 2, 3] })).toEqual({ output: [3, 2, 1] });
  });

  it("RandomizeNode defaults and shuffles", async () => {
    const node = new RandomizeNode();
    expect(node.serialize()).toEqual({ values: [] });
    const result = await run(RandomizeNode, { values: [1, 2, 3, 4, 5] });
    expect((result.output as number[]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("SortNode defaults and descending", async () => {
    const node = new SortNode();
    expect(node.serialize()).toEqual({ values: [], order: "ascending" });
    expect(await run(SortNode, { values: [3, 1, 2], order: "ascending" }))
      .toEqual({ output: [1, 2, 3] });
    expect(await run(SortNode, { values: [3, 1, 2], order: "descending" }))
      .toEqual({ output: [3, 2, 1] });
  });

  it("IntersectionNode defaults", async () => {
    const node = new IntersectionNode();
    expect(node.serialize()).toEqual({ list1: [], list2: [] });
    expect(await run(IntersectionNode, { list1: [1, 2, 3], list2: [2, 3, 4] }))
      .toEqual({ output: [2, 3] });
  });

  it("UnionNode defaults", async () => {
    const node = new UnionNode();
    expect(node.serialize()).toEqual({ list1: [], list2: [] });
    expect(await run(UnionNode, { list1: [1, 2], list2: [2, 3] }))
      .toEqual({ output: [1, 2, 3] });
  });

  it("DifferenceNode defaults", async () => {
    const node = new DifferenceNode();
    expect(node.serialize()).toEqual({ list1: [], list2: [] });
    expect(await run(DifferenceNode, { list1: [1, 2, 3], list2: [2] }))
      .toEqual({ output: [1, 3] });
  });

  it("ChunkNode defaults and error", async () => {
    const node = new ChunkNode();
    expect(node.serialize()).toEqual({ values: [], chunk_size: 1 });
    expect(await run(ChunkNode, { values: [1, 2, 3, 4], chunk_size: 2 }))
      .toEqual({ output: [[1, 2], [3, 4]] });
    await expect(run(ChunkNode, { values: [1], chunk_size: 0 }))
      .rejects.toThrow("chunk_size must be > 0");
  });

  it("SumNode defaults and errors", async () => {
    const node = new SumNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(SumNode, { values: [1, 2, 3] })).toEqual({ output: 6 });
    await expect(run(SumNode, { values: [] })).rejects.toThrow("Cannot sum empty list");
    await expect(run(SumNode, { values: ["a", "b"] })).rejects.toThrow("All values must be numbers");
  });

  it("AverageNode defaults and errors", async () => {
    const node = new AverageNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(AverageNode, { values: [2, 4] })).toEqual({ output: 3 });
    await expect(run(AverageNode, { values: [] })).rejects.toThrow("Cannot average empty list");
    await expect(run(AverageNode, { values: ["x"] })).rejects.toThrow("All values must be numbers");
  });

  it("MinimumNode defaults and errors", async () => {
    const node = new MinimumNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(MinimumNode, { values: [3, 1, 2] })).toEqual({ output: 1 });
    await expect(run(MinimumNode, { values: [] })).rejects.toThrow("Cannot find minimum of empty list");
    await expect(run(MinimumNode, { values: [NaN] })).rejects.toThrow("All values must be numbers");
  });

  it("MaximumNode defaults and errors", async () => {
    const node = new MaximumNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(MaximumNode, { values: [3, 1, 2] })).toEqual({ output: 3 });
    await expect(run(MaximumNode, { values: [] })).rejects.toThrow("Cannot find maximum of empty list");
    await expect(run(MaximumNode, { values: [Infinity] })).rejects.toThrow("All values must be numbers");
  });

  it("ProductNode defaults and errors", async () => {
    const node = new ProductNode();
    expect(node.serialize()).toEqual({ values: [] });
    expect(await run(ProductNode, { values: [2, 3, 4] })).toEqual({ output: 24 });
    await expect(run(ProductNode, { values: [] })).rejects.toThrow("Cannot calculate product of empty list");
    await expect(run(ProductNode, { values: [null] })).rejects.toThrow("All values must be numbers");
  });

  it("FlattenNode defaults and depth limit and error", async () => {
    const node = new FlattenNode();
    expect(node.serialize()).toEqual({ values: [], max_depth: -1 });
    expect(await run(FlattenNode, { values: [[1, [2]], [3]] })).toEqual({ output: [1, 2, 3] });
    expect(await run(FlattenNode, { values: [[1, [2]], [3]], max_depth: 1 }))
      .toEqual({ output: [1, [2], 3] });
    await expect(run(FlattenNode, { values: "not-array" })).rejects.toThrow("Input must be a list");
  });

  it("SaveListNode defaults and writes file", async () => {
    const node = new SaveListNode();
    expect(node.serialize()).toEqual({ values: [], name: "text.txt" });
    const tmp = join(tmpdir(), `savelist-test-${Date.now()}.txt`);
    await run(SaveListNode, { values: ["a", "b", "c"], name: tmp });
    const content = await fs.readFile(tmp, "utf-8");
    expect(content).toBe("a\nb\nc");
    await fs.unlink(tmp);
  });

  it("isNumberList rejects non-finite", async () => {
    // NaN and Infinity fail isNumberList
    await expect(run(SumNode, { values: [NaN] })).rejects.toThrow("All values must be numbers");
    await expect(run(SumNode, { values: [Infinity] })).rejects.toThrow("All values must be numbers");
  });
});

describe("dictionary coverage", () => {
  it("GetValueNode defaults", async () => {
    expectMetadataDefaults(GetValueNode);
  });

  it("UpdateDictionaryNode defaults", async () => {
    const node = new UpdateDictionaryNode();
    expect(node.serialize()).toEqual({ dictionary: {}, new_pairs: {} });
  });

  it("RemoveDictionaryKeyNode defaults", async () => {
    const node = new RemoveDictionaryKeyNode();
    expect(node.serialize()).toEqual({ dictionary: {}, key: "" });
  });

  it("ParseJSONNode defaults and array rejection", async () => {
    const node = new ParseJSONNode();
    expect(node.serialize()).toEqual({ json_string: "" });
    await expect(run(ParseJSONNode, { json_string: "[1,2,3]" }))
      .rejects.toThrow("Input JSON is not a dictionary");
    await expect(run(ParseJSONNode, { json_string: '"hello"' }))
      .rejects.toThrow("Input JSON is not a dictionary");
  });

  it("ZipDictionaryNode defaults and non-array inputs", async () => {
    const node = new ZipDictionaryNode();
    expect(node.serialize()).toEqual({ keys: [], values: [] });
    expect(await run(ZipDictionaryNode, { keys: "not-array", values: "not-array" }))
      .toEqual({ output: {} });
  });

  it("CombineDictionaryNode defaults", async () => {
    const node = new CombineDictionaryNode();
    expect(node.serialize()).toEqual({ dict_a: {}, dict_b: {} });
  });

  it("FilterDictionaryNode defaults and non-array keys", async () => {
    const node = new FilterDictionaryNode();
    expect(node.serialize()).toEqual({ dictionary: {}, keys: [] });
    expect(await run(FilterDictionaryNode, { dictionary: { a: 1 }, keys: "not-array" }))
      .toEqual({ output: {} });
  });

  it("ReduceDictionariesNode defaults, value_field, and conflicts", async () => {
    const node = new ReduceDictionariesNode();
    expect(node.serialize()).toEqual({
      dictionaries: [], key_field: "", value_field: "",
      conflict_resolution: "first",
    });

    // With value_field
    const result = await run(ReduceDictionariesNode, {
      dictionaries: [
        { name: "a", val: 1 },
        { name: "b", val: 2 },
      ],
      key_field: "name",
      value_field: "val",
    });
    expect(result.output).toEqual({ a: 1, b: 2 });

    // Without value_field -> remainder dict
    const result2 = await run(ReduceDictionariesNode, {
      dictionaries: [{ name: "a", x: 1, y: 2 }],
      key_field: "name",
      value_field: "",
    });
    expect(result2.output).toEqual({ a: { x: 1, y: 2 } });

    // Missing key_field
    await expect(run(ReduceDictionariesNode, {
      dictionaries: [{ other: "x" }],
      key_field: "name",
    })).rejects.toThrow("Key field 'name' not found");

    // Missing value_field
    await expect(run(ReduceDictionariesNode, {
      dictionaries: [{ name: "a" }],
      key_field: "name",
      value_field: "missing",
    })).rejects.toThrow("Value field 'missing' not found");

    // Conflict resolution: last
    const result3 = await run(ReduceDictionariesNode, {
      dictionaries: [
        { name: "a", val: 1 },
        { name: "a", val: 2 },
      ],
      key_field: "name",
      value_field: "val",
      conflict_resolution: "last",
    });
    expect(result3.output).toEqual({ a: 2 });

    // Conflict resolution: first (duplicate skipped)
    const result4 = await run(ReduceDictionariesNode, {
      dictionaries: [
        { name: "a", val: 1 },
        { name: "a", val: 2 },
      ],
      key_field: "name",
      value_field: "val",
      conflict_resolution: "first",
    });
    expect(result4.output).toEqual({ a: 1 });

    // Conflict resolution: error
    await expect(run(ReduceDictionariesNode, {
      dictionaries: [
        { name: "a", val: 1 },
        { name: "a", val: 2 },
      ],
      key_field: "name",
      value_field: "val",
      conflict_resolution: "error",
    })).rejects.toThrow("Duplicate key found: a");
  });

  it("MakeDictionaryNode defaults and process", async () => {
    const result = await run(MakeDictionaryNode, { x: 1 }, { y: 2 });
    expect(result.output).toEqual({ x: 1 });
  });

  it("ArgMaxNode defaults", async () => {
    const node = new ArgMaxNode();
    expect(node.serialize()).toEqual({ scores: {} });
  });

  it("ToJSONNode defaults", async () => {
    const node = new ToJSONNode();
    expect(node.serialize()).toEqual({ dictionary: {} });
  });

  it("ToYAMLNode defaults and nested objects", async () => {
    const node = new ToYAMLNode();
    expect(node.serialize()).toEqual({ dictionary: {} });
    // Test with nested object, array, null, boolean, number
    const result = await run(ToYAMLNode, {
      dictionary: {
        name: "test",
        count: 42,
        active: true,
        tags: ["a", "b"],
        nested: { key: "val" },
        empty: null,
      },
    });
    const yaml = result.output as string;
    expect(yaml).toContain("name:");
    expect(yaml).toContain("42");
    expect(yaml).toContain("true");
    expect(yaml).toContain("- ");
    expect(yaml).toContain("null");
  });

  it("LoadCSVFileNode defaults and empty path error", async () => {
    const node = new LoadCSVFileNode();
    expect(node.serialize()).toEqual({ path: "" });
    await expect(run(LoadCSVFileNode, { path: "" })).rejects.toThrow("path cannot be empty");
  });

  it("LoadCSVFileNode reads CSV file", async () => {
    const tmp = join(tmpdir(), `loadcsv-test-${Date.now()}.csv`);
    await fs.writeFile(tmp, "name,age\nalice,30\nbob,25", "utf-8");
    const result = await run(LoadCSVFileNode, { path: tmp });
    expect(result.output).toEqual([
      { name: "alice", age: "30" },
      { name: "bob", age: "25" },
    ]);
    await fs.unlink(tmp);
  });

  it("LoadCSVFileNode handles empty CSV", async () => {
    const tmp = join(tmpdir(), `loadcsv-empty-${Date.now()}.csv`);
    await fs.writeFile(tmp, "", "utf-8");
    const result = await run(LoadCSVFileNode, { path: tmp });
    expect(result.output).toEqual([]);
    await fs.unlink(tmp);
  });

  it("SaveCSVFileNode defaults and errors", async () => {
    const node = new SaveCSVFileNode();
    expect(node.serialize()).toEqual({ data: [], folder: "", filename: "" });
    await expect(run(SaveCSVFileNode, { data: [], folder: "f", filename: "f.csv" }))
      .rejects.toThrow("'data' field cannot be empty");
    await expect(run(SaveCSVFileNode, { data: [{ a: 1 }], folder: "", filename: "f.csv" }))
      .rejects.toThrow("folder cannot be empty");
    await expect(run(SaveCSVFileNode, { data: [{ a: 1 }], folder: "/tmp", filename: "" }))
      .rejects.toThrow("filename cannot be empty");
  });

  it("SaveCSVFileNode writes CSV", async () => {
    const tmp = join(tmpdir(), `savecsv-test-${Date.now()}`);
    const result = await run(SaveCSVFileNode, {
      data: [{ name: "alice", age: 30 }],
      folder: tmp,
      filename: "out.csv",
    });
    const content = await fs.readFile(result.output as string, "utf-8");
    expect(content).toContain("name,age");
    expect(content).toContain("alice,30");
    await fs.rm(tmp, { recursive: true });
  });

  it("FilterDictByQueryNode defaults, initialize, condition updates", async () => {
    const node = new FilterDictByQueryNode();
    expect(node.serialize()).toEqual({ value: {}, condition: "" });

    // Initialize and test with condition
    node.assign({ condition: "age > 20" });
    await node.initialize();

    // Update condition via input
    expect(await node.process({ condition: "age > 30" })).toEqual({});

    // Process with value matching
    const result = await node.process({ value: { age: 35 } });
    expect(result).toEqual({ output: { age: 35 } });

    // Process with value not matching
    const result2 = await node.process({ value: { age: 25 } });
    expect(result2).toEqual({});

    // No value input
    expect(await node.process({})).toEqual({});

    // Empty condition -> pass through
    node.assign({ condition: "" });
    await node.initialize();
    await node.process({ condition: "" });
    const result3 = await node.process({ value: { x: 1 } });
    expect(result3).toEqual({ output: { x: 1 } });

    // Condition that causes runtime error -> caught, not passed
    await node.process({ condition: "nonexistentVar.foo" });
    const result4 = await node.process({ value: { x: 1 } });
    expect(result4).toEqual({});
  });

  it("FilterDictByNumberNode defaults, initialize, all filter types", async () => {
    const node = new FilterDictByNumberNode();
    expect(node.serialize()).toEqual({ value: {}, key: "", filter_type: "greater_than", compare_value: 0 });

    node.assign({ key: "n", filter_type: "greater_than", compare_value: 5 });
    await node.initialize();

    // key update
    expect(await node.process({ key: "val" })).toEqual({});
    // filter_type update
    expect(await node.process({ filter_type: "less_than" })).toEqual({});
    // compare_value update
    expect(await node.process({ compare_value: 10 })).toEqual({});
    // no value -> empty
    expect(await node.process({})).toEqual({});

    // key not in dict
    expect(await node.process({ value: { other: 1 } })).toEqual({});
    // non-number value
    expect(await node.process({ value: { val: "string" } })).toEqual({});

    // Test all filter types
    await node.process({ key: "n" });
    await node.process({ compare_value: 5 });

    for (const [filterType, value, expected] of [
      ["greater_than", 6, true],
      ["greater_than", 4, false],
      ["less_than", 4, true],
      ["less_than", 6, false],
      ["equal_to", 5, true],
      ["equal_to", 4, false],
      ["even", 4, true],
      ["even", 3, false],
      ["odd", 3, true],
      ["odd", 4, false],
      ["positive", 1, true],
      ["positive", -1, false],
      ["negative", -1, true],
      ["negative", 1, false],
    ] as const) {
      await node.process({ filter_type: filterType });
      const result = await node.process({ value: { n: value } });
      if (expected) {
        expect(result).toEqual({ output: { n: value } });
      } else {
        expect(result).toEqual({});
      }
    }

    // Default/unknown filter type
    await node.process({ filter_type: "unknown_type" });
    expect(await node.process({ value: { n: 5 } })).toEqual({});
  });

  it("FilterDictByRangeNode defaults, initialize, all input paths", async () => {
    const node = new FilterDictByRangeNode();
    expect(node.serialize()).toEqual({ value: {}, key: "", min_value: 0, max_value: 0, inclusive: true });

    node.assign({ key: "n", min_value: 1, max_value: 10, inclusive: true });
    await node.initialize();

    // key update
    expect(await node.process({ key: "val" })).toEqual({});
    // min_value update
    expect(await node.process({ min_value: 2 })).toEqual({});
    // max_value update
    expect(await node.process({ max_value: 8 })).toEqual({});
    // inclusive update
    expect(await node.process({ inclusive: false })).toEqual({});
    // no value input
    expect(await node.process({})).toEqual({});

    // key not in dict
    expect(await node.process({ value: { other: 5 } })).toEqual({});
    // non-number value
    expect(await node.process({ value: { val: "hello" } })).toEqual({});

    // In range (exclusive)
    const r1 = await node.process({ value: { val: 5 } });
    expect(r1).toEqual({ output: { val: 5 } });

    // Out of range
    const r2 = await node.process({ value: { val: 1 } });
    expect(r2).toEqual({});

    // Switch to inclusive
    await node.process({ inclusive: true });
    const r3 = await node.process({ value: { val: 2 } });
    expect(r3).toEqual({ output: { val: 2 } });
  });

  it("FilterDictRegexNode defaults, initialize, all input paths", async () => {
    const node = new FilterDictRegexNode();
    expect(node.serialize()).toEqual({ value: {}, key: "", pattern: "", full_match: false });

    node.assign({ key: "name", pattern: "^a", full_match: false });
    await node.initialize();

    // key update
    expect(await node.process({ key: "title" })).toEqual({});
    // pattern update
    expect(await node.process({ pattern: "^b" })).toEqual({});
    // full_match update
    expect(await node.process({ full_match: true })).toEqual({});
    // no value
    expect(await node.process({})).toEqual({});
    // key not in dict
    expect(await node.process({ value: { other: "x" } })).toEqual({});

    // full match test
    await node.process({ pattern: "^bob$" });
    await node.process({ key: "name" });
    const r1 = await node.process({ value: { name: "bob" } });
    expect(r1).toEqual({ output: { name: "bob" } });
    const r2 = await node.process({ value: { name: "bobby" } });
    expect(r2).toEqual({});

    // partial match
    await node.process({ full_match: false });
    await node.process({ pattern: "ob" });
    const r3 = await node.process({ value: { name: "bobby" } });
    expect(r3).toEqual({ output: { name: "bobby" } });

    // invalid regex
    await node.process({ pattern: "[invalid" });
    const r4 = await node.process({ value: { name: "test" } });
    expect(r4).toEqual({});
  });

  it("FilterDictByValueNode defaults, initialize, all filter types", async () => {
    const node = new FilterDictByValueNode();
    expect(node.serialize()).toEqual({ value: {}, key: "", filter_type: "contains", criteria: "" });

    node.assign({ key: "name", filter_type: "contains", criteria: "ob" });
    await node.initialize();

    // key update
    expect(await node.process({ key: "title" })).toEqual({});
    // filter_type update
    expect(await node.process({ filter_type: "starts_with" })).toEqual({});
    // criteria update
    expect(await node.process({ criteria: "B" })).toEqual({});
    // no value
    expect(await node.process({})).toEqual({});
    // key not in dict
    expect(await node.process({ value: { other: "x" } })).toEqual({});

    // Test all filter types
    await node.process({ key: "name" });

    // contains
    await node.process({ filter_type: "contains" });
    await node.process({ criteria: "ob" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "alice" } })).toEqual({});

    // starts_with
    await node.process({ filter_type: "starts_with" });
    await node.process({ criteria: "bo" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "rob" } })).toEqual({});

    // ends_with
    await node.process({ filter_type: "ends_with" });
    await node.process({ criteria: "ob" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "bo" } })).toEqual({});

    // equals
    await node.process({ filter_type: "equals" });
    await node.process({ criteria: "bob" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "bobby" } })).toEqual({});

    // type_is
    await node.process({ filter_type: "type_is" });
    await node.process({ criteria: "string" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    await node.process({ criteria: "number" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({});

    // length_greater
    await node.process({ filter_type: "length_greater" });
    await node.process({ criteria: "2" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "ab" } })).toEqual({});
    // invalid criteria for length
    await node.process({ criteria: "abc" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({});

    // length_less
    await node.process({ filter_type: "length_less" });
    await node.process({ criteria: "4" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "bobby" } })).toEqual({});

    // exact_length
    await node.process({ filter_type: "exact_length" });
    await node.process({ criteria: "3" });
    expect(await node.process({ value: { name: "bob" } })).toEqual({ output: { name: "bob" } });
    expect(await node.process({ value: { name: "bo" } })).toEqual({});

    // value without length property
    await node.process({ filter_type: "length_greater" });
    await node.process({ criteria: "1" });
    expect(await node.process({ value: { name: null } })).toEqual({});

    // default/unknown filter type
    await node.process({ filter_type: "unknown_type" });
    expect(await node.process({ value: { name: "x" } })).toEqual({});
  });

  it("asRecord handles non-objects", async () => {
    // Pass arrays and primitives as dictionary - should become {}
    expect(await run(GetValueNode, { dictionary: [1, 2, 3], key: "0" }))
      .toEqual({ output: [] });
    expect(await run(GetValueNode, { dictionary: "string", key: "0" }))
      .toEqual({ output: [] });
    expect(await run(GetValueNode, { dictionary: null, key: "x" }))
      .toEqual({ output: [] });
  });
});

describe("text coverage", () => {
  it("ToStringNode defaults", async () => {
    expectMetadataDefaults(ToStringNode);
  });

  it("ConcatTextNode defaults", async () => {
    const node = new ConcatTextNode();
    expect(node.serialize()).toEqual({ a: "", b: "" });
  });

  it("JoinTextNode defaults and empty/non-array", async () => {
    const node = new JoinTextNode();
    expect(node.serialize()).toEqual({ strings: [], separator: "" });
    expect(await run(JoinTextNode, { strings: "not-array" })).toEqual({ output: "" });
    expect(await run(JoinTextNode, { strings: [] })).toEqual({ output: "" });
  });

  it("ReplaceTextNode defaults", async () => {
    const node = new ReplaceTextNode();
    expect(node.serialize()).toEqual({ text: "", old: "", new: "" });
  });

  it("CollectTextNode defaults, initialize, and accumulation", async () => {
    const node = new CollectTextNode();
    expect(node.serialize()).toEqual({ input_item: "", separator: "" });
    await node.initialize();
    await node.process({ input_item: "hello" });
    await node.process({ input_item: "world" });
    const result = await node.process({ separator: ", " });
    // separator applies at join time, and "separator" input also triggers process
    expect(result.output).toBe("hello, world");
  });

  it("FormatTextNode defaults", async () => {
    const node = new FormatTextNode();
    expect(node.serialize()).toEqual({ template: "" });
  });

  it("TemplateTextNode defaults and non-object values", async () => {
    const node = new TemplateTextNode();
    expect(node.serialize()).toEqual({ string: "", values: {} });
    // values is not an object
    expect(await run(TemplateTextNode, { string: "hello {{ name }}", values: "not-object" }))
      .toEqual({ output: "hello {{ name }}" });
  });
});

describe("text-extra coverage", () => {
  it("SplitTextNode defaults", async () => {
    const node = new SplitTextNode();
    expect(node.serialize()).toEqual({ text: "", delimiter: "," });
  });

  it("ExtractTextNode defaults", async () => {
    const node = new ExtractTextNode();
    expect(node.serialize()).toEqual({ text: "", start: 0, end: 0 });
  });

  it("ChunkTextNode defaults and error", async () => {
    const node = new ChunkTextNode();
    expect(node.serialize()).toEqual({ text: "", length: 100, overlap: 0, separator: " " });
    await expect(run(ChunkTextNode, { text: "hello world", length: 1, overlap: 2 }))
      .rejects.toThrow("Invalid chunk parameters");
  });

  it("ExtractRegexNode defaults and process", async () => {
    const node = new ExtractRegexNode();
    expect(node.serialize()).toEqual({ text: "", regex: "", dotall: false, ignorecase: false, multiline: false });
    // With capture groups
    const r1 = await run(ExtractRegexNode, { text: "hello 42 world", regex: "(\\d+)" });
    expect(r1.output).toEqual(["42"]);
    // No match
    const r2 = await run(ExtractRegexNode, { text: "hello", regex: "(\\d+)" });
    expect(r2.output).toEqual([]);
    // With flags
    const r3 = await run(ExtractRegexNode, {
      text: "Hello", regex: "(hello)", ignorecase: true,
    });
    expect(r3.output).toEqual(["Hello"]);
  });

  it("FindAllRegexNode defaults and process", async () => {
    const node = new FindAllRegexNode();
    expect(node.serialize()).toEqual({ text: "", regex: "", dotall: false, ignorecase: false, multiline: false });
    const r = await run(FindAllRegexNode, { text: "cat bat hat", regex: "\\w+at" });
    expect(r.output).toEqual(["cat", "bat", "hat"]);
  });

  it("TextParseJSONNode defaults", async () => {
    const node = new TextParseJSONNode();
    expect(node.serialize()).toEqual({ text: "" });
    const r = await run(TextParseJSONNode, { text: '{"a":1}' });
    expect(r.output).toEqual({ a: 1 });
  });

  it("ExtractJSONNode defaults and find_all", async () => {
    const node = new ExtractJSONNode();
    expect(node.serialize()).toEqual({ text: "", json_path: "$.*", find_all: false });
    // find_all
    const r = await run(ExtractJSONNode, { text: '{"a":1,"b":2}', json_path: "$.*", find_all: true });
    expect(r.output).toEqual([1, 2]);
    // no match throws
    await expect(run(ExtractJSONNode, { text: '{}', json_path: "$.missing" }))
      .rejects.toThrow("JSONPath did not match");
  });

  it("RegexMatchNode defaults and group=null", async () => {
    const node = new RegexMatchNode();
    expect(node.serialize()).toEqual({ text: "", pattern: "", group: 0 });
    // group=null returns all full matches
    const r = await run(RegexMatchNode, { text: "cat bat", pattern: "\\w+at", group: null });
    expect(r.output).toEqual(["cat", "bat"]);
  });

  it("RegexReplaceNode defaults and limited count", async () => {
    const node = new RegexReplaceNode();
    expect(node.serialize()).toEqual({ text: "", pattern: "", replacement: "", count: 0 });
    // count > 0 limits replacements
    const r = await run(RegexReplaceNode, {
      text: "aaa", pattern: "a", replacement: "b", count: 2,
    });
    expect(r.output).toBe("bba");
    // count=0 replaces all
    const r2 = await run(RegexReplaceNode, {
      text: "aaa", pattern: "a", replacement: "b", count: 0,
    });
    expect(r2.output).toBe("bbb");
  });

  it("RegexSplitNode defaults and maxsplit", async () => {
    const node = new RegexSplitNode();
    expect(node.serialize()).toEqual({ text: "", pattern: "", maxsplit: 0 });
    // maxsplit > 0
    const r = await run(RegexSplitNode, { text: "a-b-c", pattern: "-", maxsplit: 1 });
    expect(r.output).toEqual(["a", "b", "c"]);
    // maxsplit = 0
    const r2 = await run(RegexSplitNode, { text: "a-b-c", pattern: "-", maxsplit: 0 });
    expect(r2.output).toEqual(["a", "b", "c"]);
  });

  it("RegexValidateNode defaults", async () => {
    const node = new RegexValidateNode();
    expect(node.serialize()).toEqual({ text: "", pattern: "" });
    expect(await run(RegexValidateNode, { text: "abc123", pattern: "^\\w+$" }))
      .toEqual({ output: true });
  });

  it("CompareTextNode defaults and all paths", async () => {
    const node = new CompareTextNode();
    expect(node.serialize()).toEqual({ text_a: "", text_b: "", case_sensitive: true, trim_whitespace: false });
    // less
    expect(await run(CompareTextNode, { text_a: "a", text_b: "b" })).toEqual({ output: "less" });
    // greater
    expect(await run(CompareTextNode, { text_a: "b", text_b: "a" })).toEqual({ output: "greater" });
    // equal with case insensitive
    expect(await run(CompareTextNode, { text_a: "ABC", text_b: "abc", case_sensitive: false }))
      .toEqual({ output: "equal" });
    // with trim
    expect(await run(CompareTextNode, { text_a: "  a  ", text_b: "a", trim_whitespace: true }))
      .toEqual({ output: "equal" });
  });

  it("EqualsTextNode defaults", async () => {
    const node = new EqualsTextNode();
    expect(node.serialize()).toEqual({ text_a: "", text_b: "", case_sensitive: true, trim_whitespace: false });
    expect(await run(EqualsTextNode, { text_a: "a", text_b: "a" })).toEqual({ output: true });
    expect(await run(EqualsTextNode, { text_a: "a", text_b: "b" })).toEqual({ output: false });
  });

  it("ToUppercaseNode defaults", async () => {
    const node = new ToUppercaseNode();
    expect(node.serialize()).toEqual({ text: "" });
    expect(await run(ToUppercaseNode, { text: "hello" })).toEqual({ output: "HELLO" });
  });

  it("ToLowercaseNode defaults", async () => {
    const node = new ToLowercaseNode();
    expect(node.serialize()).toEqual({ text: "" });
    expect(await run(ToLowercaseNode, { text: "HELLO" })).toEqual({ output: "hello" });
  });

  it("ToTitlecaseNode defaults", async () => {
    const node = new ToTitlecaseNode();
    expect(node.serialize()).toEqual({ text: "" });
    expect(await run(ToTitlecaseNode, { text: "hello world" })).toEqual({ output: "Hello World" });
  });

  it("CapitalizeTextNode defaults and empty", async () => {
    const node = new CapitalizeTextNode();
    expect(node.serialize()).toEqual({ text: "" });
    expect(await run(CapitalizeTextNode, { text: "hello WORLD" })).toEqual({ output: "Hello world" });
    expect(await run(CapitalizeTextNode, { text: "" })).toEqual({ output: "" });
  });

  it("SliceTextNode defaults and step variants", async () => {
    const node = new SliceTextNode();
    expect(node.serialize()).toEqual({ text: "", start: 0, stop: 0, step: 1 });
    // step=0 error
    await expect(run(SliceTextNode, { text: "hello", step: 0 })).rejects.toThrow("slice step cannot be zero");
    // step=1
    expect(await run(SliceTextNode, { text: "hello", start: 1, stop: 4 })).toEqual({ output: "ell" });
    // step > 1
    expect(await run(SliceTextNode, { text: "abcdef", start: 0, stop: 6, step: 2 })).toEqual({ output: "ace" });
    // negative step
    expect(await run(SliceTextNode, { text: "abcde", start: 4, stop: 0, step: -1 })).toEqual({ output: "edcb" });
  });

  it("StartsWithTextNode defaults", async () => {
    const node = new StartsWithTextNode();
    expect(node.serialize()).toEqual({ text: "", prefix: "" });
    expect(await run(StartsWithTextNode, { text: "hello", prefix: "hel" })).toEqual({ output: true });
  });

  it("EndsWithTextNode defaults", async () => {
    const node = new EndsWithTextNode();
    expect(node.serialize()).toEqual({ text: "", suffix: "" });
    expect(await run(EndsWithTextNode, { text: "hello", suffix: "llo" })).toEqual({ output: true });
  });

  it("ContainsTextNode defaults and all modes", async () => {
    const node = new ContainsTextNode();
    expect(node.serialize()).toEqual({
      text: "", substring: "", search_values: [], case_sensitive: true, match_mode: "any",
    });
    // any mode with search_values
    expect(await run(ContainsTextNode, {
      text: "hello world", search_values: ["hello", "foo"], match_mode: "any",
    })).toEqual({ output: true });
    // all mode
    expect(await run(ContainsTextNode, {
      text: "hello world", search_values: ["hello", "world"], match_mode: "all",
    })).toEqual({ output: true });
    expect(await run(ContainsTextNode, {
      text: "hello world", search_values: ["hello", "foo"], match_mode: "all",
    })).toEqual({ output: false });
    // none mode
    expect(await run(ContainsTextNode, {
      text: "hello world", search_values: ["foo", "bar"], match_mode: "none",
    })).toEqual({ output: true });
    // empty targets
    expect(await run(ContainsTextNode, { text: "hello", search_values: [] }))
      .toEqual({ output: false });
    // case insensitive
    expect(await run(ContainsTextNode, {
      text: "Hello", substring: "hello", case_sensitive: false,
    })).toEqual({ output: true });
  });

  it("TrimWhitespaceNode defaults and trim_start/end variants", async () => {
    const node = new TrimWhitespaceNode();
    expect(node.serialize()).toEqual({ text: "", trim_start: true, trim_end: true });
    expect(await run(TrimWhitespaceNode, { text: "  hello  ", trim_start: true, trim_end: true }))
      .toEqual({ output: "hello" });
    expect(await run(TrimWhitespaceNode, { text: "  hello  ", trim_start: true, trim_end: false }))
      .toEqual({ output: "hello  " });
    expect(await run(TrimWhitespaceNode, { text: "  hello  ", trim_start: false, trim_end: true }))
      .toEqual({ output: "  hello" });
    expect(await run(TrimWhitespaceNode, { text: "  hello  ", trim_start: false, trim_end: false }))
      .toEqual({ output: "  hello  " });
  });

  it("CollapseWhitespaceNode defaults and preserve_newlines", async () => {
    const node = new CollapseWhitespaceNode();
    expect(node.serialize()).toEqual({ text: "", preserve_newlines: false, replacement: " ", trim_edges: true });
    expect(await run(CollapseWhitespaceNode, { text: "  hello   world  " }))
      .toEqual({ output: "hello world" });
    expect(await run(CollapseWhitespaceNode, { text: "hello  \n  world", preserve_newlines: true }))
      .toEqual({ output: "hello \n world" });
    expect(await run(CollapseWhitespaceNode, { text: "  hello  ", trim_edges: false }))
      .toEqual({ output: " hello " });
  });

  it("IsEmptyTextNode defaults and trim", async () => {
    const node = new IsEmptyTextNode();
    expect(node.serialize()).toEqual({ text: "", trim_whitespace: true });
    expect(await run(IsEmptyTextNode, { text: "   ", trim_whitespace: true })).toEqual({ output: true });
    expect(await run(IsEmptyTextNode, { text: "   ", trim_whitespace: false })).toEqual({ output: false });
  });

  it("RemovePunctuationNode defaults", async () => {
    const node = new RemovePunctuationNode();
    expect(node.serialize()).toBeDefined();
    // Use explicit punctuation to avoid regex issues with default
    expect(await run(RemovePunctuationNode, { text: "hello, world!", punctuation: ",!" }))
      .toEqual({ output: "hello world" });
  });

  it("StripAccentsNode defaults and preserve_non_ascii", async () => {
    const node = new StripAccentsNode();
    expect(node.serialize()).toEqual({ text: "", preserve_non_ascii: true });
    expect(await run(StripAccentsNode, { text: "cafe\u0301" })).toEqual({ output: "cafe" });
    expect(await run(StripAccentsNode, { text: "cafe\u0301 \u00e9", preserve_non_ascii: false }))
      .toEqual({ output: "cafe e" });
  });

  it("SlugifyNode defaults and allow_unicode", async () => {
    const node = new SlugifyNode();
    expect(node.serialize()).toEqual({ text: "", separator: "-", lowercase: true, allow_unicode: false });
    expect(await run(SlugifyNode, { text: "Hello World!" })).toEqual({ output: "hello-world" });
    expect(await run(SlugifyNode, { text: "Hello World", lowercase: false }))
      .toEqual({ output: "Hello-World" });
    expect(await run(SlugifyNode, { text: "cafe\u0301", allow_unicode: true }))
      .toBeDefined();
  });

  it("HasLengthTextNode defaults", async () => {
    const node = new HasLengthTextNode();
    expect(node.serialize()).toEqual({ text: "", min_length: 0, max_length: 0, exact_length: 0 });
    // exact_length match
    expect(await run(HasLengthTextNode, { text: "abc", exact_length: 3 })).toEqual({ output: true });
    expect(await run(HasLengthTextNode, { text: "ab", exact_length: 3 })).toEqual({ output: false });
  });

  it("TruncateTextNode defaults and all paths", async () => {
    const node = new TruncateTextNode();
    expect(node.serialize()).toEqual({ text: "", max_length: 100, ellipsis: "" });
    // text shorter than max
    expect(await run(TruncateTextNode, { text: "hi", max_length: 100 })).toEqual({ output: "hi" });
    // truncate without ellipsis
    expect(await run(TruncateTextNode, { text: "hello world", max_length: 5 })).toEqual({ output: "hello" });
    // truncate with ellipsis
    expect(await run(TruncateTextNode, { text: "hello world", max_length: 8, ellipsis: "..." }))
      .toEqual({ output: "hello..." });
    // max_length <= 0
    expect(await run(TruncateTextNode, { text: "hello", max_length: 0, ellipsis: "..." }))
      .toEqual({ output: "..." });
    // ellipsis longer than max
    expect(await run(TruncateTextNode, { text: "hello world", max_length: 2, ellipsis: "..." }))
      .toEqual({ output: "he" });
  });

  it("PadTextNode defaults and all directions", async () => {
    const node = new PadTextNode();
    expect(node.serialize()).toEqual({ text: "", length: 0, pad_character: " ", direction: "right" });
    // left
    expect(await run(PadTextNode, { text: "hi", length: 5, pad_character: "0", direction: "left" }))
      .toEqual({ output: "000hi" });
    // right
    expect(await run(PadTextNode, { text: "hi", length: 5, pad_character: "0", direction: "right" }))
      .toEqual({ output: "hi000" });
    // both
    expect(await run(PadTextNode, { text: "hi", length: 6, pad_character: "0", direction: "both" }))
      .toEqual({ output: "00hi00" });
    // pad_character not single char
    await expect(run(PadTextNode, { text: "hi", length: 5, pad_character: "ab" }))
      .rejects.toThrow("pad_character must be a single character");
    // already long enough
    expect(await run(PadTextNode, { text: "hello", length: 3 })).toEqual({ output: "hello" });
  });

  it("LengthTextNode defaults and measures", async () => {
    const node = new LengthTextNode();
    expect(node.serialize()).toEqual({ text: "", measure: "characters", trim_whitespace: false });
    // characters
    expect(await run(LengthTextNode, { text: "hello" })).toEqual({ output: 5 });
    // words
    expect(await run(LengthTextNode, { text: "hello world foo", measure: "words" }))
      .toEqual({ output: 3 });
    // lines
    expect(await run(LengthTextNode, { text: "a\nb\nc", measure: "lines" })).toEqual({ output: 3 });
    // empty text lines
    expect(await run(LengthTextNode, { text: "", measure: "lines" })).toEqual({ output: 0 });
    // with trim
    expect(await run(LengthTextNode, { text: "  hello  ", measure: "characters", trim_whitespace: true }))
      .toEqual({ output: 5 });
  });

  it("IndexOfTextNode defaults and all paths", async () => {
    const node = new IndexOfTextNode();
    expect(node.serialize()).toEqual({
      text: "", substring: "", case_sensitive: true,
      start_index: 0, end_index: 0, search_from_end: false,
    });
    // basic (need end_index to be large enough for the slice)
    expect(await run(IndexOfTextNode, { text: "hello world", substring: "world", end_index: 20 }))
      .toEqual({ output: 6 });
    // case insensitive
    expect(await run(IndexOfTextNode, { text: "Hello", substring: "hello", case_sensitive: false, end_index: 10 }))
      .toEqual({ output: 0 });
    // search from end
    expect(await run(IndexOfTextNode, { text: "abcabc", substring: "abc", search_from_end: true, end_index: 10 }))
      .toEqual({ output: 3 });
    // not found
    expect(await run(IndexOfTextNode, { text: "hello", substring: "xyz", end_index: 10 }))
      .toEqual({ output: -1 });
  });

  it("SurroundWithTextNode defaults and skip_if_wrapped", async () => {
    const node = new SurroundWithTextNode();
    expect(node.serialize()).toEqual({ text: "", prefix: "", suffix: "", skip_if_wrapped: true });
    // already wrapped -> skip
    expect(await run(SurroundWithTextNode, { text: "(hello)", prefix: "(", suffix: ")", skip_if_wrapped: true }))
      .toEqual({ output: "(hello)" });
    // not wrapped -> wrap
    expect(await run(SurroundWithTextNode, { text: "hello", prefix: "(", suffix: ")" }))
      .toEqual({ output: "(hello)" });
    // skip_if_wrapped=false -> always wrap
    expect(await run(SurroundWithTextNode, {
      text: "(hello)", prefix: "(", suffix: ")", skip_if_wrapped: false,
    })).toEqual({ output: "((hello))" });
  });

  it("CountTokensNode defaults and empty", async () => {
    const node = new CountTokensNode();
    expect(node.serialize()).toEqual({ text: "", encoding: "cl100k_base" });
    expect(await run(CountTokensNode, { text: "" })).toEqual({ output: 0 });
    expect(await run(CountTokensNode, { text: "   " })).toEqual({ output: 0 });
  });

  it("HtmlToTextNode defaults", async () => {
    expectMetadataDefaults(HtmlToTextNode);
  });

  it("AutomaticSpeechRecognitionNode defaults and requires provider-backed execution", async () => {
    expectMetadataDefaults(AutomaticSpeechRecognitionNode);
    await expect(run(AutomaticSpeechRecognitionNode, {})).rejects.toThrow(
      "provider-backed model"
    );
  });

  it("EmbeddingTextNode defaults", async () => {
    expectMetadataDefaults(EmbeddingTextNode);
    const r = await run(EmbeddingTextNode, { input: "hello" });
    expect(Array.isArray(r.output)).toBe(true);
    expect((r.output as number[]).length).toBe(64);
  });

  it("SaveTextFileNode defaults and empty folder error", async () => {
    expectMetadataDefaults(SaveTextFileNode);
    await expect(run(SaveTextFileNode, { text: "hi", folder: "" }))
      .rejects.toThrow("folder cannot be empty");
  });

  it("SaveTextFileNode writes file", async () => {
    const tmp = join(tmpdir(), `savetext-test-${Date.now()}`);
    const result = await run(SaveTextFileNode, { text: "hello", folder: tmp, name: "test.txt" });
    const output = result.output as { uri: string; data: string };
    expect(output.data).toBe("hello");
    const content = await fs.readFile(output.uri, "utf-8");
    expect(content).toBe("hello");
    await fs.rm(tmp, { recursive: true });
  });

  it("SaveTextNode defaults and writes", async () => {
    expectMetadataDefaults(SaveTextNode);
    const tmp = join(tmpdir(), `savetext2-${Date.now()}.txt`);
    await run(SaveTextNode, { text: "hi", name: tmp });
    const content = await fs.readFile(tmp, "utf-8");
    expect(content).toBe("hi");
    await fs.unlink(tmp);
  });

  it("LoadTextFolderNode defaults and process returns empty", async () => {
    const node = new LoadTextFolderNode();
    expect(node.serialize()).toBeDefined();
    expect(await run(LoadTextFolderNode, {})).toEqual({});
  });

  it("LoadTextFolderNode genProcess reads folder", async () => {
    const tmp = join(tmpdir(), `loadfolder-${Date.now()}`);
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(join(tmp, "a.txt"), "file-a", "utf-8");
    await fs.writeFile(join(tmp, "b.json"), '{"x":1}', "utf-8");
    await fs.writeFile(join(tmp, "c.py"), "ignored", "utf-8");

    const results = await collectGen(LoadTextFolderNode, {
      folder: tmp,
      extensions: [".txt", ".json"],
    });
    expect(results.length).toBe(2);
    await fs.rm(tmp, { recursive: true });
  });

  it("LoadTextFolderNode genProcess with subdirectories", async () => {
    const tmp = join(tmpdir(), `loadfolder-sub-${Date.now()}`);
    await fs.mkdir(join(tmp, "sub"), { recursive: true });
    await fs.writeFile(join(tmp, "a.txt"), "file-a", "utf-8");
    await fs.writeFile(join(tmp, "sub", "b.txt"), "file-b", "utf-8");

    // Without subdirs
    const results1 = await collectGen(LoadTextFolderNode, {
      folder: tmp, include_subdirectories: false, extensions: [".txt"],
    });
    expect(results1.length).toBe(1);

    // With subdirs
    const results2 = await collectGen(LoadTextFolderNode, {
      folder: tmp, include_subdirectories: true, extensions: [".txt"],
    });
    expect(results2.length).toBe(2);
    await fs.rm(tmp, { recursive: true });
  });

  it("LoadTextFolderNode genProcess empty folder error", async () => {
    await expect(collectGen(LoadTextFolderNode, { folder: "" }))
      .rejects.toThrow("folder cannot be empty");
  });

  it("LoadTextAssetsNode defaults, process, and delegates to folder loading", async () => {
    expectMetadataDefaults(LoadTextAssetsNode);
    const node = new LoadTextAssetsNode();
    expect(await node.process({})).toEqual({});
    const tmp = join(tmpdir(), `loadassets-${Date.now()}`);
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(join(tmp, "a.txt"), "asset-a", "utf-8");
    const items = await collectGen(LoadTextAssetsNode, { folder: { path: tmp } });
    expect(items).toHaveLength(1);
    await fs.rm(tmp, { recursive: true });
  });

  it("FilterStringNode defaults, initialize, all filter types", async () => {
    const node = new FilterStringNode();
    expect(node.serialize()).toEqual({ value: "", filter_type: "contains", criteria: "" });

    node.assign({ filter_type: "contains", criteria: "ob" });
    await node.initialize();

    // filter_type update
    expect(await node.process({ filter_type: "starts_with" })).toEqual({});
    // criteria update
    expect(await node.process({ criteria: "hel" })).toEqual({});
    // no value
    expect(await node.process({})).toEqual({});
    // non-string value
    expect(await node.process({ value: 123 })).toEqual({});

    // Test all filter types
    for (const [filterType, criteria, value, expected] of [
      ["contains", "ell", "hello", true],
      ["contains", "xyz", "hello", false],
      ["starts_with", "hel", "hello", true],
      ["starts_with", "xyz", "hello", false],
      ["ends_with", "llo", "hello", true],
      ["ends_with", "xyz", "hello", false],
      ["length_greater", "3", "hello", true],
      ["length_greater", "10", "hello", false],
      ["length_less", "10", "hello", true],
      ["length_less", "3", "hello", false],
      ["exact_length", "5", "hello", true],
      ["exact_length", "3", "hello", false],
    ] as const) {
      await node.process({ filter_type: filterType });
      await node.process({ criteria });
      const result = await node.process({ value });
      if (expected) {
        expect(result).toEqual({ output: value });
      } else {
        expect(result).toEqual({});
      }
    }

    // Default/unknown
    await node.process({ filter_type: "unknown" });
    expect(await node.process({ value: "test" })).toEqual({});
  });

  it("FilterRegexStringNode defaults, initialize, all paths", async () => {
    const node = new FilterRegexStringNode();
    expect(node.serialize()).toEqual({ value: "", pattern: "", full_match: false });

    node.assign({ pattern: "^hello", full_match: false });
    await node.initialize();

    // pattern update
    expect(await node.process({ pattern: "^world" })).toEqual({});
    // full_match update
    expect(await node.process({ full_match: true })).toEqual({});
    // no value
    expect(await node.process({})).toEqual({});
    // non-string
    expect(await node.process({ value: 42 })).toEqual({});

    // full match
    await node.process({ pattern: "^hello$" });
    await node.process({ full_match: true });
    expect(await node.process({ value: "hello" })).toEqual({ output: "hello" });
    expect(await node.process({ value: "hello world" })).toEqual({});

    // partial match
    await node.process({ full_match: false });
    await node.process({ pattern: "ell" });
    expect(await node.process({ value: "hello" })).toEqual({ output: "hello" });

    // invalid regex
    await node.process({ pattern: "[invalid" });
    expect(await node.process({ value: "hello" })).toEqual({});
  });
});

describe("additional coverage gaps", () => {
  it("ConcatTextNode process", async () => {
    expect(await run(ConcatTextNode, { a: "hello", b: " world" })).toEqual({ output: "hello world" });
  });

  it("resolvePythonIndex out of range", async () => {
    await expect(run(GetElementNode, { values: [1, 2, 3], index: 10 }))
      .rejects.toThrow("list index out of range");
    await expect(run(GetElementNode, { values: [1, 2, 3], index: -10 }))
      .rejects.toThrow("list index out of range");
  });

  it("SaveListNode with non-array values", async () => {
    const tmp = join(tmpdir(), `savelist-nonarray-${Date.now()}.txt`);
    await run(SaveListNode, { values: "not-array", name: tmp });
    const content = await fs.readFile(tmp, "utf-8");
    expect(content).toBe("");
    await fs.unlink(tmp);
  });

  it("ReduceDictionariesNode with non-array dictionaries", async () => {
    const result = await run(ReduceDictionariesNode, {
      dictionaries: "not-array",
      key_field: "k",
    });
    expect(result.output).toEqual({});
  });

  it("ArgMaxNode empty dictionary throws", async () => {
    await expect(run(ArgMaxNode, { scores: {} })).rejects.toThrow("Input dictionary cannot be empty");
  });

  it("SaveCSVFileNode with non-array data", async () => {
    await expect(run(SaveCSVFileNode, {
      data: "not-array",
      folder: "/tmp",
      filename: "test.csv",
    })).rejects.toThrow("'data' field cannot be empty");
  });

  it("jsonPathFind without $ prefix", async () => {
    // Will cause no match
    await expect(run(ExtractJSONNode, {
      text: '{"a":1}',
      json_path: "a",
      find_all: false,
    })).rejects.toThrow("JSONPath did not match");
  });

  it("jsonPathFind wildcard on array", async () => {
    const result = await run(ExtractJSONNode, {
      text: '{"items":[[1,2],[3,4]]}',
      json_path: "$.items.*",
      find_all: true,
    });
    expect(result.output).toEqual([[1,2],[3,4]]);
  });

  it("RegexMatchNode with specific group index", async () => {
    const result = await run(RegexMatchNode, {
      text: "hello 42 world 99",
      pattern: "(\\w+) (\\d+)",
      group: 2,
    });
    expect(result.output).toEqual(["42", "99"]);
  });

  it("toYAML fallback for symbol/function types", async () => {
    // toYAML line 316 fallback is for types like Symbol, Function
    const node = new ToYAMLNode();
    // Directly construct a dictionary with a function value to hit line 316
    const dict: Record<string, unknown> = { fn: () => {} };
    const result = await node.process({ dictionary: dict });
    expect(typeof result.output).toBe("string");
  });
});

describe("numbers coverage", () => {
  it("FilterNumberNode all filter types and edge cases", async () => {
    const node = new FilterNumberNode();

    node.assign({ filter_type: "greater_than", compare_value: 5 });
    await node.initialize();

    // filter_type input update
    expect(await node.process({ filter_type: "less_than" })).toEqual({});
    // compare_value input update
    expect(await node.process({ compare_value: 10 })).toEqual({});
    // no value
    expect(await node.process({})).toEqual({});
    // non-number value
    expect(await node.process({ value: "string" })).toEqual({});
    // NaN
    expect(await node.process({ value: NaN })).toEqual({});

    // Test all types
    for (const [filterType, compareValue, value, expected] of [
      ["greater_than", 5, 6, true],
      ["greater_than", 5, 4, false],
      ["less_than", 5, 4, true],
      ["less_than", 5, 6, false],
      ["equal_to", 5, 5, true],
      ["equal_to", 5, 4, false],
      ["even", 0, 4, true],
      ["even", 0, 3, false],
      ["odd", 0, 3, true],
      ["odd", 0, 4, false],
      ["positive", 0, 1, true],
      ["positive", 0, -1, false],
      ["negative", 0, -1, true],
      ["negative", 0, 1, false],
    ] as const) {
      await node.process({ filter_type: filterType });
      await node.process({ compare_value: compareValue });
      const result = await node.process({ value });
      if (expected) {
        expect(result).toEqual({ output: value });
      } else {
        expect(result).toEqual({});
      }
    }

    // Default/unknown type
    await node.process({ filter_type: "unknown" });
    expect(await node.process({ value: 5 })).toEqual({});
  });

  it("FilterNumberRangeNode all paths", async () => {
    const node = new FilterNumberRangeNode();

    node.assign({ min_value: 1, max_value: 10, inclusive: true });
    await node.initialize();

    // min_value update
    expect(await node.process({ min_value: 2 })).toEqual({});
    // max_value update
    expect(await node.process({ max_value: 8 })).toEqual({});
    // inclusive update
    expect(await node.process({ inclusive: false })).toEqual({});
    // no value
    expect(await node.process({})).toEqual({});
    // non-number
    expect(await node.process({ value: "string" })).toEqual({});
    // NaN
    expect(await node.process({ value: NaN })).toEqual({});

    // exclusive: in range
    expect(await node.process({ value: 5 })).toEqual({ output: 5 });
    // exclusive: boundary excluded
    expect(await node.process({ value: 2 })).toEqual({});
    expect(await node.process({ value: 8 })).toEqual({});

    // inclusive
    await node.process({ inclusive: true });
    expect(await node.process({ value: 2 })).toEqual({ output: 2 });
    expect(await node.process({ value: 8 })).toEqual({ output: 8 });

    // out of range
    expect(await node.process({ value: 0 })).toEqual({});
    expect(await node.process({ value: 20 })).toEqual({});
  });
});
