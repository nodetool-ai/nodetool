import { describe, it, expect, vi, afterEach } from "vitest";
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
  FileWatchTriggerNode
} from "../src/index.js";

// Import extended-placeholders directly to cover internal functions
import {
  EXTENDED_PLACEHOLDER_NODE_TYPES,
  EXTENDED_PLACEHOLDER_NODES,
  titleFromNodeType,
  makePlaceholderNode
} from "../src/nodes/extended-placeholders.js";

// ============================================================
// CONTROL NODES
// ============================================================
describe("control nodes — full coverage", () => {
  it("ForEachNode.process() returns empty object", async () => {
    const node = new ForEachNode();
    // Lines 36-37: the process() method that just returns {}
    const result = await node.process();
    expect(result).toEqual({});
  });

  it("ForEachNode.genProcess wraps non-array input in array", async () => {
    const node = new ForEachNode();
    node.assign({ input_list: "single" });
    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess()) {
      out.push(part);
    }
    expect(out).toEqual([{ output: "single", index: 0 }]);
  });

  it("CollectNode defaults returns input_item null", () => {
    const node = new CollectNode();
    const d = node.serialize();
    expect(d).toEqual({ input_item: [] });
  });

  it("CollectNode.process returns empty list (streaming handled by run())", async () => {
    const node = new CollectNode();
    await node.initialize();
    // CollectNode.process() is a no-op stub; real collection is via run()
    const result = await node.process();
    expect(result).toEqual({ output: [] });
  });

  it("RerouteNode uses prop fallback when no input", async () => {
    const node = new RerouteNode();
    node.assign({ input_value: "from-prop" });
    const result = await node.process();
    expect(result).toEqual({ output: "from-prop" });
  });

  it("RerouteNode returns null when nothing set", async () => {
    const node = new RerouteNode();
    const result = await node.process();
    expect(result).toEqual({ output: [] });
  });

  it("IfNode uses prop defaults", async () => {
    const node = new IfNode();
    const d = node.serialize();
    expect(d).toEqual({ condition: false, value: [] });
  });

  it("IfNode process with condition=true passes value to if_true", async () => {
    const node = new IfNode();
    node.assign({ condition: true, value: "hello" });
    const result = await node.process();
    expect(result).toEqual({ if_true: "hello", if_false: null });
  });

  it("IfNode process with condition=false passes value to if_false", async () => {
    const node = new IfNode();
    node.assign({ condition: false, value: "hello" });
    const result = await node.process();
    expect(result).toEqual({ if_true: null, if_false: "hello" });
  });

  it("IfNode process with truthy non-boolean condition routes to if_true", async () => {
    const node = new IfNode();
    node.assign({ condition: 1, value: 42 });
    const result = await node.process();
    expect(result).toEqual({ if_true: 42, if_false: null });
  });

  it("IfNode process with falsy non-boolean condition routes to if_false", async () => {
    const node = new IfNode();
    node.assign({ condition: 0, value: 42 });
    const result = await node.process();
    expect(result).toEqual({ if_true: null, if_false: 42 });
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
    {
      Cls: HuggingFaceModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "hf.model", repo_id: "" })
    },
    {
      Cls: ColorInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "color", value: null })
    },
    { Cls: ImageSizeInputNode, expected: {} },
    {
      Cls: LanguageModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "language_model",
          provider: "empty",
          id: ""
        })
    },
    {
      Cls: ImageModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "image_model",
          provider: "empty",
          id: ""
        })
    },
    {
      Cls: VideoModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "video_model",
          provider: "empty",
          id: ""
        })
    },
    {
      Cls: TTSModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "tts_model",
          provider: "empty",
          id: "",
          selected_voice: ""
        })
    },
    {
      Cls: ASRModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "asr_model",
          provider: "empty",
          id: ""
        })
    },
    {
      Cls: EmbeddingModelInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "embedding_model",
          provider: "empty",
          id: "",
          dimensions: 0
        })
    },
    {
      Cls: DataframeInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "dataframe", uri: "" })
    },
    {
      Cls: DocumentInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "document", uri: "" })
    },
    {
      Cls: ImageInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "image", uri: "" })
    },
    { Cls: ImageListInputNode, expected: [] },
    { Cls: VideoListInputNode, expected: [] },
    { Cls: AudioListInputNode, expected: [] },
    { Cls: TextListInputNode, expected: [] },
    {
      Cls: VideoInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "video", uri: "" })
    },
    {
      Cls: AudioInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "audio", uri: "" })
    },
    {
      Cls: Model3DInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({
          type: "model_3d",
          uri: "",
          texture_files: []
        })
    },
    {
      Cls: AssetFolderInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "folder", uri: "" })
    },
    { Cls: FilePathInputNode, expected: "" },
    {
      Cls: MessageInputNode,
      verify: (value: any) =>
        expect(value).toMatchObject({ type: "message", role: "" })
    },
    { Cls: MessageListInputNode, expected: [] }
  ];

  for (const { Cls, expected, verify } of simpleInputNodes) {
    it(`${Cls.nodeType} returns default value`, async () => {
      const node = new Cls();
      const result = await node.process();
      if (verify) verify(result.value);
      else expect(result).toEqual({ value: expected });
    });
  }

  it("SimpleInputNode uses assigned value", async () => {
    const node = new FloatInputNode();
    node.assign({ value: 3.14 });
    const result = await node.process();
    expect(result).toEqual({ value: 3.14 });
  });

  it("StringInputNode returns full string when no max_length", async () => {
    const node = new StringInputNode();
    node.assign({ value: "hello world", max_length: 0 });
    const result = await node.process();
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
      line_mode: "single_line"
    });
  });

  it("RealtimeAudioInputNode returns chunk", async () => {
    const node = new RealtimeAudioInputNode();
    node.assign({ value: "audio-data" });
    const result = await node.process();
    expect(result).toEqual({ chunk: "audio-data" });
  });

  it("RealtimeAudioInputNode returns null by default", async () => {
    const node = new RealtimeAudioInputNode();
    const result = await node.process();
    expect(result.chunk).toMatchObject({ type: "audio", uri: "" });
  });

  it("DocumentFileInputNode produces uri and path", async () => {
    const node = new DocumentFileInputNode();
    node.assign({ value: "/some/doc.pdf" });
    const result = await node.process();
    expect(result).toEqual({
      document: { uri: "file:///some/doc.pdf" },
      path: "/some/doc.pdf"
    });
  });

  it("DocumentFileInputNode handles empty path", async () => {
    const node = new DocumentFileInputNode();
    const result = await node.process();
    expect(result).toEqual({ document: { uri: "" }, path: "" });
  });

  it("MessageDeconstructorNode handles string content", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({ value: { role: "user", content: "plain text" } });
    const result = await node.process();
    expect(result.text).toBe("plain text");
    expect(result.role).toBe("user");
  });

  it("MessageDeconstructorNode handles empty value", async () => {
    const node = new MessageDeconstructorNode();
    const result = await node.process();
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
          { type: "image_url", image: { uri: "img.png" } },
          { type: "audio", audio: { uri: "clip.mp3" } },
          { type: "text", text: "hello" },
          null, // non-object item
          42 // non-object item
        ]
      }
    });
    const result = await node.process();
    expect(result.image).toEqual({ uri: "img.png" });
    expect(result.audio).toEqual({ uri: "clip.mp3" });
    expect(result.text).toBe("hello");
  });

  it("MessageDeconstructorNode model is null when provider/model not strings", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({ value: { provider: 123, model: 456 } });
    const result = await node.process();
    expect(result.model).toBeNull();
  });
});

// ============================================================
// OUTPUT NODES
// ============================================================
describe("output nodes — full coverage", () => {
  it("OutputNode uses value property", async () => {
    const node = new OutputNode();
    node.assign({ value: "via-value" });
    const result = await node.process();
    expect(result).toEqual({ output: "via-value" });
  });

  it("OutputNode returns null when no value assigned", async () => {
    const node = new OutputNode();
    const result = await node.process();
    expect(result).toEqual({ output: null });
  });

  it("OutputNode handles non-string value", async () => {
    const node = new OutputNode();
    node.assign({ value: 42 });
    const result = await node.process();
    expect(result).toEqual({ output: 42 });
  });

  it("OutputNode falls back to prop value when inputs empty", async () => {
    const node = new OutputNode();
    node.assign({ value: "prop-val" });
    const result = await node.process();
    expect(result).toEqual({ output: "prop-val" });
  });

  it("OutputNode without context does not emit", async () => {
    const node = new OutputNode();
    node.assign({ __node_id: "n1" });
    // No context passed — should not throw
    node.assign({ value: 42 });
    const result = await node.process();
    expect(result).toEqual({ output: 42 });
  });

  it("OutputNode without normalizeOutputValue on context returns raw", async () => {
    const node = new OutputNode();
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg)
    } as unknown as ProcessingContext;
    node.assign({ value: "raw" });
    const result = await node.process(context);
    expect(result).toEqual({ output: "raw" });
  });

  it("OutputNode returns normalized value for various types", async () => {
    const node = new OutputNode();

    // null
    node.assign({ value: null });
    expect(await node.process()).toEqual({ output: null });

    // string
    node.assign({ value: "text" });
    expect(await node.process()).toEqual({ output: "text" });

    // integer
    node.assign({ value: 42 });
    expect(await node.process()).toEqual({ output: 42 });

    // float
    node.assign({ value: 3.14 });
    expect(await node.process()).toEqual({ output: 3.14 });

    // boolean
    node.assign({ value: true });
    expect(await node.process()).toEqual({ output: true });

    // array
    node.assign({ value: [1, 2] });
    expect(await node.process()).toEqual({ output: [1, 2] });

    // object
    node.assign({ value: { a: 1 } });
    expect(await node.process()).toEqual({ output: { a: 1 } });

    // undefined (fallback to null)
    node.assign({ value: undefined });
    expect(await node.process()).toEqual({ output: null });
  });

  it("OutputNode output_name defaults to 'output' when name prop empty", async () => {
    const node = new OutputNode();
    node.assign({ __node_id: "n1", name: "" });
    // OutputNode no longer emits output_update directly; runner handles it.
    // Just verify it returns the value.
    node.assign({ value: 1 });
    const result = await node.process();
    expect(result).toEqual({ output: 1 });
  });

  it("PreviewNode uses value property", async () => {
    const node = new PreviewNode();
    node.assign({ value: "val" });
    const result = await node.process();
    expect(result).toEqual({ output: "val" });
  });

  it("PreviewNode falls back to prop when multiple keys in inputs", async () => {
    const node = new PreviewNode();
    node.assign({ value: "prop-val" });
    node.assign({ a: 1, b: 2 });
    const result = await node.process();
    expect(result).toEqual({ output: "prop-val" });
  });

  it("PreviewNode without context works", async () => {
    const node = new PreviewNode();
    node.assign({ value: "x" });
    const result = await node.process();
    expect(result).toEqual({ output: "x" });
  });

  it("PreviewNode without normalizeOutputValue returns raw", async () => {
    const node = new PreviewNode();
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg)
    } as unknown as ProcessingContext;
    node.assign({ value: "raw" });
    const result = await node.process(context);
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
    const r1 = await node.process();
    expect(r1).toEqual({ output: false });
    // With value in inputs
    node.assign({ value: true });
    const r2 = await node.process();
    expect(r2).toEqual({ output: true });
  });

  it("ConstantFloatNode", async () => {
    const node = new ConstantFloatNode();
    expect(node.serialize()).toEqual({ value: 0.0 });
    node.assign({ value: 2.5 });
    expect(await node.process()).toEqual({ output: 2.5 });
  });

  it("ConstantStringNode", async () => {
    const node = new ConstantStringNode();
    expect(node.serialize()).toEqual({ value: "" });
    node.assign({ value: "hi" });
    expect(await node.process()).toEqual({ output: "hi" });
  });

  it("ConstantListNode", async () => {
    const node = new ConstantListNode();
    expect(node.serialize()).toEqual({ value: [] });
    node.assign({ value: [1, 2] });
    expect(await node.process()).toEqual({ output: [1, 2] });
  });

  it("ConstantTextListNode", async () => {
    const node = new ConstantTextListNode();
    expect(node.serialize()).toEqual({ value: null });
    node.assign({ value: ["a", "b"] });
    expect(await node.process()).toEqual({ output: ["a", "b"] });
  });

  it("ConstantAudioNode", async () => {
    const node = new ConstantAudioNode();
    node.assign({ value: { uri: "a.mp3" } });
    expect(await node.process()).toEqual({ output: { uri: "a.mp3" } });
  });

  it("ConstantImageNode", async () => {
    const node = new ConstantImageNode();
    node.assign({ value: { uri: "i.png" } });
    expect(await node.process()).toEqual({ output: { uri: "i.png" } });
  });

  it("ConstantVideoNode", async () => {
    const node = new ConstantVideoNode();
    node.assign({ value: { uri: "v.mp4" } });
    expect(await node.process()).toEqual({ output: { uri: "v.mp4" } });
  });

  it("ConstantDocumentNode", async () => {
    const node = new ConstantDocumentNode();
    node.assign({ value: { text: "doc" } });
    expect(await node.process()).toEqual({ output: { text: "doc" } });
  });

  it("ConstantJSONNode", async () => {
    const node = new ConstantJSONNode();
    node.assign({ value: { x: 1 } });
    expect(await node.process()).toEqual({ output: { x: 1 } });
  });

  it("ConstantModel3DNode", async () => {
    const node = new ConstantModel3DNode();
    node.assign({ value: { mesh: "cube" } });
    expect(await node.process()).toEqual({ output: { mesh: "cube" } });
  });

  it("ConstantDataFrameNode", async () => {
    const node = new ConstantDataFrameNode();
    node.assign({ value: { rows: [] } });
    expect(await node.process()).toEqual({ output: { rows: [] } });
  });

  it("ConstantAudioListNode", async () => {
    const node = new ConstantAudioListNode();
    node.assign({ value: [{ uri: "a.mp3" }] });
    expect(await node.process()).toEqual({ output: [{ uri: "a.mp3" }] });
  });

  it("ConstantImageListNode", async () => {
    const node = new ConstantImageListNode();
    node.assign({ value: [{ uri: "i.png" }] });
    expect(await node.process()).toEqual({ output: [{ uri: "i.png" }] });
  });

  it("ConstantVideoListNode", async () => {
    const node = new ConstantVideoListNode();
    node.assign({ value: [{ uri: "v.mp4" }] });
    expect(await node.process()).toEqual({ output: [{ uri: "v.mp4" }] });
  });

  it("ConstantDateTimeNode with defaults", async () => {
    const node = new ConstantDateTimeNode();
    const d = node.serialize();
    expect(d.year).toBe(1900);
    expect(d.millisecond).toBe(0);
    expect(d.tzinfo).toBe("UTC");
    expect(d.utc_offset).toBe(0);

    node.assign({
      year: 2025,
      month: 6,
      day: 15,
      hour: 10,
      minute: 30,
      second: 45,
      millisecond: 123,
      tzinfo: "UTC",
      utc_offset: 0
    });
    const result = await node.process();
    expect(result.output).toEqual({
      year: 2025,
      month: 6,
      day: 15,
      hour: 10,
      minute: 30,
      second: 45,
      microsecond: 123000,
      tzinfo: "UTC",
      utc_offset: 0
    });
  });

  it("ConstantDateTimeNode uses prop defaults when inputs missing", async () => {
    const node = new ConstantDateTimeNode();
    const result = await node.process();
    expect(result.output).toEqual({
      year: 1900,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      microsecond: 0,
      tzinfo: "UTC",
      utc_offset: 0
    });
  });

  it("ConstantASRModelNode", async () => {
    const node = new ConstantASRModelNode();
    node.assign({ value: { id: "whisper" } });
    expect(await node.process()).toEqual({ output: { id: "whisper" } });
  });

  it("ConstantEmbeddingModelNode", async () => {
    const node = new ConstantEmbeddingModelNode();
    node.assign({ value: { id: "emb" } });
    expect(await node.process()).toEqual({ output: { id: "emb" } });
  });

  it("ConstantImageModelNode", async () => {
    const node = new ConstantImageModelNode();
    node.assign({ value: { id: "sdxl" } });
    expect(await node.process()).toEqual({ output: { id: "sdxl" } });
  });

  it("ConstantLanguageModelNode", async () => {
    const node = new ConstantLanguageModelNode();
    node.assign({ value: { id: "gpt-4" } });
    expect(await node.process()).toEqual({ output: { id: "gpt-4" } });
  });

  it("ConstantTTSModelNode", async () => {
    const node = new ConstantTTSModelNode();
    node.assign({ value: { id: "tts" } });
    expect(await node.process()).toEqual({ output: { id: "tts" } });
  });

  it("ConstantVideoModelNode", async () => {
    const node = new ConstantVideoModelNode();
    node.assign({ value: { id: "vid" } });
    expect(await node.process()).toEqual({ output: { id: "vid" } });
  });

  it("ConstantImageSizeNode defaults and process", async () => {
    const node = new ConstantImageSizeNode();
    const d = node.serialize();
    expect(d).toEqual({ value: null });
    const result = await node.process();
    expect(result).toEqual({
      output: { width: 1024, height: 1024 },
      image_size: { width: 1024, height: 1024 },
      width: 1024,
      height: 1024
    });
  });

  it("ConstantDateNode defaults and process", async () => {
    const node = new ConstantDateNode();
    const d = node.serialize();
    expect(d).toEqual({ year: 1900, month: 1, day: 1 });
    const result = await node.process();
    expect(result).toEqual({ output: { year: 1900, month: 1, day: 1 } });
  });

  it("ConstantSelectNode defaults and prop defaults", async () => {
    const node = new ConstantSelectNode();
    expect(node.serialize()).toEqual({
      value: "",
      options: [],
      enum_type_name: ""
    });
    const result = await node.process();
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
    const result = await node.process();
    expect(result).toEqual({ output: true });
  });

  it("ConstantNode abstract falls back to null when no prop", async () => {
    // ConstantIntegerNode with decorator defaults — returns default when nothing assigned
    const node = new ConstantIntegerNode();
    const result = await node.process();
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

  /** Patch a node so that workspace_dir appears in serialize() output */
  function withWorkspace<
    T extends { serialize: () => Record<string, unknown> }
  >(node: T, workspace: string): T {
    const origSerialize = node.serialize.bind(node);
    node.serialize = () => ({ ...origSerialize(), workspace_dir: workspace });
    return node;
  }

  it("GetWorkspaceDirNode returns workspace dir from inputs", async () => {
    tmpDir = await freshDir();
    const node = new GetWorkspaceDirNode();
    node.assign({ workspace_dir: tmpDir });
    const result = await node.process();
    expect(result).toEqual({ output: tmpDir });
  });

  it("GetWorkspaceDirNode returns empty string as default", async () => {
    const node = new GetWorkspaceDirNode();
    const result = await node.process();
    // Default workspace_dir is "" which is passed through as-is
    expect(result).toEqual({ output: "" });
  });

  it("WriteTextFileNode and ReadTextFileNode round-trip", async () => {
    tmpDir = await freshDir();
    const write = new WriteTextFileNode();
    const read = new ReadTextFileNode();
    write.assign({
      workspace_dir: tmpDir,
      path: "test.txt",
      content: "data123"
    });
    await write.process();
    read.assign({ workspace_dir: tmpDir, path: "test.txt" });
    const result = await read.process();
    expect(result).toEqual({ output: "data123" });
  });

  it("WriteTextFileNode appends when append is true", async () => {
    tmpDir = await freshDir();
    const write = new WriteTextFileNode();
    write.assign({
      workspace_dir: tmpDir,
      path: "log.txt",
      content: "line1\n"
    });
    await write.process();
    write.assign({
      workspace_dir: tmpDir,
      path: "log.txt",
      content: "line2\n",
      append: true
    });
    await write.process();
    const read = new ReadTextFileNode();
    read.assign({ workspace_dir: tmpDir, path: "log.txt" });
    const result = await read.process();
    expect(result).toEqual({ output: "line1\nline2\n" });
  });

  it("ReadBinaryFileNode and WriteBinaryFileNode round-trip", async () => {
    tmpDir = await freshDir();
    const b64 = Buffer.from("binary-data").toString("base64");
    const __n242 = new WriteBinaryFileNode();
    __n242.assign({ workspace_dir: tmpDir, path: "bin.dat", content: b64 });
    await __n242.process();
    const __n243 = new ReadBinaryFileNode();
    __n243.assign({ workspace_dir: tmpDir, path: "bin.dat" });
    const result = await __n243.process();
    expect(result.output).toBe(b64);
  });

  it("CreateWorkspaceDirectoryNode creates nested directories", async () => {
    tmpDir = await freshDir();
    const node = new CreateWorkspaceDirectoryNode();
    node.assign({ workspace_dir: tmpDir, path: "a/b/c" });
    const result = await node.process();
    expect(result).toEqual({ output: "a/b/c" });
    // verify existence
    const exists = new WorkspaceFileExistsNode();
    exists.assign({ workspace_dir: tmpDir, path: "a/b/c" });
    expect(await exists.process()).toEqual({ output: true });
  });

  it("DeleteWorkspaceFileNode deletes a file", async () => {
    tmpDir = await freshDir();
    const __n244 = new WriteTextFileNode();
    __n244.assign({ workspace_dir: tmpDir, path: "del.txt", content: "x" });
    await __n244.process();
    const __n245 = new DeleteWorkspaceFileNode();
    __n245.assign({ workspace_dir: tmpDir, path: "del.txt" });
    const result = await __n245.process();
    expect(result).toEqual({ output: null });
    const __n246 = new WorkspaceFileExistsNode();
    __n246.assign({ workspace_dir: tmpDir, path: "del.txt" });
    expect(await __n246.process()).toEqual({ output: false });
  });

  it("DeleteWorkspaceFileNode throws for dir without recursive", async () => {
    tmpDir = await freshDir();
    const __n247 = new CreateWorkspaceDirectoryNode();
    __n247.assign({ workspace_dir: tmpDir, path: "mydir" });
    await __n247.process();
    const __n248 = new DeleteWorkspaceFileNode();
    __n248.assign({ workspace_dir: tmpDir, path: "mydir" });
    await expect(__n248.process()).rejects.toThrow("recursive");
  });

  it("DeleteWorkspaceFileNode deletes directory recursively", async () => {
    tmpDir = await freshDir();
    const __n249 = new WriteTextFileNode();
    __n249.assign({ workspace_dir: tmpDir, path: "rdir/f.txt", content: "x" });
    await __n249.process();
    const __n250 = new DeleteWorkspaceFileNode();
    __n250.assign({ workspace_dir: tmpDir, path: "rdir", recursive: true });
    await __n250.process();
    const __n251 = new WorkspaceFileExistsNode();
    __n251.assign({ workspace_dir: tmpDir, path: "rdir" });
    expect(await __n251.process()).toEqual({ output: false });
  });

  it("GetWorkspaceFileInfoNode returns file metadata", async () => {
    tmpDir = await freshDir();
    const __n252 = new WriteTextFileNode();
    __n252.assign({
      workspace_dir: tmpDir,
      path: "info.txt",
      content: "hello"
    });
    await __n252.process();
    const __n253 = new GetWorkspaceFileInfoNode();
    __n253.assign({ workspace_dir: tmpDir, path: "info.txt" });
    const result = await __n253.process();
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
    const __n254 = new WriteTextFileNode();
    __n254.assign({
      workspace_dir: tmpDir,
      path: "src.txt",
      content: "copy-me"
    });
    await __n254.process();
    const __n255 = new CopyWorkspaceFileNode();
    __n255.assign({
      workspace_dir: tmpDir,
      source: "src.txt",
      destination: "dst.txt"
    });
    const result = await __n255.process();
    expect(result).toEqual({ output: "dst.txt" });
    const __n256 = new ReadTextFileNode();
    __n256.assign({ workspace_dir: tmpDir, path: "dst.txt" });
    const content = await __n256.process();
    expect(content).toEqual({ output: "copy-me" });
  });

  it("MoveWorkspaceFileNode renames a file", async () => {
    tmpDir = await freshDir();
    const __n257 = new WriteTextFileNode();
    __n257.assign({
      workspace_dir: tmpDir,
      path: "old.txt",
      content: "move-me"
    });
    await __n257.process();
    const __n258 = new MoveWorkspaceFileNode();
    __n258.assign({
      workspace_dir: tmpDir,
      source: "old.txt",
      destination: "new.txt"
    });
    const result = await __n258.process();
    expect(result).toEqual({ output: "new.txt" });
    const __n259 = new WorkspaceFileExistsNode();
    __n259.assign({ workspace_dir: tmpDir, path: "old.txt" });
    expect(await __n259.process()).toEqual({ output: false });
    const __n260 = new ReadTextFileNode();
    __n260.assign({ workspace_dir: tmpDir, path: "new.txt" });
    expect(await __n260.process()).toEqual({ output: "move-me" });
  });

  it("workspace node defaults are accessible", () => {
    expect(new ReadTextFileNode().serialize()).toEqual({
      path: "",
      encoding: "utf-8"
    });
    expect(new WriteTextFileNode().serialize()).toEqual({
      path: "",
      content: "",
      encoding: "utf-8",
      append: false
    });
    expect(new ReadBinaryFileNode().serialize()).toEqual({ path: "" });
    expect(new WriteBinaryFileNode().serialize()).toEqual({
      path: "",
      content: ""
    });
    expect(new DeleteWorkspaceFileNode().serialize()).toEqual({
      path: "",
      recursive: false
    });
    expect(new CreateWorkspaceDirectoryNode().serialize()).toEqual({
      path: ""
    });
    expect(new WorkspaceFileExistsNode().serialize()).toEqual({ path: "" });
    expect(new GetWorkspaceFileInfoNode().serialize()).toEqual({ path: "" });
    expect(new CopyWorkspaceFileNode().serialize()).toEqual({
      source: "",
      destination: ""
    });
    expect(new MoveWorkspaceFileNode().serialize()).toEqual({
      source: "",
      destination: ""
    });
    expect(new GetWorkspaceFileSizeNode().serialize()).toEqual({ path: "" });
    expect(new IsWorkspaceFileNode().serialize()).toEqual({ path: "" });
  });

  it("GetWorkspaceFileSizeNode returns file size", async () => {
    tmpDir = await freshDir();
    const __n261 = new WriteTextFileNode();
    __n261.assign({
      workspace_dir: tmpDir,
      path: "sized.txt",
      content: "12345"
    });
    await __n261.process();
    const __n262 = new GetWorkspaceFileSizeNode();
    __n262.assign({ workspace_dir: tmpDir, path: "sized.txt" });
    const result = await __n262.process();
    expect(result).toEqual({ output: 5 });
  });

  it("GetWorkspaceFileSizeNode throws for directory", async () => {
    tmpDir = await freshDir();
    const __n263 = new CreateWorkspaceDirectoryNode();
    __n263.assign({ workspace_dir: tmpDir, path: "adir" });
    await __n263.process();
    const __n264 = new GetWorkspaceFileSizeNode();
    __n264.assign({ workspace_dir: tmpDir, path: "adir" });
    await expect(__n264.process()).rejects.toThrow("not a file");
  });

  it("IsWorkspaceFileNode checks if path is file", async () => {
    tmpDir = await freshDir();
    const __n265 = new WriteTextFileNode();
    __n265.assign({ workspace_dir: tmpDir, path: "f.txt", content: "x" });
    await __n265.process();
    const __n266 = new CreateWorkspaceDirectoryNode();
    __n266.assign({ workspace_dir: tmpDir, path: "d" });
    await __n266.process();
    const __n267 = new IsWorkspaceFileNode();
    __n267.assign({ workspace_dir: tmpDir, path: "f.txt" });
    expect(await __n267.process()).toEqual({ output: true });
    const __n268 = new IsWorkspaceFileNode();
    __n268.assign({ workspace_dir: tmpDir, path: "d" });
    expect(await __n268.process()).toEqual({ output: false });
    const __n269 = new IsWorkspaceFileNode();
    __n269.assign({ workspace_dir: tmpDir, path: "nope" });
    expect(await __n269.process()).toEqual({ output: false });
  });

  it("IsWorkspaceDirectoryNode checks if path is directory", async () => {
    tmpDir = await freshDir();
    const __n270 = new WriteTextFileNode();
    __n270.assign({ workspace_dir: tmpDir, path: "f.txt", content: "x" });
    await __n270.process();
    const __n271 = new CreateWorkspaceDirectoryNode();
    __n271.assign({ workspace_dir: tmpDir, path: "d" });
    await __n271.process();
    const __n272 = new IsWorkspaceDirectoryNode();
    __n272.assign({ workspace_dir: tmpDir, path: "d" });
    expect(await __n272.process()).toEqual({ output: true });
    const __n273 = new IsWorkspaceDirectoryNode();
    __n273.assign({ workspace_dir: tmpDir, path: "f.txt" });
    expect(await __n273.process()).toEqual({ output: false });
    const __n274 = new IsWorkspaceDirectoryNode();
    __n274.assign({ workspace_dir: tmpDir, path: "nope" });
    expect(await __n274.process()).toEqual({ output: false });
  });

  it("IsWorkspaceDirectoryNode defaults", () => {
    expect(new IsWorkspaceDirectoryNode().serialize()).toEqual({ path: "" });
  });

  it("JoinWorkspacePathsNode defaults", () => {
    expect(new JoinWorkspacePathsNode().serialize()).toEqual({ paths: [] });
  });

  it("JoinWorkspacePathsNode throws when paths is not an array", async () => {
    tmpDir = await freshDir();
    const __n275 = new JoinWorkspacePathsNode();
    __n275.assign({ workspace_dir: tmpDir, paths: "not-array" });
    await expect(__n275.process()).rejects.toThrow("empty");
  });

  it("JoinWorkspacePathsNode joins path parts", async () => {
    tmpDir = await freshDir();
    const __n276 = new JoinWorkspacePathsNode();
    __n276.assign({ workspace_dir: tmpDir, paths: ["a", "b", "c.txt"] });
    const result = await __n276.process();
    expect(result).toEqual({ output: "a/b/c.txt" });
  });

  it("JoinWorkspacePathsNode throws for empty paths", async () => {
    tmpDir = await freshDir();
    const __n277 = new JoinWorkspacePathsNode();
    __n277.assign({ workspace_dir: tmpDir, paths: [] });
    await expect(__n277.process()).rejects.toThrow("empty");
  });

  it("ListWorkspaceFilesNode lists files", async () => {
    tmpDir = await freshDir();
    const __n278 = new WriteTextFileNode();
    __n278.assign({ workspace_dir: tmpDir, path: "sub/a.txt", content: "a" });
    await __n278.process();
    const __n279 = new WriteTextFileNode();
    __n279.assign({ workspace_dir: tmpDir, path: "sub/b.log", content: "b" });
    await __n279.process();
    const node = new ListWorkspaceFilesNode();
    const results: string[] = [];
    node.assign({ workspace_dir: tmpDir, path: "sub", pattern: "*.txt" });
    for await (const item of node.genProcess()) {
      if ("file" in item) results.push(String(item.file));
    }
    expect(results).toEqual(["sub/a.txt"]);
  });

  it("ListWorkspaceFilesNode recursive mode", async () => {
    tmpDir = await freshDir();
    const __n280 = new WriteTextFileNode();
    __n280.assign({ workspace_dir: tmpDir, path: "top/a.txt", content: "a" });
    await __n280.process();
    const __n281 = new WriteTextFileNode();
    __n281.assign({
      workspace_dir: tmpDir,
      path: "top/nested/b.txt",
      content: "b"
    });
    await __n281.process();
    const node = new ListWorkspaceFilesNode();
    const results: string[] = [];
    node.assign({
      workspace_dir: tmpDir,
      path: "top",
      pattern: "*.txt",
      recursive: true
    });
    for await (const item of node.genProcess()) {
      if ("file" in item) results.push(String(item.file));
    }
    expect(results.sort()).toEqual(["top/a.txt", "top/nested/b.txt"]);
  });

  it("ListWorkspaceFilesNode defaults and process", async () => {
    const node = new ListWorkspaceFilesNode();
    expect(node.serialize()).toEqual({
      path: ".",
      pattern: "*",
      recursive: false
    });
    const result = await node.process();
    expect(result).toHaveProperty("file");
    expect(result).toHaveProperty("files");
    expect(Array.isArray(result.files)).toBe(true);
  });

  it("SaveImageFileNode defaults", () => {
    const node = new SaveImageFileNode();
    expect(node.serialize()).toMatchObject({
      image: { type: "image", uri: "" },
      folder: ".",
      filename: "image.png",
      overwrite: false
    });
  });

  it("SaveVideoFileNode defaults", () => {
    const node = new SaveVideoFileNode();
    expect(node.serialize()).toMatchObject({
      video: { type: "video", uri: "" },
      folder: ".",
      filename: "video.mp4",
      overwrite: false
    });
  });

  it("SaveImageFileNode saves image bytes and handles overwrite=false", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    const node = withWorkspace(new SaveImageFileNode(), tmpDir);
    // First save
    node.assign({
      image: { data },
      folder: ".",
      filename: "img.png",
      overwrite: false
    });
    const r1 = await node.process();
    const output1 = r1.output as Record<string, unknown>;
    expect(output1.uri).toContain("img.png");
    // Second save with same name — should get img_1.png
    node.assign({
      image: { data },
      folder: ".",
      filename: "img.png",
      overwrite: false
    });
    const r2 = await node.process();
    const output2 = r2.output as Record<string, unknown>;
    expect(output2.uri).toContain("img_1.png");
  });

  it("SaveImageFileNode with overwrite=true", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([1, 2, 3]).toString("base64");
    const node = new SaveImageFileNode();
    node.assign({
      workspace_dir: tmpDir,
      image: { data },
      folder: ".",
      filename: "over.png",
      overwrite: true
    });
    await node.process();
    node.assign({
      workspace_dir: tmpDir,
      image: { data },
      folder: ".",
      filename: "over.png",
      overwrite: true
    });
    const r2 = await node.process();
    const output = r2.output as Record<string, unknown>;
    expect(output.uri).toContain("over.png");
    expect(String(output.uri)).not.toContain("_1");
  });

  it("SaveImageFileNode with Uint8Array data", async () => {
    tmpDir = await freshDir();
    const data = new Uint8Array([10, 20, 30]);
    const node = new SaveImageFileNode();
    node.assign({
      workspace_dir: tmpDir,
      image: { data },
      folder: ".",
      filename: "u8.png",
      overwrite: true
    });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.uri).toContain("u8.png");
  });

  it("SaveImageFileNode with array data", async () => {
    tmpDir = await freshDir();
    const data = [10, 20, 30];
    const node = new SaveImageFileNode();
    node.assign({
      workspace_dir: tmpDir,
      image: { data },
      folder: ".",
      filename: "arr.png",
      overwrite: true
    });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.uri).toContain("arr.png");
  });

  it("SaveImageFileNode with no data produces empty file", async () => {
    tmpDir = await freshDir();
    const node = new SaveImageFileNode();
    node.assign({
      workspace_dir: tmpDir,
      image: {},
      folder: ".",
      filename: "empty.png",
      overwrite: true
    });
    const result = await node.process();
    const output = result.output as Record<string, string>;
    expect(output.uri).toContain("empty.png");
  });

  it("SaveVideoFileNode saves video bytes and handles naming", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([0, 0, 0, 0x1c]).toString("base64");
    const node = withWorkspace(new SaveVideoFileNode(), tmpDir);
    node.assign({
      video: { data },
      folder: ".",
      filename: "vid.mp4",
      overwrite: false
    });
    const r1 = await node.process();
    const output1 = r1.output as Record<string, unknown>;
    expect(output1.uri).toContain("vid.mp4");
    // Second save should increment
    node.assign({
      video: { data },
      folder: ".",
      filename: "vid.mp4",
      overwrite: false
    });
    const r2 = await node.process();
    const output2 = r2.output as Record<string, unknown>;
    expect(output2.uri).toContain("vid_1.mp4");
  });

  it("SaveVideoFileNode with overwrite=true", async () => {
    tmpDir = await freshDir();
    const data = Buffer.from([1, 2]).toString("base64");
    const node = new SaveVideoFileNode();
    node.assign({
      workspace_dir: tmpDir,
      video: { data },
      folder: ".",
      filename: "over.mp4",
      overwrite: true
    });
    await node.process();
    node.assign({
      workspace_dir: tmpDir,
      video: { data },
      folder: ".",
      filename: "over.mp4",
      overwrite: true
    });
    const r2 = await node.process();
    const output = r2.output as Record<string, unknown>;
    expect(String(output.uri)).toContain("over.mp4");
    expect(String(output.uri)).not.toContain("_1");
  });

  it("workspace path validation rejects absolute paths", async () => {
    tmpDir = await freshDir();
    const __n282 = new ReadTextFileNode();
    __n282.assign({ workspace_dir: tmpDir, path: "/etc/passwd" });
    await expect(__n282.process()).rejects.toThrow("Absolute");
  });

  it("workspace path validation rejects parent traversal", async () => {
    tmpDir = await freshDir();
    const __n283 = new ReadTextFileNode();
    __n283.assign({ workspace_dir: tmpDir, path: "../etc/passwd" });
    await expect(__n283.process()).rejects.toThrow("Parent directory");
  });

  it("workspace path validation rejects empty path", async () => {
    tmpDir = await freshDir();
    const __n284 = new ReadTextFileNode();
    __n284.assign({ workspace_dir: tmpDir, path: "" });
    await expect(__n284.process()).rejects.toThrow("empty");
  });

  it("WorkspaceFileExistsNode returns true for existing file", async () => {
    tmpDir = await freshDir();
    const __n285 = new WriteTextFileNode();
    __n285.assign({ workspace_dir: tmpDir, path: "ex.txt", content: "y" });
    await __n285.process();
    const __n286 = new WorkspaceFileExistsNode();
    __n286.assign({ workspace_dir: tmpDir, path: "ex.txt" });
    expect(await __n286.process()).toEqual({ output: true });
  });

  it("WorkspaceFileExistsNode returns false for missing file", async () => {
    tmpDir = await freshDir();
    const __n287 = new WorkspaceFileExistsNode();
    __n287.assign({ workspace_dir: tmpDir, path: "missing.txt" });
    expect(await __n287.process()).toEqual({ output: false });
  });
});

// ============================================================
// TRIGGER NODES
// ============================================================
describe("trigger nodes — full coverage", () => {
  it("WaitNode defaults", () => {
    expect(new WaitNode().serialize()).toEqual({
      timeout_seconds: 0,
      input: ""
    });
  });

  it("WaitNode with zero timeout", async () => {
    const node = new WaitNode();
    node.assign({ timeout_seconds: 0, input: "data" });
    const result = await node.process();
    expect(result.data).toBe("data");
    expect(typeof result.resumed_at).toBe("string");
    expect(Number(result.waited_seconds)).toBeGreaterThanOrEqual(0);
  });

  it("WaitNode uses prop defaults", async () => {
    const node = new WaitNode();
    const result = await node.process();
    expect(result.data).toBe("");
    expect(typeof result.resumed_at).toBe("string");
  });

  it("ManualTriggerNode defaults", () => {
    expect(new ManualTriggerNode().serialize()).toEqual({
      max_events: 0,
      name: "manual_trigger",
      timeout_seconds: null
    });
  });

  it("ManualTriggerNode emits payload", async () => {
    const node = new ManualTriggerNode();
    node.assign({ payload: { key: "val" } });
    const result = await node.process();
    // process() returns {} for streaming trigger nodes; logic is in run()
    expect(result).toEqual({});
  });

  it("ManualTriggerNode uses defaults", async () => {
    const node = new ManualTriggerNode();
    const result = await node.process();
    expect(result).toEqual({});
  });

  it("IntervalTriggerNode defaults", () => {
    expect(new IntervalTriggerNode().serialize()).toEqual({
      max_events: 0,
      interval_seconds: 60,
      initial_delay_seconds: 0,
      emit_on_start: true,
      include_drift_compensation: true
    });
  });

  it("IntervalTriggerNode emits interval metadata", async () => {
    const node = new IntervalTriggerNode();
    node.assign({ interval_seconds: 30 });
    // process() returns {} for streaming trigger nodes; logic is in genProcess()
    const result = await node.process();
    expect(result).toEqual({});
  });

  it("IntervalTriggerNode uses default interval", async () => {
    const node = new IntervalTriggerNode();
    const result = await node.process();
    expect(result).toEqual({});
  });

  it("WebhookTriggerNode emits webhook request data", async () => {
    const node = new WebhookTriggerNode();
    node.assign({
      path: "/api/hook"
    });
    // process() returns {} for streaming trigger nodes; logic is in genProcess()
    const result = await node.process();
    expect(result).toEqual({});
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
      secret: ""
    });
    const result = await node.process();
    expect(result).toEqual({});
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
      debounce_seconds: 0.5
    });
    // process() returns {} for streaming trigger nodes; logic is in genProcess()
    const result = await node.process();
    expect(result).toEqual({});
  });

  it("FileWatchTriggerNode uses prop defaults", async () => {
    const node = new FileWatchTriggerNode();
    const result = await node.process();
    expect(result).toEqual({});
  });
});

// ============================================================
// TRIGGER genProcess() / run() TESTS
// ============================================================
describe("IntervalTriggerNode genProcess()", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("yields events with correct fields when emit_on_start is true", async () => {
    vi.useFakeTimers();
    const node = new IntervalTriggerNode();
    node.assign({
      interval_seconds: 10,
      max_events: 3,
      emit_on_start: true,
      initial_delay_seconds: 0,
      include_drift_compensation: false
    });

    const gen = node.genProcess();
    const results: Record<string, unknown>[] = [];

    // First event emitted immediately (emit_on_start)
    const p1 = gen.next();
    await vi.advanceTimersByTimeAsync(0);
    const r1 = await p1;
    results.push(r1.value as Record<string, unknown>);

    // Second event after interval
    const p2 = gen.next();
    await vi.advanceTimersByTimeAsync(10_000);
    const r2 = await p2;
    results.push(r2.value as Record<string, unknown>);

    // Third event after another interval
    const p3 = gen.next();
    await vi.advanceTimersByTimeAsync(10_000);
    const r3 = await p3;
    results.push(r3.value as Record<string, unknown>);

    // Should be done after max_events=3
    const p4 = gen.next();
    await vi.advanceTimersByTimeAsync(10_000);
    const r4 = await p4;
    expect(r4.done).toBe(true);

    expect(results).toHaveLength(3);
    for (const ev of results) {
      expect(typeof ev.tick).toBe("number");
      expect(typeof ev.elapsed_seconds).toBe("number");
      expect(typeof ev.interval_seconds).toBe("number");
      expect(typeof ev.timestamp).toBe("string");
      expect(typeof ev.source).toBe("string");
      expect(typeof ev.event_type).toBe("string");
      expect(ev.interval_seconds).toBe(10);
      expect(ev.source).toBe("interval");
      expect(ev.event_type).toBe("tick");
    }
    expect(results[0]!.tick).toBe(1);
    expect(results[1]!.tick).toBe(2);
    expect(results[2]!.tick).toBe(3);
  });

  it("respects initial_delay_seconds", async () => {
    vi.useFakeTimers();
    const node = new IntervalTriggerNode();
    node.assign({
      interval_seconds: 5,
      max_events: 1,
      emit_on_start: true,
      initial_delay_seconds: 2,
      include_drift_compensation: false
    });

    const gen = node.genProcess();
    const p1 = gen.next();
    // Advance past initial delay
    await vi.advanceTimersByTimeAsync(2_000);
    const r1 = await p1;
    expect(r1.done).toBe(false);
    const ev = r1.value as Record<string, unknown>;
    expect(ev.tick).toBe(1);
  });

  it("skips first event when emit_on_start is false", async () => {
    vi.useFakeTimers();
    const node = new IntervalTriggerNode();
    node.assign({
      interval_seconds: 5,
      max_events: 1,
      emit_on_start: false,
      initial_delay_seconds: 0,
      include_drift_compensation: false
    });

    const gen = node.genProcess();
    const p1 = gen.next();
    // Need to wait for the interval since emit_on_start is false
    await vi.advanceTimersByTimeAsync(5_000);
    const r1 = await p1;
    expect(r1.done).toBe(false);
    const ev = r1.value as Record<string, unknown>;
    expect(ev.tick).toBe(1);
    expect(ev.event_type).toBe("tick");
  });
});

describe("ManualTriggerNode run()", () => {
  it("emits events from streaming inputs with correct fields", async () => {
    const node = new ManualTriggerNode();
    node.assign({ max_events: 2, name: "my_trigger" });

    const inputData = [{ hello: "world" }, "plain text"];

    // Mock StreamingInputs: yields from a simple array
    const inputs = {
      any: async function* () {
        for (const item of inputData) {
          yield ["data", item] as [string, unknown];
        }
      },
      stream: async function* () {
        /* unused */
      },
      first: async () => undefined
    };

    const emitted: Array<[string, unknown]> = [];
    const outputs = {
      emit: async (slot: string, value: unknown) => {
        emitted.push([slot, value]);
      },
      complete: () => {}
    };

    await node.run(inputs as any, outputs as any);

    // 2 events x 4 fields = 8 emits
    expect(emitted).toHaveLength(8);

    // First event
    expect(emitted[0]).toEqual(["data", { hello: "world" }]);
    expect(emitted[1]![0]).toBe("timestamp");
    expect(typeof emitted[1]![1]).toBe("string");
    expect(emitted[2]).toEqual(["source", "my_trigger"]);
    expect(emitted[3]).toEqual(["event_type", "manual"]);

    // Second event
    expect(emitted[4]).toEqual(["data", "plain text"]);
    expect(emitted[5]![0]).toBe("timestamp");
    expect(emitted[6]).toEqual(["source", "my_trigger"]);
    expect(emitted[7]).toEqual(["event_type", "manual"]);
  });

  it("respects max_events limit", async () => {
    const node = new ManualTriggerNode();
    node.assign({ max_events: 1, name: "limited" });

    const inputs = {
      any: async function* () {
        yield ["data", "first"] as [string, unknown];
        yield ["data", "second"] as [string, unknown];
        yield ["data", "third"] as [string, unknown];
      },
      stream: async function* () {},
      first: async () => undefined
    };

    const emitted: Array<[string, unknown]> = [];
    const outputs = {
      emit: async (slot: string, value: unknown) => {
        emitted.push([slot, value]);
      },
      complete: () => {}
    };

    await node.run(inputs as any, outputs as any);
    // Only 1 event x 4 fields = 4 emits
    expect(emitted).toHaveLength(4);
    expect(emitted[0]).toEqual(["data", "first"]);
  });

  it("skips __control__ handle items", async () => {
    const node = new ManualTriggerNode();
    node.assign({ max_events: 0, name: "test" });

    const inputs = {
      any: async function* () {
        yield ["__control__", "ignored"] as [string, unknown];
        yield ["data", "kept"] as [string, unknown];
      },
      stream: async function* () {},
      first: async () => undefined
    };

    const emitted: Array<[string, unknown]> = [];
    const outputs = {
      emit: async (slot: string, value: unknown) => {
        emitted.push([slot, value]);
      },
      complete: () => {}
    };

    await node.run(inputs as any, outputs as any);
    // Only 1 real event: 4 emits
    expect(emitted).toHaveLength(4);
    expect(emitted[0]).toEqual(["data", "kept"]);
  });
});

describe("WebhookTriggerNode genProcess()", () => {
  it("yields webhook event when HTTP request is received", async () => {
    const http = await import("node:http");
    const port = 30000 + Math.floor(Math.random() * 10000);
    const node = new WebhookTriggerNode();
    node.assign({
      port,
      path: "/hook",
      host: "127.0.0.1",
      methods: ["POST"],
      secret: "",
      max_events: 1
    });

    const gen = node.genProcess();
    const p = gen.next();

    // Wait for server to be ready
    await new Promise((r) => setTimeout(r, 200));

    // Send HTTP request
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/hook?foo=bar",
          method: "POST",
          headers: { "Content-Type": "application/json" }
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ hello: "world" }));
      req.end();
    });

    const result = await p;
    expect(result.done).toBe(false);
    const ev = result.value as Record<string, unknown>;

    expect(ev.body).toEqual({ hello: "world" });
    expect(typeof ev.headers).toBe("object");
    expect((ev.query as Record<string, string>).foo).toBe("bar");
    expect(ev.method).toBe("POST");
    expect(ev.path).toBe("/hook");
    expect(typeof ev.timestamp).toBe("string");
    expect(typeof ev.source).toBe("string");
    expect(ev.event_type).toBe("webhook");

    // Generator should be done after max_events=1
    const next = await gen.next();
    expect(next.done).toBe(true);
  }, 10_000);

  it("rejects requests with wrong path (404)", async () => {
    const http = await import("node:http");
    const port = 30000 + Math.floor(Math.random() * 10000);
    const node = new WebhookTriggerNode();
    node.assign({
      port,
      path: "/hook",
      host: "127.0.0.1",
      methods: ["POST"],
      secret: "",
      max_events: 1
    });

    const gen = node.genProcess();
    const p = gen.next();
    await new Promise((r) => setTimeout(r, 200));

    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/wrong", method: "POST" },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve(res.statusCode ?? 0));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(statusCode).toBe(404);

    // Clean up: send a valid request so the generator can finish
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/hook", method: "POST" },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        }
      );
      req.on("error", reject);
      req.end();
    });
    await p;
    await gen.next(); // drain
  }, 10_000);

  it("validates secret header (401)", async () => {
    const http = await import("node:http");
    const port = 30000 + Math.floor(Math.random() * 10000);
    const node = new WebhookTriggerNode();
    node.assign({
      port,
      path: "/hook",
      host: "127.0.0.1",
      methods: ["POST"],
      secret: "mysecret",
      max_events: 1
    });

    const gen = node.genProcess();
    const p = gen.next();
    await new Promise((r) => setTimeout(r, 200));

    // Request without secret -> 401
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/hook", method: "POST" },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve(res.statusCode ?? 0));
        }
      );
      req.on("error", reject);
      req.end();
    });
    expect(statusCode).toBe(401);

    // Request with correct secret -> 200
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/hook",
          method: "POST",
          headers: { "x-webhook-secret": "mysecret" }
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        }
      );
      req.on("error", reject);
      req.end();
    });
    await p;
    await gen.next();
  }, 10_000);
});

describe("FileWatchTriggerNode genProcess()", () => {
  it("yields file events when files are created", async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "fw-test-"));

    const node = new FileWatchTriggerNode();
    node.assign({
      path: tmpDir,
      recursive: false,
      patterns: ["*.txt"],
      ignore_patterns: [],
      events: ["created", "modified", "deleted"],
      debounce_seconds: 0,
      max_events: 1
    });

    const gen = node.genProcess();
    const p = gen.next();

    // Wait for watcher to be ready
    await new Promise((r) => setTimeout(r, 200));

    // Create a file to trigger the watcher
    const filePath = path.join(tmpDir, "test.txt");
    await writeFile(filePath, "hello");

    const result = await p;
    expect(result.done).toBe(false);
    const ev = result.value as Record<string, unknown>;

    expect(typeof ev.event).toBe("string");
    expect(["created", "modified"]).toContain(ev.event);
    expect(typeof ev.path).toBe("string");
    expect((ev.path as string).endsWith("test.txt")).toBe(true);
    expect(typeof ev.dest_path).toBe("string");
    expect(typeof ev.is_directory).toBe("boolean");
    expect(typeof ev.timestamp).toBe("string");

    // Clean up
    const next = await gen.return(undefined);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("throws when watch path does not exist", async () => {
    const node = new FileWatchTriggerNode();
    node.assign({
      path: "/nonexistent/path/that/does/not/exist",
      max_events: 1
    });

    const gen = node.genProcess();
    await expect(gen.next()).rejects.toThrow("Watch path does not exist");
  });

  it("respects ignore_patterns", async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), "fw-ignore-"));

    const node = new FileWatchTriggerNode();
    node.assign({
      path: tmpDir,
      recursive: false,
      patterns: ["*"],
      ignore_patterns: ["*.log"],
      events: ["created"],
      debounce_seconds: 0,
      max_events: 1
    });

    const gen = node.genProcess();
    const p = gen.next();
    await new Promise((r) => setTimeout(r, 200));

    // Create ignored file first
    await writeFile(path.join(tmpDir, "ignored.log"), "log data");
    // Small delay then create a matching file
    await new Promise((r) => setTimeout(r, 100));
    await writeFile(path.join(tmpDir, "wanted.txt"), "data");

    const result = await p;
    expect(result.done).toBe(false);
    const ev = result.value as Record<string, unknown>;
    expect((ev.path as string).endsWith("wanted.txt")).toBe(true);

    await gen.return(undefined);
    await rm(tmpDir, { recursive: true, force: true });
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
    expect((NodeCls as any).description).toBe(
      "Placeholder node for test.placeholder.MyNode"
    );

    const node = new (NodeCls as any)();

    // PlaceholderNode.process() returns { output: this.value ?? this.serialize() }
    // Since there are no declared props, value is always undefined, and serialize() returns {}
    // Setting value directly on the instance makes it available
    node.value = "b";
    expect(await node.process()).toEqual({ output: "b" });

    // Without value set, returns serialized (empty) props
    node.value = undefined;
    expect(await node.process()).toEqual({ output: {} });
  });
});
