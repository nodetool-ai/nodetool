import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProcessingContext } from "@nodetool/runtime";

import {
  // control
  IfNode,
  ForEachNode,
  CollectNode,
  RerouteNode,
  // input
  FloatInputNode,
  BooleanInputNode,
  IntegerInputNode,
  StringInputNode,
  SelectInputNode,
  StringListInputNode,
  FolderPathInputNode,
  HuggingFaceModelInputNode,
  ColorInputNode,
  ImageSizeInputNode,
  LanguageModelInputNode,
  ImageModelInputNode,
  VideoModelInputNode,
  TTSModelInputNode,
  ASRModelInputNode,
  EmbeddingModelInputNode,
  DataframeInputNode,
  DocumentInputNode,
  ImageInputNode,
  ImageListInputNode,
  VideoListInputNode,
  AudioListInputNode,
  TextListInputNode,
  VideoInputNode,
  AudioInputNode,
  Model3DInputNode,
  RealtimeAudioInputNode,
  AssetFolderInputNode,
  FilePathInputNode,
  DocumentFileInputNode,
  MessageInputNode,
  MessageListInputNode,
  MessageDeconstructorNode,
  // output
  OutputNode,
  PreviewNode,
  // constant
  ConstantBaseNode,
  ConstantBoolNode,
  ConstantIntegerNode,
  ConstantFloatNode,
  ConstantStringNode,
  ConstantListNode,
  ConstantTextListNode,
  ConstantDictNode,
  ConstantAudioNode,
  ConstantImageNode,
  ConstantVideoNode,
  ConstantDocumentNode,
  ConstantJSONNode,
  ConstantModel3DNode,
  ConstantDataFrameNode,
  ConstantAudioListNode,
  ConstantImageListNode,
  ConstantVideoListNode,
  ConstantSelectNode,
  ConstantImageSizeNode,
  ConstantDateNode,
  ConstantDateTimeNode,
  ConstantASRModelNode,
  ConstantEmbeddingModelNode,
  ConstantImageModelNode,
  ConstantLanguageModelNode,
  ConstantTTSModelNode,
  ConstantVideoModelNode,
  // workspace
  GetWorkspaceDirNode,
  ListWorkspaceFilesNode,
  ReadTextFileNode,
  WriteTextFileNode,
  ReadBinaryFileNode,
  WriteBinaryFileNode,
  DeleteWorkspaceFileNode,
  CreateWorkspaceDirectoryNode,
  WorkspaceFileExistsNode,
  GetWorkspaceFileInfoNode,
  CopyWorkspaceFileNode,
  MoveWorkspaceFileNode,
  GetWorkspaceFileSizeNode,
  IsWorkspaceFileNode,
  IsWorkspaceDirectoryNode,
  JoinWorkspacePathsNode,
  SaveImageFileNode,
  SaveVideoFileNode,
  // triggers
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode,
} from "../src/index.js";

// Import extended-placeholders directly to cover internal functions
import {
  EXTENDED_PLACEHOLDER_NODE_TYPES,
  EXTENDED_PLACEHOLDER_NODES,
  titleFromNodeType,
  makePlaceholderNode,
} from "../src/nodes/extended-placeholders.js";

// ============================================================
// CONTROL NODES
// ============================================================
describe("control nodes — full coverage", () => {
  it("ForEachNode.process() returns empty object", async () => {
    const node = new ForEachNode();
    // Lines 36-37: the process() method that just returns {}
    const result = await node.process({});
    expect(result).toEqual({});
  });

  it("ForEachNode.genProcess wraps non-array input in array", async () => {
    const node = new ForEachNode();
    node.assign({ input_list: "single" });
    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess({})) {
      out.push(part);
    }
    expect(out).toEqual([{ output: "single", index: 0 }]);
  });

  it("CollectNode defaults returns input_item null", () => {
    const node = new CollectNode();
    const d = node.serialize();
    expect(d).toEqual({ input_item: [] });
  });

  it("CollectNode.process without input_item key does not push", async () => {
    const node = new CollectNode();
    await node.initialize();
    // calling with no input_item key in inputs
    const result = await node.process({});
    expect(result).toEqual({ output: [] });
  });

  it("RerouteNode uses prop fallback when no input", async () => {
    const node = new RerouteNode();
    node.assign({ input_value: "from-prop" });
    const result = await node.process({});
    expect(result).toEqual({ output: "from-prop" });
  });

  it("RerouteNode returns null when nothing set", async () => {
    const node = new RerouteNode();
    const result = await node.process({});
    expect(result).toEqual({ output: [] });
  });

  it("IfNode uses prop defaults", async () => {
    const node = new IfNode();
    const d = node.serialize();
    expect(d).toEqual({ condition: false, value: [] });
  });
});

// ============================================================
// INPUT NODES
// ============================================================
describe("input nodes — full coverage", () => {
  const simpleInputNodes = [
    { Cls: FloatInputNode, expected: 0 },
    { Cls: BooleanInputNode, expected: false },
    { Cls: IntegerInputNode, expected: 0 },
    { Cls: SelectInputNode, expected: "" },
    { Cls: StringListInputNode, expected: [] },
    { Cls: FolderPathInputNode, expected: "" },
    { Cls: HuggingFaceModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "hf.model", repo_id: "" }) },
    { Cls: ColorInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "color", value: null }) },
    { Cls: ImageSizeInputNode, expected: {} },
    { Cls: LanguageModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "language_model", provider: "empty", id: "" }) },
    { Cls: ImageModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "image_model", provider: "empty", id: "" }) },
    { Cls: VideoModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "video_model", provider: "empty", id: "" }) },
    { Cls: TTSModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "tts_model", provider: "empty", id: "", selected_voice: "" }) },
    { Cls: ASRModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "asr_model", provider: "empty", id: "" }) },
    { Cls: EmbeddingModelInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "embedding_model", provider: "empty", id: "", dimensions: 0 }) },
    { Cls: DataframeInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "dataframe", uri: "" }) },
    { Cls: DocumentInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "document", uri: "" }) },
    { Cls: ImageInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "image", uri: "" }) },
    { Cls: ImageListInputNode, expected: [] },
    { Cls: VideoListInputNode, expected: [] },
    { Cls: AudioListInputNode, expected: [] },
    { Cls: TextListInputNode, expected: [] },
    { Cls: VideoInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "video", uri: "" }) },
    { Cls: AudioInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "audio", uri: "" }) },
    { Cls: Model3DInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "model_3d", uri: "", texture_files: [] }) },
    { Cls: AssetFolderInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "folder", uri: "" }) },
    { Cls: FilePathInputNode, expected: "" },
    { Cls: MessageInputNode, verify: (value: any) => expect(value).toMatchObject({ type: "message", role: "" }) },
    { Cls: MessageListInputNode, expected: [] },
  ];

  for (const { Cls, expected, verify } of simpleInputNodes) {
    it(`${Cls.nodeType} returns default value`, async () => {
      const node = new Cls();
      const result = await node.process({});
      if (verify) verify(result.value);
      else expect(result).toEqual({ value: expected });
    });
  }

  it("SimpleInputNode uses assigned value", async () => {
    const node = new FloatInputNode();
    node.assign({ value: 3.14 });
    const result = await node.process({});
    expect(result).toEqual({ value: 3.14 });
  });

  it("StringInputNode returns full string when no max_length", async () => {
    const node = new StringInputNode();
    node.assign({ value: "hello world", max_length: 0 });
    const result = await node.process({});
    expect(result).toEqual({ value: "hello world" });
  });

  it("StringInputNode defaults include line_mode", () => {
    const node = new StringInputNode();
    const d = node.serialize();
    expect(d).toEqual({
      name: "",
      value: "",
      description: "",
      max_length: 0,
      line_mode: "single_line",
    });
  });

  it("RealtimeAudioInputNode returns chunk", async () => {
    const node = new RealtimeAudioInputNode();
    node.assign({ value: "audio-data" });
    const result = await node.process({});
    expect(result).toEqual({ chunk: "audio-data" });
  });

  it("RealtimeAudioInputNode returns null by default", async () => {
    const node = new RealtimeAudioInputNode();
    const result = await node.process({});
    expect(result.chunk).toMatchObject({ type: "audio", uri: "" });
  });

  it("DocumentFileInputNode produces uri and path", async () => {
    const node = new DocumentFileInputNode();
    node.assign({ value: "/some/doc.pdf" });
    const result = await node.process({});
    expect(result).toEqual({ document: { uri: "file:///some/doc.pdf" }, path: "/some/doc.pdf" });
  });

  it("DocumentFileInputNode handles empty path", async () => {
    const node = new DocumentFileInputNode();
    const result = await node.process({});
    expect(result).toEqual({ document: { uri: "" }, path: "" });
  });

  it("MessageDeconstructorNode handles string content", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({ value: { role: "user", content: "plain text" } });
    const result = await node.process({});
    expect(result.text).toBe("plain text");
    expect(result.role).toBe("user");
  });

  it("MessageDeconstructorNode handles empty value", async () => {
    const node = new MessageDeconstructorNode();
    const result = await node.process({});
    expect(result.text).toBe("");
    expect(result.role).toBe("");
    expect(result.model).toBeNull();
  });

  it("MessageDeconstructorNode handles image and audio content blocks", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({
      value: {
        id: "m2",
        thread_id: "t2",
        role: "assistant",
        content: [
          { type: "image", image: { uri: "img.png" } },
          { type: "audio", audio: { uri: "clip.mp3" } },
          { type: "text", text: "hello" },
          null, // non-object item
          42, // non-object item
        ],
      },
    });
    const result = await node.process({});
    expect(result.image).toEqual({ uri: "img.png" });
    expect(result.audio).toEqual({ uri: "clip.mp3" });
    expect(result.text).toBe("hello");
  });

  it("MessageDeconstructorNode model is null when provider/model not strings", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({ value: { provider: 123, model: 456 } });
    const result = await node.process({});
    expect(result.model).toBeNull();
  });
});

// ============================================================
// OUTPUT NODES
// ============================================================
describe("output nodes — full coverage", () => {
  it("OutputNode uses input_value fallback", async () => {
    const node = new OutputNode();
    const result = await node.process({ input_value: "via-input_value" });
    expect(result).toEqual({ output: "via-input_value" });
  });

  it("OutputNode uses output key fallback", async () => {
    const node = new OutputNode();
    const result = await node.process({ output: "via-output" });
    expect(result).toEqual({ output: "via-output" });
  });

  it("OutputNode uses single-key fallback", async () => {
    const node = new OutputNode();
    const result = await node.process({ my_key: "single" });
    expect(result).toEqual({ output: "single" });
  });

  it("OutputNode falls back to prop value when inputs empty", async () => {
    const node = new OutputNode();
    node.assign({ value: "prop-val" });
    const result = await node.process({});
    expect(result).toEqual({ output: "prop-val" });
  });

  it("OutputNode without context does not emit", async () => {
    const node = new OutputNode();
    node.assign({ __node_id: "n1" });
    // No context passed — should not throw
    const result = await node.process({ value: 42 });
    expect(result).toEqual({ output: 42 });
  });

  it("OutputNode without normalizeOutputValue on context returns raw", async () => {
    const node = new OutputNode();
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
    } as unknown as ProcessingContext;
    const result = await node.process({ value: "raw" }, context);
    expect(result).toEqual({ output: "raw" });
  });

  it("OutputNode inferOutputType covers all types", async () => {
    const node = new OutputNode();
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
    } as unknown as ProcessingContext;

    // null
    await node.process({ value: null }, context);
    expect(emitted[0].output_type).toBe("any");

    // string
    emitted.length = 0;
    await node.process({ value: "text" }, context);
    expect(emitted[0].output_type).toBe("str");

    // integer
    emitted.length = 0;
    await node.process({ value: 42 }, context);
    expect(emitted[0].output_type).toBe("int");

    // float
    emitted.length = 0;
    await node.process({ value: 3.14 }, context);
    expect(emitted[0].output_type).toBe("float");

    // boolean
    emitted.length = 0;
    await node.process({ value: true }, context);
    expect(emitted[0].output_type).toBe("bool");

    // array
    emitted.length = 0;
    await node.process({ value: [1, 2] }, context);
    expect(emitted[0].output_type).toBe("list");

    // object
    emitted.length = 0;
    await node.process({ value: { a: 1 } }, context);
    expect(emitted[0].output_type).toBe("dict");

    // undefined (fallback to "any")
    emitted.length = 0;
    await node.process({ value: undefined }, context);
    expect(emitted[0].output_type).toBe("any");

    // BigInt — non-standard type that hits the final "any" fallback
    emitted.length = 0;
    await node.process({ value: BigInt(42) }, context);
    expect(emitted[0].output_type).toBe("any");
  });

  it("OutputNode output_name defaults to 'output' when name prop empty", async () => {
    const node = new OutputNode();
    node.assign({ __node_id: "n1", name: "" });
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
    } as unknown as ProcessingContext;
    await node.process({ value: 1 }, context);
    expect(emitted[0].output_name).toBe("output");
  });

  it("PreviewNode uses single-key fallback", async () => {
    const node = new PreviewNode();
    const result = await node.process({ only_key: "val" });
    expect(result).toEqual({ output: "val" });
  });

  it("PreviewNode falls back to prop when multiple keys in inputs", async () => {
    const node = new PreviewNode();
    node.assign({ value: "prop-val" });
    const result = await node.process({ a: 1, b: 2 });
    expect(result).toEqual({ output: "prop-val" });
  });

  it("PreviewNode without context works", async () => {
    const node = new PreviewNode();
    const result = await node.process({ value: "x" });
    expect(result).toEqual({ output: "x" });
  });

  it("PreviewNode without normalizeOutputValue returns raw", async () => {
    const node = new PreviewNode();
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
    } as unknown as ProcessingContext;
    const result = await node.process({ value: "raw" }, context);
    expect(result).toEqual({ output: "raw" });
  });
});

// ============================================================
// CONSTANT NODES
// ============================================================
describe("constant nodes — full coverage", () => {
  it("ConstantBoolNode uses defaults and process via input", async () => {
    const node = new ConstantBoolNode();
    expect(node.serialize()).toEqual({ value: false });
    // Without assign, defaults() still provides the decorator default
    const r1 = await node.process({});
    expect(r1).toEqual({ output: false });
    // With value in inputs
    const r2 = await node.process({ value: true });
    expect(r2).toEqual({ output: true });
  });

  it("ConstantFloatNode", async () => {
    const node = new ConstantFloatNode();
    expect(node.serialize()).toEqual({ value: 0.0 });
    node.assign({ value: 2.5 });
    expect(await node.process({})).toEqual({ output: 2.5 });
  });

  it("ConstantStringNode", async () => {
    const node = new ConstantStringNode();
    expect(node.serialize()).toEqual({ value: "" });
    expect(await node.process({ value: "hi" })).toEqual({ output: "hi" });
  });

  it("ConstantListNode", async () => {
    const node = new ConstantListNode();
    expect(node.serialize()).toEqual({ value: [] });
    expect(await node.process({ value: [1, 2] })).toEqual({ output: [1, 2] });
  });

  it("ConstantTextListNode", async () => {
    const node = new ConstantTextListNode();
    expect(node.serialize()).toEqual({ value: null });
    expect(await node.process({ value: ["a", "b"] })).toEqual({ output: ["a", "b"] });
  });

  it("ConstantAudioNode", async () => {
    const node = new ConstantAudioNode();
    expect(await node.process({ value: { uri: "a.mp3" } })).toEqual({ output: { uri: "a.mp3" } });
  });

  it("ConstantImageNode", async () => {
    const node = new ConstantImageNode();
    expect(await node.process({ value: { uri: "i.png" } })).toEqual({ output: { uri: "i.png" } });
  });

  it("ConstantVideoNode", async () => {
    const node = new ConstantVideoNode();
    expect(await node.process({ value: { uri: "v.mp4" } })).toEqual({ output: { uri: "v.mp4" } });
  });

  it("ConstantDocumentNode", async () => {
    const node = new ConstantDocumentNode();
    expect(await node.process({ value: { text: "doc" } })).toEqual({ output: { text: "doc" } });
  });

  it("ConstantJSONNode", async () => {
    const node = new ConstantJSONNode();
    expect(await node.process({ value: { x: 1 } })).toEqual({ output: { x: 1 } });
  });

  it("ConstantModel3DNode", async () => {
    const node = new ConstantModel3DNode();
    expect(await node.process({ value: { mesh: "cube" } })).toEqual({ output: { mesh: "cube" } });
  });

  it("ConstantDataFrameNode", async () => {
    const node = new ConstantDataFrameNode();
    expect(await node.process({ value: { rows: [] } })).toEqual({ output: { rows: [] } });
  });

  it("ConstantAudioListNode", async () => {
    const node = new ConstantAudioListNode();
    expect(await node.process({ value: [{ uri: "a.mp3" }] })).toEqual({ output: [{ uri: "a.mp3" }] });
  });

  it("ConstantImageListNode", async () => {
    const node = new ConstantImageListNode();
    expect(await node.process({ value: [{ uri: "i.png" }] })).toEqual({ output: [{ uri: "i.png" }] });
  });

  it("ConstantVideoListNode", async () => {
    const node = new ConstantVideoListNode();
    expect(await node.process({ value: [{ uri: "v.mp4" }] })).toEqual({ output: [{ uri: "v.mp4" }] });
  });

  it("ConstantDateTimeNode with defaults", async () => {
    const node = new ConstantDateTimeNode();
    const d = node.serialize();
    expect(d.year).toBe(1900);
    expect(d.millisecond).toBe(0);
    expect(d.tzinfo).toBe("UTC");
    expect(d.utc_offset).toBe(0);

    const result = await node.process({
      year: 2025,
      month: 6,
      day: 15,
      hour: 10,
      minute: 30,
      second: 45,
      millisecond: 123,
      tzinfo: "UTC",
      utc_offset: "+00:00",
    });
    expect(result.output).toEqual({
      year: 2025,
      month: 6,
      day: 15,
      hour: 10,
      minute: 30,
      second: 45,
      millisecond: 123,
      tzinfo: "UTC",
      utc_offset: "+00:00",
    });
  });

  it("ConstantDateTimeNode uses prop defaults when inputs missing", async () => {
    const node = new ConstantDateTimeNode();
    const result = await node.process({});
    expect(result.output).toEqual({
      year: 1900,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      tzinfo: "UTC",
      utc_offset: "0",
    });
  });

  it("ConstantASRModelNode", async () => {
    const node = new ConstantASRModelNode();
    expect(await node.process({ value: { id: "whisper" } })).toEqual({ output: { id: "whisper" } });
  });

  it("ConstantEmbeddingModelNode", async () => {
    const node = new ConstantEmbeddingModelNode();
    expect(await node.process({ value: { id: "emb" } })).toEqual({ output: { id: "emb" } });
  });

  it("ConstantImageModelNode", async () => {
    const node = new ConstantImageModelNode();
    expect(await node.process({ value: { id: "sdxl" } })).toEqual({ output: { id: "sdxl" } });
  });

  it("ConstantLanguageModelNode", async () => {
    const node = new ConstantLanguageModelNode();
    expect(await node.process({ value: { id: "gpt-4" } })).toEqual({ output: { id: "gpt-4" } });
  });

  it("ConstantTTSModelNode", async () => {
    const node = new ConstantTTSModelNode();
    expect(await node.process({ value: { id: "tts" } })).toEqual({ output: { id: "tts" } });
  });

  it("ConstantVideoModelNode", async () => {
    const node = new ConstantVideoModelNode();
    expect(await node.process({ value: { id: "vid" } })).toEqual({ output: { id: "vid" } });
  });

  it("ConstantImageSizeNode defaults and process", async () => {
    const node = new ConstantImageSizeNode();
    const d = node.serialize();
    expect(d).toEqual({ value: null });
    const result = await node.process({});
    expect(result).toEqual({
      output: { width: 1024, height: 1024 },
      image_size: { width: 1024, height: 1024 },
      width: 1024,
      height: 1024,
    });
  });

  it("ConstantDateNode defaults and process", async () => {
    const node = new ConstantDateNode();
    const d = node.serialize();
    expect(d).toEqual({ year: 1900, month: 1, day: 1 });
    const result = await node.process({});
    expect(result).toEqual({ output: { year: 1900, month: 1, day: 1 } });
  });

  it("ConstantSelectNode defaults and prop defaults", async () => {
    const node = new ConstantSelectNode();
    expect(node.serialize()).toEqual({ value: "", options: [], enum_type_name: "" });
    const result = await node.process({});
    expect(result).toEqual({ output: "" });
  });

  it("ConstantDictNode defaults", () => {
    const node = new ConstantDictNode();
    expect(node.serialize()).toEqual({ value: {} });
  });

  it("ConstantNode abstract falls back to prop value", async () => {
    // ConstantBoolNode extends ConstantNode — test the prop fallback path
    const node = new ConstantBoolNode();
    node.assign({ value: true });
    // No "value" key in inputs
    const result = await node.process({});
    expect(result).toEqual({ output: true });
  });

  it("ConstantNode abstract falls back to null when no prop", async () => {
    // ConstantIntegerNode with decorator defaults — returns default when nothing assigned
    const node = new ConstantIntegerNode();
    const result = await node.process({});
    expect(result).toEqual({ output: 0 });
  });
});

// ============================================================
// WORKSPACE NODES
// ============================================================
describe("workspace nodes — full coverage", () => {
  let tmpDir: string;

  async function freshDir(): Promise<string> {
    return mkdtemp(path.join(tmpdir(), "nodetool-ws-test-"));
  }

  it("GetWorkspaceDirNode returns workspace dir from inputs", async () => {
    tmpDir = await freshDir();
    const node = new GetWorkspaceDirNode();
    const result = await node.process({ workspace_dir: tmpDir });
    expect(result).toEqual({ output: tmpDir });
  });

  it("GetWorkspaceDirNode uses cwd as default", async () => {
    const node = new GetWorkspaceDirNode();
    const result = await node.process({});
    expect(result).toEqual({ output: process.cwd() });
  });

  it("WriteTextFileNode and ReadTextFileNode round-trip", async () => {
    tmpDir = await freshDir();
    const write = new WriteTextFileNode();
    const read = new ReadTextFileNode();
    await write.process({ workspace_dir: tmpDir, path: "test.txt", content: "data123" });
    const result = await read.process({ workspace_dir: tmpDir, path: "test.txt" });
    expect(result).toEqual({ output: "data123" });
  });

  it("WriteTextFileNode appends when append is true", async () => {
    tmpDir = await freshDir();
    const write = new WriteTextFileNode();
    await write.process({ workspace_dir: tmpDir, path: "log.txt", content: "line1\n" });
    await write.process({ workspace_dir: tmpDir, path: "log.txt", content: "line2\n", append: true });
    const read = new ReadTextFileNode();
    const result = await read.process({ workspace_dir: tmpDir, path: "log.txt" });
    expect(result).toEqual({ output: "line1\nline2\n" });
  });

  it("ReadBinaryFileNode and WriteBinaryFileNode round-trip", async () => {
    tmpDir = await freshDir();
    const b64 = Buffer.from("binary-data").toString("base64");
    await new WriteBinaryFileNode().process({ workspace_dir: tmpDir, path: "bin.dat", content: b64 });
    const result = await new ReadBinaryFileNode().process({ workspace_dir: tmpDir, path: "bin.dat" });
    expect(result.output).toBe(b64);
  });

  it("CreateWorkspaceDirectoryNode creates nested directories", async () => {
    tmpDir = await freshDir();
    const node = new CreateWorkspaceDirectoryNode();
    const result = await node.process({ workspace_dir: tmpDir, path: "a/b/c" });
    expect(result).toEqual({ output: "a/b/c" });
    // verify existence
    const exists = new WorkspaceFileExistsNode();
    expect(await exists.process({ workspace_dir: tmpDir, path: "a/b/c" })).toEqual({ output: true });
  });

  it("DeleteWorkspaceFileNode deletes a file", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "del.txt", content: "x" });
    const result = await new DeleteWorkspaceFileNode().process({ workspace_dir: tmpDir, path: "del.txt" });
    expect(result).toEqual({ output: null });
    expect(await new WorkspaceFileExistsNode().process({ workspace_dir: tmpDir, path: "del.txt" })).toEqual({ output: false });
  });

  it("DeleteWorkspaceFileNode throws for dir without recursive", async () => {
    tmpDir = await freshDir();
    await new CreateWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "mydir" });
    await expect(
      new DeleteWorkspaceFileNode().process({ workspace_dir: tmpDir, path: "mydir" })
    ).rejects.toThrow("recursive");
  });

  it("DeleteWorkspaceFileNode deletes directory recursively", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "rdir/f.txt", content: "x" });
    await new DeleteWorkspaceFileNode().process({ workspace_dir: tmpDir, path: "rdir", recursive: true });
    expect(await new WorkspaceFileExistsNode().process({ workspace_dir: tmpDir, path: "rdir" })).toEqual({ output: false });
  });

  it("GetWorkspaceFileInfoNode returns file metadata", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "info.txt", content: "hello" });
    const result = await new GetWorkspaceFileInfoNode().process({ workspace_dir: tmpDir, path: "info.txt" });
    const info = result.output as Record<string, unknown>;
    expect(info.name).toBe("info.txt");
    expect(info.is_file).toBe(true);
    expect(info.is_directory).toBe(false);
    expect(info.size).toBe(5);
    expect(typeof info.created).toBe("string");
    expect(typeof info.modified).toBe("string");
    expect(typeof info.accessed).toBe("string");
  });

  it("CopyWorkspaceFileNode copies a file", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "src.txt", content: "copy-me" });
    const result = await new CopyWorkspaceFileNode().process({ workspace_dir: tmpDir, source: "src.txt", destination: "dst.txt" });
    expect(result).toEqual({ output: "dst.txt" });
    const content = await new ReadTextFileNode().process({ workspace_dir: tmpDir, path: "dst.txt" });
    expect(content).toEqual({ output: "copy-me" });
  });

  it("MoveWorkspaceFileNode renames a file", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "old.txt", content: "move-me" });
    const result = await new MoveWorkspaceFileNode().process({ workspace_dir: tmpDir, source: "old.txt", destination: "new.txt" });
    expect(result).toEqual({ output: "new.txt" });
    expect(await new WorkspaceFileExistsNode().process({ workspace_dir: tmpDir, path: "old.txt" })).toEqual({ output: false });
    expect(await new ReadTextFileNode().process({ workspace_dir: tmpDir, path: "new.txt" })).toEqual({ output: "move-me" });
  });

  it("workspace node defaults are accessible", () => {
    expect(new ReadTextFileNode().serialize()).toEqual({ path: "", encoding: "utf-8" });
    expect(new WriteTextFileNode().serialize()).toEqual({ path: "", content: "", encoding: "utf-8", append: false });
    expect(new ReadBinaryFileNode().serialize()).toEqual({ path: "" });
    expect(new WriteBinaryFileNode().serialize()).toEqual({ path: "", content: "" });
    expect(new DeleteWorkspaceFileNode().serialize()).toEqual({ path: "", recursive: false });
    expect(new CreateWorkspaceDirectoryNode().serialize()).toEqual({ path: "" });
    expect(new WorkspaceFileExistsNode().serialize()).toEqual({ path: "" });
    expect(new GetWorkspaceFileInfoNode().serialize()).toEqual({ path: "" });
    expect(new CopyWorkspaceFileNode().serialize()).toEqual({ source: "", destination: "" });
    expect(new MoveWorkspaceFileNode().serialize()).toEqual({ source: "", destination: "" });
    expect(new GetWorkspaceFileSizeNode().serialize()).toEqual({ path: "" });
    expect(new IsWorkspaceFileNode().serialize()).toEqual({ path: "" });
  });

  it("GetWorkspaceFileSizeNode returns file size", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "sized.txt", content: "12345" });
    const result = await new GetWorkspaceFileSizeNode().process({ workspace_dir: tmpDir, path: "sized.txt" });
    expect(result).toEqual({ output: 5 });
  });

  it("GetWorkspaceFileSizeNode throws for directory", async () => {
    tmpDir = await freshDir();
    await new CreateWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "adir" });
    await expect(
      new GetWorkspaceFileSizeNode().process({ workspace_dir: tmpDir, path: "adir" })
    ).rejects.toThrow("not a file");
  });

  it("IsWorkspaceFileNode checks if path is file", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "f.txt", content: "x" });
    await new CreateWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "d" });
    expect(await new IsWorkspaceFileNode().process({ workspace_dir: tmpDir, path: "f.txt" })).toEqual({ output: true });
    expect(await new IsWorkspaceFileNode().process({ workspace_dir: tmpDir, path: "d" })).toEqual({ output: false });
    expect(await new IsWorkspaceFileNode().process({ workspace_dir: tmpDir, path: "nope" })).toEqual({ output: false });
  });

  it("IsWorkspaceDirectoryNode checks if path is directory", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "f.txt", content: "x" });
    await new CreateWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "d" });
    expect(await new IsWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "d" })).toEqual({ output: true });
    expect(await new IsWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "f.txt" })).toEqual({ output: false });
    expect(await new IsWorkspaceDirectoryNode().process({ workspace_dir: tmpDir, path: "nope" })).toEqual({ output: false });
  });

  it("IsWorkspaceDirectoryNode defaults", () => {
    expect(new IsWorkspaceDirectoryNode().serialize()).toEqual({ path: "" });
  });

  it("JoinWorkspacePathsNode defaults", () => {
    expect(new JoinWorkspacePathsNode().serialize()).toEqual({ paths: [] });
  });

  it("JoinWorkspacePathsNode throws when paths is not an array", async () => {
    tmpDir = await freshDir();
    await expect(
      new JoinWorkspacePathsNode().process({ workspace_dir: tmpDir, paths: "not-array" })
    ).rejects.toThrow("empty");
  });

  it("JoinWorkspacePathsNode joins path parts", async () => {
    tmpDir = await freshDir();
    const result = await new JoinWorkspacePathsNode().process({ workspace_dir: tmpDir, paths: ["a", "b", "c.txt"] });
    expect(result).toEqual({ output: "a/b/c.txt" });
  });

  it("JoinWorkspacePathsNode throws for empty paths", async () => {
    tmpDir = await freshDir();
    await expect(
      new JoinWorkspacePathsNode().process({ workspace_dir: tmpDir, paths: [] })
    ).rejects.toThrow("empty");
  });

  it("ListWorkspaceFilesNode lists files", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "sub/a.txt", content: "a" });
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "sub/b.log", content: "b" });
    const node = new ListWorkspaceFilesNode();
    const results: string[] = [];
    for await (const item of node.genProcess({ workspace_dir: tmpDir, path: "sub", pattern: "*.txt" })) {
      results.push(String(item.file));
    }
    expect(results).toEqual(["sub/a.txt"]);
  });

  it("ListWorkspaceFilesNode recursive mode", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "top/a.txt", content: "a" });
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "top/nested/b.txt", content: "b" });
    const node = new ListWorkspaceFilesNode();
    const results: string[] = [];
    for await (const item of node.genProcess({ workspace_dir: tmpDir, path: "top", pattern: "*.txt", recursive: true })) {
      results.push(String(item.file));
    }
    expect(results.sort()).toEqual(["top/a.txt", "top/nested/b.txt"]);
  });

  it("ListWorkspaceFilesNode defaults and process", async () => {
    const node = new ListWorkspaceFilesNode();
    expect(node.serialize()).toEqual({ path: ".", pattern: "*", recursive: false });
    expect(await node.process({})).toEqual({});
  });

  it("SaveImageFileNode defaults", () => {
    const node = new SaveImageFileNode();
    expect(node.serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      folder: ".",
      filename: "image.png",
      overwrite: false,
    });
  });

  it("SaveVideoFileNode defaults", () => {
    const node = new SaveVideoFileNode();
    expect(node.serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      folder: ".",
      filename: "video.mp4",
      overwrite: false,
    });
  });

  it("SaveImageFileNode saves image bytes and handles overwrite=false", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const node = new SaveImageFileNode();
    // First save
    const r1 = await node.process({ workspace_dir: tmpDir, image: { data }, folder: ".", filename: "img.png", overwrite: false });
    const output1 = r1.output as Record<string, unknown>;
    expect(output1.uri).toContain("img.png");
    // Second save with same name — should get img_1.png
    const r2 = await node.process({ workspace_dir: tmpDir, image: { data }, folder: ".", filename: "img.png", overwrite: false });
    const output2 = r2.output as Record<string, unknown>;
    expect(output2.uri).toContain("img_1.png");
  });

  it("SaveImageFileNode with overwrite=true", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const node = new SaveImageFileNode();
    await node.process({ workspace_dir: tmpDir, image: { data }, folder: ".", filename: "over.png", overwrite: true });
    const r2 = await node.process({ workspace_dir: tmpDir, image: { data }, folder: ".", filename: "over.png", overwrite: true });
    const output = r2.output as Record<string, unknown>;
    expect(output.uri).toContain("over.png");
    expect(String(output.uri)).not.toContain("_1");
  });

  it("SaveImageFileNode with Uint8Array data", async () => {
    tmpDir = await freshDir();
    const data = new Uint8Array([10, 20, 30]);
    const node = new SaveImageFileNode();
    const result = await node.process({ workspace_dir: tmpDir, image: { data }, folder: ".", filename: "u8.png", overwrite: true });
    const output = result.output as Record<string, string>;
    expect(output.uri).toContain("u8.png");
  });

  it("SaveImageFileNode with array data", async () => {
    tmpDir = await freshDir();
    const data = [10, 20, 30];
    const node = new SaveImageFileNode();
    const result = await node.process({ workspace_dir: tmpDir, image: { data }, folder: ".", filename: "arr.png", overwrite: true });
    const output = result.output as Record<string, string>;
    expect(output.uri).toContain("arr.png");
  });

  it("SaveImageFileNode with no data produces empty file", async () => {
    tmpDir = await freshDir();
    const node = new SaveImageFileNode();
    const result = await node.process({ workspace_dir: tmpDir, image: {}, folder: ".", filename: "empty.png", overwrite: true });
    const output = result.output as Record<string, string>;
    expect(output.uri).toContain("empty.png");
  });

  it("SaveVideoFileNode saves video bytes and handles naming", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([0, 0, 0, 0x1c]).toString("base64");
    const node = new SaveVideoFileNode();
    const r1 = await node.process({ workspace_dir: tmpDir, video: { data }, folder: ".", filename: "vid.mp4", overwrite: false });
    const output1 = r1.output as Record<string, unknown>;
    expect(output1.uri).toContain("vid.mp4");
    // Second save should increment
    const r2 = await node.process({ workspace_dir: tmpDir, video: { data }, folder: ".", filename: "vid.mp4", overwrite: false });
    const output2 = r2.output as Record<string, unknown>;
    expect(output2.uri).toContain("vid_1.mp4");
  });

  it("SaveVideoFileNode with overwrite=true", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([1, 2]).toString("base64");
    const node = new SaveVideoFileNode();
    await node.process({ workspace_dir: tmpDir, video: { data }, folder: ".", filename: "over.mp4", overwrite: true });
    const r2 = await node.process({ workspace_dir: tmpDir, video: { data }, folder: ".", filename: "over.mp4", overwrite: true });
    const output = r2.output as Record<string, unknown>;
    expect(String(output.uri)).toContain("over.mp4");
    expect(String(output.uri)).not.toContain("_1");
  });

  it("workspace path validation rejects absolute paths", async () => {
    tmpDir = await freshDir();
    await expect(
      new ReadTextFileNode().process({ workspace_dir: tmpDir, path: "/etc/passwd" })
    ).rejects.toThrow("Absolute");
  });

  it("workspace path validation rejects parent traversal", async () => {
    tmpDir = await freshDir();
    await expect(
      new ReadTextFileNode().process({ workspace_dir: tmpDir, path: "../etc/passwd" })
    ).rejects.toThrow("Parent directory");
  });

  it("workspace path validation rejects empty path", async () => {
    tmpDir = await freshDir();
    await expect(
      new ReadTextFileNode().process({ workspace_dir: tmpDir, path: "" })
    ).rejects.toThrow("empty");
  });

  it("WorkspaceFileExistsNode returns true for existing file", async () => {
    tmpDir = await freshDir();
    await new WriteTextFileNode().process({ workspace_dir: tmpDir, path: "ex.txt", content: "y" });
    expect(await new WorkspaceFileExistsNode().process({ workspace_dir: tmpDir, path: "ex.txt" })).toEqual({ output: true });
  });

  it("WorkspaceFileExistsNode returns false for missing file", async () => {
    tmpDir = await freshDir();
    expect(await new WorkspaceFileExistsNode().process({ workspace_dir: tmpDir, path: "missing.txt" })).toEqual({ output: false });
  });
});

// ============================================================
// TRIGGER NODES
// ============================================================
describe("trigger nodes — full coverage", () => {
  it("WaitNode defaults", () => {
    expect(new WaitNode().serialize()).toEqual({ timeout_seconds: 0, input: "" });
  });

  it("WaitNode with zero timeout", async () => {
    const node = new WaitNode();
    const result = await node.process({ timeout_seconds: 0, input: "data" });
    expect(result.data).toBe("data");
    expect(typeof result.resumed_at).toBe("string");
    expect(Number(result.waited_seconds)).toBeGreaterThanOrEqual(0);
  });

  it("WaitNode uses prop defaults", async () => {
    const node = new WaitNode();
    const result = await node.process({});
    expect(result.data).toBe("");
    expect(typeof result.resumed_at).toBe("string");
  });

  it("ManualTriggerNode defaults", () => {
    expect(new ManualTriggerNode().serialize()).toEqual({
      max_events: 0,
      name: "manual_trigger",
      timeout_seconds: null,
    });
  });

  it("ManualTriggerNode emits payload", async () => {
    const node = new ManualTriggerNode();
    const result = await node.process({ payload: { key: "val" } });
    expect(result).toEqual({ output: { key: "val" }, payload: { key: "val" } });
  });

  it("ManualTriggerNode uses defaults", async () => {
    const node = new ManualTriggerNode();
    const result = await node.process({});
    expect(result).toEqual({ output: {}, payload: {} });
  });

  it("IntervalTriggerNode defaults", () => {
    expect(new IntervalTriggerNode().serialize()).toEqual({
      max_events: 0,
      interval_seconds: 60,
      initial_delay_seconds: 0,
      emit_on_start: true,
      include_drift_compensation: true,
    });
  });

  it("IntervalTriggerNode emits interval metadata", async () => {
    const node = new IntervalTriggerNode();
    const result = await node.process({ interval_seconds: 30 });
    const output = result.output as Record<string, unknown>;
    expect(output.interval_seconds).toBe(30);
    expect(typeof output.triggered_at).toBe("string");
  });

  it("IntervalTriggerNode uses default interval", async () => {
    const node = new IntervalTriggerNode();
    const result = await node.process({});
    const output = result.output as Record<string, unknown>;
    expect(output.interval_seconds).toBe(60);
  });

  it("WebhookTriggerNode emits webhook request data", async () => {
    const node = new WebhookTriggerNode();
    const result = await node.process({
      method: "GET",
      path: "/api/hook",
      headers: { "content-type": "application/json" },
      body: { data: 123 },
    });
    const output = result.output as Record<string, unknown>;
    expect(output.method).toBe("GET");
    expect(output.path).toBe("/api/hook");
    expect(output.headers).toEqual({ "content-type": "application/json" });
    expect(output.body).toEqual({ data: 123 });
  });

  it("WebhookTriggerNode defaults and process with defaults", async () => {
    const node = new WebhookTriggerNode();
    const d = node.serialize();
    expect(d).toEqual({
      max_events: 0,
      port: 8080,
      path: "/webhook",
      host: "127.0.0.1",
      methods: ["POST"],
      secret: "",
    });
    const result = await node.process({});
    const output = result.output as Record<string, unknown>;
    expect(output.method).toBe("POST");
    expect(output.path).toBe("/webhook");
    expect(output.headers).toEqual({});
    expect(output.body).toEqual({});
  });

  it("FileWatchTriggerNode defaults and process with inputs", async () => {
    const node = new FileWatchTriggerNode();
    const d = node.serialize();
    expect(d).toEqual({
      max_events: 0,
      path: ".",
      recursive: false,
      patterns: ["*"],
      ignore_patterns: [],
      events: ["created", "modified", "deleted", "moved"],
      debounce_seconds: 0.5,
    });
    const result = await node.process({ path: "/tmp/watch.txt", event: "created" });
    const output = result.output as Record<string, unknown>;
    expect(output.path).toBe("/tmp/watch.txt");
    expect(output.event).toBe("created");
    expect(typeof output.detected_at).toBe("string");
  });

  it("FileWatchTriggerNode uses prop defaults", async () => {
    const node = new FileWatchTriggerNode();
    const result = await node.process({});
    const output = result.output as Record<string, unknown>;
    expect(output.path).toBe(".");
    expect(output.event).toBe("modified");
  });
});

// ============================================================
// EXTENDED PLACEHOLDERS
// ============================================================
describe("extended-placeholders — full coverage", () => {
  it("EXTENDED_PLACEHOLDER_NODE_TYPES is an empty array", () => {
    expect(EXTENDED_PLACEHOLDER_NODE_TYPES).toEqual([]);
  });

  it("EXTENDED_PLACEHOLDER_NODES is an empty array", () => {
    expect(EXTENDED_PLACEHOLDER_NODES).toEqual([]);
  });

  it("titleFromNodeType extracts last segment", () => {
    expect(titleFromNodeType("nodetool.foo.Bar")).toBe("Bar");
    expect(titleFromNodeType("SingleSegment")).toBe("SingleSegment");
    expect(titleFromNodeType("a.b.c.D")).toBe("D");
  });

  it("makePlaceholderNode creates a functional node class", async () => {
    const NodeCls = makePlaceholderNode("test.placeholder.MyNode");
    expect((NodeCls as any).nodeType).toBe("test.placeholder.MyNode");
    expect((NodeCls as any).title).toBe("MyNode");
    expect((NodeCls as any).description).toBe("Placeholder node for test.placeholder.MyNode");

    const node = new (NodeCls as any)();

    // "output" key
    expect(await node.process({ output: "a" })).toEqual({ output: "a" });

    // "value" key
    expect(await node.process({ value: "b" })).toEqual({ output: "b" });

    // "input_value" key
    expect(await node.process({ input_value: "c" })).toEqual({ output: "c" });

    // single arbitrary key
    expect(await node.process({ custom: "d" })).toEqual({ output: "d" });

    // multiple keys — returns entire inputs as output
    expect(await node.process({ x: 1, y: 2 })).toEqual({ output: { x: 1, y: 2 } });

    // empty inputs
    expect(await node.process({})).toEqual({ output: {} });
  });
});
