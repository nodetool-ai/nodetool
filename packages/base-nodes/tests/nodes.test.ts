import { describe, it, expect, vi } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import {
  registerBaseNodes,
  IfNode,
  ForEachNode,
  RerouteNode,
  CollectNode,
  SplitTextNode,
  ExtractTextNode,
  ChunkTextNode,
  ExtractJSONNode,
  CountTokensNode,
  HtmlToTextNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  EmbeddingTextNode,
  RegexReplaceNode,
  CompareTextNode,
  ContainsTextNode,
  TrimWhitespaceNode,
  SlugifyNode,
  PadTextNode,
  LengthTextNode,
  SurroundWithTextNode,
  FilterStringNode,
  FilterRegexStringNode,
  ConstantIntegerNode,
  ConstantBaseNode,
  ConstantDictNode,
  ConstantImageSizeNode,
  ConstantDateNode,
  ConstantSelectNode,
  StringInputNode,
  MessageDeconstructorNode,
  OutputNode,
  PreviewNode,
  WriteTextFileNode,
  ReadTextFileNode,
  JoinWorkspacePathsNode,
  WorkspaceFileExistsNode,
  CompareImagesNode,
  SplitJSONNode,
  SaveDocumentFileNode,
  LoadDocumentFileNode,
  ImportCSVNode,
  SelectColumnNode,
  AggregateNode,
  RenameNode,
  FillNANode,
  FilterNoneNode,
  RunShellCommandNode,
  WaitNode,
  CreateSilenceNode,
  ConcatAudioNode,
  TextToImageNode,
  ImageToImageNode,
  GetMetadataNode,
  TextToVideoNode,
  GetVideoInfoNode,
  CreateThreadNode,
  ClassifierNode,
  AgentNode,
  StructuredOutputGeneratorNode,
  ListGeneratorNode,
  TextTo3DNode,
  GetModel3DMetadataNode
} from "../src/index.js";

describe("base node registration", () => {
  it("registers node classes in a registry", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has(IfNode.nodeType)).toBe(true);
    expect(registry.has("nodetool.input.StringInput")).toBe(true);
    expect(registry.has("nodetool.output.Output")).toBe(true);
    expect(registry.has("nodetool.workflows.base_node.Preview")).toBe(true);
    expect(registry.has("nodetool.audio.TextToSpeech")).toBe(true);
    expect(registry.has("nodetool.image.ImageToImage")).toBe(true);
    expect(registry.has("nodetool.video.TextToVideo")).toBe(true);
    expect(registry.has("nodetool.workspace.ReadTextFile")).toBe(true);
    expect(registry.has("nodetool.document.SplitDocument")).toBe(true);
    expect(registry.has("nodetool.compare.CompareImages")).toBe(true);
    expect(registry.has("nodetool.data.Aggregate")).toBe(true);
    expect(registry.has("nodetool.code.ExecuteCommand")).toBe(true);
    expect(registry.has("nodetool.audio.TextToSpeech")).toBe(true);
    expect(registry.has("nodetool.triggers.Wait")).toBe(true);
    expect(registry.has("nodetool.triggers.ManualTrigger")).toBe(true);
    expect(registry.has("nodetool.triggers.IntervalTrigger")).toBe(true);
    expect(registry.has("nodetool.triggers.WebhookTrigger")).toBe(true);
    expect(registry.has("nodetool.triggers.FileWatchTrigger")).toBe(true);
    expect(registry.has("nodetool.image.TextToImage")).toBe(true);
    expect(registry.has("nodetool.video.Resize")).toBe(true);
    expect(registry.has("nodetool.code.RunPythonCommandDocker")).toBe(true);
    expect(registry.has("nodetool.code.RunJavaScriptCommandDocker")).toBe(true);
    expect(registry.has("nodetool.code.RunBashCommandDocker")).toBe(true);
    expect(registry.has("nodetool.code.RunRubyCommandDocker")).toBe(true);
    expect(registry.has("nodetool.code.RunShellCommandDocker")).toBe(true);
  });
});

describe("input/output/workspace nodes", () => {
  it("StringInputNode enforces max length", async () => {
    const node = new StringInputNode();
    node.assign({ value: "abcdef", max_length: 3 });
    await expect(node.process({})).resolves.toEqual({ value: "abc" });
  });

  it("MessageDeconstructorNode extracts text and metadata", async () => {
    const node = new MessageDeconstructorNode();
    node.assign({
      value: {
        id: "m1",
        thread_id: "t1",
        role: "assistant",
        provider: "openai",
        model: "gpt-4o",
        content: [{ type: "text", text: "hello" }]
      }
    });
    await expect(node.process({})).resolves.toEqual({
      id: "m1",
      thread_id: "t1",
      role: "assistant",
      text: "hello",
      image: null,
      audio: null,
      model: { provider: "openai", id: "gpt-4o" }
    });
  });

  it("OutputNode forwards a value handle", async () => {
    const _n = new OutputNode();
    _n.assign({ value: 5 });
    await expect(_n.process()).resolves.toEqual({
      output: 5
    });
  });

  it("OutputNode normalizes value via context", async () => {
    const node = new OutputNode();
    node.assign({ __node_id: "out1", __node_name: "result", name: "result" });
    const context = {
      emit: () => {},
      normalizeOutputValue: async (value: unknown) =>
        typeof value === "string" ? value.toUpperCase() : value
    } as unknown as ProcessingContext;

    node.assign({ value: "hello" });
    await expect(node.process(context)).resolves.toEqual({
      output: "HELLO"
    });
  });

  it("PreviewNode emits preview_update and returns normalized output", async () => {
    const node = new PreviewNode();
    node.assign({ value: "fallback" });
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
      normalizeOutputValue: async (value: unknown) =>
        typeof value === "string" ? value.toUpperCase() : value
    } as unknown as ProcessingContext;

    node.assign({ value: "hello" });
    await expect(node.process(context)).resolves.toEqual({
      output: "HELLO"
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "preview_update",
      value: "HELLO"
    });
  });

  it("workspace text file nodes read and write", async () => {
    const dir = `/tmp/nodetool-ws-${Date.now()}`;
    const write = new WriteTextFileNode();
    write.assign({
      workspace_dir: dir,
      path: "notes/a.txt",
      content: "hello"
    });
    await expect(write.process()).resolves.toEqual({ output: "notes/a.txt" });
    const read = new ReadTextFileNode();
    read.assign({
      workspace_dir: dir,
      path: "notes/a.txt"
    });
    await expect(read.process()).resolves.toEqual({ output: "hello" });
  });

  it("workspace helpers validate and inspect paths", async () => {
    const dir = `/tmp/nodetool-ws-${Date.now()}-2`;
    const joined = new JoinWorkspacePathsNode();
    joined.assign({ workspace_dir: dir, paths: ["x", "y.txt"] });
    const exists = new WorkspaceFileExistsNode();
    exists.assign({ workspace_dir: dir, path: "x/y.txt" });
    await expect(joined.process()).resolves.toEqual({ output: "x/y.txt" });
    await expect(exists.process()).resolves.toEqual({ output: false });
  });

  it("CompareImagesNode returns perfect score for equal bytes", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const node = new CompareImagesNode();
    node.assign({ image_a: { data: bytes }, image_b: { data: bytes } });
    await expect(node.process()).resolves.toEqual({ score: 1, equal: true });
  });

  it("CompareImagesNode emits the image comparison preview shape used by the web UI", async () => {
    const node = new CompareImagesNode();
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg)
    } as unknown as ProcessingContext;

    node.assign({
      __node_id: "compare-1",
      image_a: { uri: "https://example.com/a.png", type: "image" },
      image_b: { uri: "https://example.com/b.png", type: "image" },
      label_a: "Before",
      label_b: "After"
    });

    await node.process(context);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "preview_update",
      node_id: "compare-1",
      value: {
        type: "image_comparison",
        image_a: { uri: "https://example.com/a.png", type: "image" },
        image_b: { uri: "https://example.com/b.png", type: "image" },
        label_a: "Before",
        label_b: "After"
      }
    });
  });

  it("CompareImagesNode returns score < 1 for different bytes of same length", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([1, 2, 3, 4]) },
      image_b: { data: Uint8Array.from([1, 2, 0, 0]) }
    });
    const result = await node.process();
    // 2 of 4 bytes match, same length so no penalty: score = 2/4 = 0.5
    expect(result.score).toBe(0.5);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode applies length penalty for different lengths", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([1, 2, 3, 4]) },
      image_b: { data: Uint8Array.from([1, 2]) }
    });
    const result = await node.process();
    // min=2, max=4, all 2 compared bytes match: (2/2) * (2/4) = 0.5
    expect(result.score).toBe(0.5);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode returns score=0 when one image is empty", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([1, 2, 3]) },
      image_b: { data: new Uint8Array() }
    });
    const result = await node.process();
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode returns score=1 when both images are empty", async () => {
    const node = new CompareImagesNode();
    node.assign({ image_a: {}, image_b: {} });
    const result = await node.process();
    expect(result.score).toBe(1);
    expect(result.equal).toBe(true);
  });

  it("CompareImagesNode combines byte mismatch and length penalty", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([10, 20, 30, 40, 50, 60]) },
      image_b: { data: Uint8Array.from([10, 20, 99]) }
    });
    const result = await node.process();
    // min=3, max=6, 2 of 3 compared bytes match: (2/3) * (3/6) = 1/3
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.equal).toBe(false);
  });

  it("document save/load and split json nodes work", async () => {
    const file = `/tmp/nodetool-doc-${Date.now()}.json`;
    const save = new SaveDocumentFileNode();
    save.assign({
      document: {
        text: '{"a":1,"b":2}'
      }
    });
    (save as any).path = file;
    await expect(save.process()).resolves.toEqual({ output: file });

    const load = new LoadDocumentFileNode();
    load.assign({ path: file });
    const loaded = await load.process();
    expect((loaded.output as { data: string }).data).toBeTruthy();

    const split = new SplitJSONNode();
    split.assign({
      document: { uri: `file://${file}` },
      chunk_size: 8,
      chunk_overlap: 2
    });
    const out: Array<string> = [];
    for await (const chunk of split.genProcess()) {
      out.push(String(chunk.chunk));
    }
    expect(out.length).toBeGreaterThan(0);
  });

  it("data nodes import/select/aggregate/rename/fill work", async () => {
    const _imp = new ImportCSVNode();
    _imp.assign({ csv_data: "team,score\nA,10\nA,20\nB,5" });
    const imported = await _imp.process();
    const _sel = new SelectColumnNode();
    _sel.assign({ dataframe: imported.output, columns: "team,score" });
    const selected = await _sel.process();
    const _agg = new AggregateNode();
    _agg.assign({
      dataframe: selected.output,
      columns: "team",
      aggregation: "sum"
    });
    const aggregated = await _agg.process();
    const _ren = new RenameNode();
    _ren.assign({ dataframe: aggregated.output, rename_map: "score:total" });
    const renamed = await _ren.process();
    const _fill = new FillNANode();
    _fill.assign({ dataframe: renamed.output, method: "value", value: 0 });
    const filled = await _fill.process();

    expect(
      (filled.output as { rows: Array<Record<string, unknown>> }).rows.length
    ).toBe(2);
  });

  it("FilterNoneNode omits null and forwards non-null", async () => {
    const _fn1 = new FilterNoneNode();
    await expect(_fn1.process()).resolves.toEqual({ output: [] });
    const _fn2 = new FilterNoneNode();
    _fn2.assign({ value: "ok" });
    await expect(_fn2.process()).resolves.toEqual({ output: "ok" });
  });

  it("RunShellCommandNode executes shell command", async () => {
    const node = new RunShellCommandNode();
    node.assign({ command: "echo ts-code-node" });
    const result = await node.process();
    expect(String(result.output)).toContain("ts-code-node");
    expect(result.exit_code).toBe(0);
  });

  it("WaitNode returns wait metadata", async () => {
    const _w = new WaitNode();
    _w.assign({ timeout_seconds: 0.01, input: { x: 1 } });
    const result = await _w.process();
    expect(result.data).toEqual({ x: 1 });
    expect(typeof result.resumed_at).toBe("string");
    expect(Number(result.waited_seconds)).toBeGreaterThanOrEqual(0);
  });

  it("audio nodes can create concat and convert arrays", async () => {
    const _sa = new CreateSilenceNode();
    _sa.assign({ duration: 8 });
    const silenceA = await _sa.process();
    const _sb = new CreateSilenceNode();
    _sb.assign({ duration: 4 });
    const silenceB = await _sb.process();
    const _cat = new ConcatAudioNode();
    _cat.assign({ a: silenceA.output, b: silenceB.output });
    const concat = await _cat.process();
    const concatOutput = concat.output as { data: string };
    expect(concatOutput.data.length).toBeGreaterThan(0);
  });

  it("image nodes create and transform image refs", async () => {
    // TextToImageNode now requires a provider; test GetMetadata directly
    const _meta = new GetMetadataNode();
    // Create a minimal 1x1 PNG image (base64)
    const png1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    _meta.assign({ image: { type: "image", data: png1x1 } });
    const meta = await _meta.process();
    expect(meta.format).toBe("PNG");
    expect(meta.width).toBe(1);
    expect(meta.height).toBe(1);
    expect(typeof meta.channels).toBe("number");
  });

  it("video nodes return metadata from ffprobe", async () => {
    // GetVideoInfoNode now uses ffprobe; test empty video returns zeros
    const _info = new GetVideoInfoNode();
    _info.assign({ video: { type: "video", uri: "", data: null } });
    const info = await _info.process();
    expect(info.duration).toBe(0);
    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
    expect(info.fps).toBe(0);
    expect(info.codec).toBe("");
    expect(info.has_audio).toBe(false);
  });

  it("agent nodes create threads and classify text", async () => {
    const _thr = new CreateThreadNode();
    _thr.assign({ title: "T" });
    const thread = await _thr.process();
    expect(String(thread.thread_id)).toContain("thread_");
    const _cls = new ClassifierNode();
    _cls.assign({
      text: "payment failed and card was charged twice",
      categories: ["billing", "sales", "support"],
      model: { provider: "openai", id: "gpt-4o-mini" }
    });
    const classified = await _cls.process({
      getProvider: async () => ({
        generateMessage: async () => ({ content: '{"category":"billing"}' }),
        async generateMessageTraced(...a: any[]) {
          return (this as any).generateMessage(...a);
        }
      })
    } as unknown as ProcessingContext);
    expect(classified.category).toBe("billing");
  });

  it("AgentNode uses runtime provider when model is connected", async () => {
    const agent = new AgentNode();
    const context = {
      getProvider: async () => ({
        generateMessage: async () => ({
          content: "provider-response"
        }),
        async generateMessageTraced(...a: any[]) {
          return (this as any).generateMessage(...a);
        }
      })
    } as unknown as ProcessingContext;
    agent.assign({
      system: "You are helpful",
      prompt: "Say hello",
      model: { provider: "openai", id: "gpt-4o" }
    });
    const result = await agent.process(context);
    expect(result.text).toBe("provider-response");
  });

  it("generator nodes return structured/list outputs", async () => {
    const _so = new StructuredOutputGeneratorNode();
    (_so as any)._dynamic_outputs = {
      ok: { type: "boolean" },
      name: { type: "string" }
    };
    const structured = await _so.process();
    expect(structured.ok).toBe(false);
    expect(structured.name).toBe("");

    const _lg = new ListGeneratorNode();
    _lg.assign({ prompt: "Generate 3 fruits" });
    const listed = await _lg.process();
    expect(Array.isArray(listed.output)).toBe(true);
    expect((listed.output as unknown[]).length).toBe(3);
  });

  it("model3d nodes generate and inspect metadata", async () => {
    const meshBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 2, 3, 4]);
    const textTo3D = vi.fn().mockResolvedValue(meshBytes);
    const ctx = {
      getProvider: vi.fn().mockResolvedValue({ textTo3D })
    } as unknown as ProcessingContext;

    const _t3d = new TextTo3DNode();
    _t3d.assign({
      model: { type: "model_3d_model", provider: "meshy", id: "meshy-4" },
      prompt: "cube"
    });
    const model = await _t3d.process(ctx);
    const _m3d = new GetModel3DMetadataNode();
    _m3d.assign({ model: model.output });
    const meta = await _m3d.process();
    expect((meta.output as { size_bytes: number }).size_bytes).toBeGreaterThan(
      0
    );
  });
});

describe("control nodes", () => {
  it("IfNode routes output by condition", async () => {
    const node = new IfNode();
    node.assign({ condition: true, value: "x" });

    await expect(node.process({})).resolves.toEqual({
      if_true: "x",
      if_false: null
    });

    node.assign({ condition: false, value: 42 });
    await expect(node.process()).resolves.toEqual({
      if_true: null,
      if_false: 42
    });
  });

  it("ForEachNode streams list items with index", async () => {
    const node = new ForEachNode();
    node.assign({ input_list: ["a", "b"] });

    const out: Array<Record<string, unknown>> = [];
    for await (const part of node.genProcess({})) {
      out.push(part);
    }

    expect(out).toEqual([
      { output: "a", index: 0 },
      { output: "b", index: 1 }
    ]);
  });

  it("CollectNode.process returns empty (streaming via run())", async () => {
    const node = new CollectNode();
    await node.initialize();
    // CollectNode.process() is a no-op; real collection is via run()
    await expect(node.process()).resolves.toEqual({ output: [] });
  });

  it("RerouteNode passes through input_value", async () => {
    const node = new RerouteNode();
    node.assign({ input_value: "pass" });
    await expect(node.process()).resolves.toEqual({
      output: "pass"
    });
  });
});

describe("text nodes", () => {
  it("basic text transform nodes work", async () => {
    const _sp = new SplitTextNode();
    _sp.assign({ text: "a,b,c", delimiter: "," });
    await expect(_sp.process()).resolves.toEqual({ output: ["a", "b", "c"] });
    const _ex = new ExtractTextNode();
    _ex.assign({ text: "abcdef", start: 1, end: 4 });
    await expect(_ex.process()).resolves.toEqual({ output: "bcd" });
    const _ch = new ChunkTextNode();
    _ch.assign({ text: "a b c d", length: 2, overlap: 1, separator: " " });
    await expect(_ch.process()).resolves.toEqual({
      output: ["a b", "b c", "c d", "d"]
    });
  });

  it("regex/text comparison helpers work", async () => {
    const _rr = new RegexReplaceNode();
    _rr.assign({ text: "abc-123-def", pattern: "\\d+", replacement: "X" });
    await expect(_rr.process()).resolves.toEqual({ output: "abc-X-def" });

    const _ct = new CompareTextNode();
    _ct.assign({ text_a: "Alpha", text_b: "alpha", case_sensitive: false });
    await expect(_ct.process()).resolves.toEqual({ output: "equal" });
  });

  it("contains/trim/slugify/pad/length/surround helpers work", async () => {
    const _cn = new ContainsTextNode();
    _cn.assign({
      text: "hello world",
      search_values: ["hello", "world"],
      match_mode: "all"
    });
    await expect(_cn.process()).resolves.toEqual({ output: true });

    const _tw = new TrimWhitespaceNode();
    _tw.assign({ text: "  hi  ", trim_start: true, trim_end: false });
    await expect(_tw.process()).resolves.toEqual({ output: "hi  " });

    const _sl = new SlugifyNode();
    _sl.assign({ text: "Hello, World!", separator: "-", lowercase: true });
    await expect(_sl.process()).resolves.toEqual({ output: "hello-world" });

    const _pd = new PadTextNode();
    _pd.assign({ text: "x", length: 3, pad_character: ".", direction: "both" });
    await expect(_pd.process()).resolves.toEqual({ output: ".x." });

    const _lt = new LengthTextNode();
    _lt.assign({ text: "a b c", measure: "words" });
    await expect(_lt.process()).resolves.toEqual({ output: 3 });

    const _sw = new SurroundWithTextNode();
    _sw.assign({
      text: "value",
      prefix: "[",
      suffix: "]",
      skip_if_wrapped: true
    });
    await expect(_sw.process()).resolves.toEqual({ output: "[value]" });
  });

  it("stream-style text filters keep state", async () => {
    const filter = new FilterStringNode();
    filter.assign({ filter_type: "contains", criteria: "ok" });
    await filter.initialize();
    filter.assign({ value: "hello" });
    await expect(filter.process()).resolves.toEqual({});
    filter.assign({ value: "ok-now" });
    await expect(filter.process()).resolves.toEqual({
      output: "ok-now"
    });

    const regexFilter = new FilterRegexStringNode();
    regexFilter.assign({ pattern: "^a.+z$", full_match: true });
    await regexFilter.initialize();
    regexFilter.assign({ value: "abz" });
    await expect(regexFilter.process()).resolves.toEqual({
      output: "abz"
    });
    regexFilter.assign({ value: "abzx" });
    await expect(regexFilter.process()).resolves.toEqual({});
  });

  it("extract json / token count / html to text", async () => {
    const _ej = new ExtractJSONNode();
    _ej.assign({
      text: '{"a":{"b":[1,2]}}',
      json_path: "$.a.b[1]",
      find_all: false
    });
    await expect(_ej.process()).resolves.toEqual({ output: 2 });

    const _ct = new CountTokensNode();
    _ct.assign({ text: "hello, world!" });
    await expect(_ct.process()).resolves.toEqual({ output: 4 });

    const _ht = new HtmlToTextNode();
    _ht.assign({ html: "<p>Hello<br>World</p>" });
    await expect(_ht.process()).resolves.toEqual({ output: "Hello\nWorld" });
  });

  it("filesystem text save/load and embedding fallback", async () => {
    const savePath = `/tmp/nodetool-save-text-${Date.now()}.txt`;
    const _st = new SaveTextNode();
    _st.assign({ text: "hello", name: savePath });
    await expect(_st.process()).resolves.toEqual({
      output: { uri: savePath, data: "hello" }
    });

    const saveDir = `/tmp/nodetool-save-text-dir-${Date.now()}`;
    const _sf = new SaveTextFileNode();
    _sf.assign({ text: "abc", folder: saveDir, name: "x.txt" });
    await expect(_sf.process()).resolves.toEqual({
      output: { uri: `${saveDir}/x.txt`, data: "abc" }
    });

    const load = new LoadTextFolderNode();
    load.assign({
      folder: saveDir,
      include_subdirectories: false,
      extensions: [".txt"],
      pattern: ""
    });
    const items: Array<Record<string, unknown>> = [];
    for await (const row of load.genProcess()) {
      if ("texts" in row) continue; // skip final list yield
      items.push(row);
    }
    expect(items.length).toBe(1);
    expect(items[0].text).toBe("abc");

    const _emb = new EmbeddingTextNode();
    _emb.assign({ input: "hello world" });
    const emb = await _emb.process();
    expect(Array.isArray(emb.output)).toBe(true);
    expect((emb.output as number[]).length).toBe(64);
  });
});

describe("constant nodes", () => {
  it("ConstantIntegerNode emits assigned value", async () => {
    const node = new ConstantIntegerNode();
    node.assign({ value: 7 });
    await expect(node.process({})).resolves.toEqual({ output: 7 });
  });

  it("ConstantDictNode supports object output", async () => {
    const node = new ConstantDictNode();
    node.assign({ value: { ok: true } });
    await expect(node.process()).resolves.toEqual({
      output: { ok: true }
    });
  });

  it("additional constant node variants work", async () => {
    const _cis = new ConstantImageSizeNode();
    _cis.assign({ value: { width: 640, height: 480 } });
    await expect(_cis.process()).resolves.toEqual({
      output: { width: 640, height: 480 },
      image_size: { width: 640, height: 480 },
      width: 640,
      height: 480
    });
    const _cd = new ConstantDateNode();
    _cd.assign({ year: 2025, month: 3, day: 1 });
    await expect(_cd.process()).resolves.toEqual({
      output: { year: 2025, month: 3, day: 1 }
    });
    const _cs = new ConstantSelectNode();
    _cs.assign({ value: "x", options: ["x", "y"] });
    await expect(_cs.process()).resolves.toEqual({ output: "x" });
  });

  it("ConstantBaseNode emits null output", async () => {
    await expect(new ConstantBaseNode().process({})).resolves.toEqual({
      output: null
    });
  });
});
