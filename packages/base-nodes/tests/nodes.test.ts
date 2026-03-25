import { describe, it, expect } from "vitest";
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
  AudioToNumpyNode,
  NumpyToAudioNode,
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
  GetModel3DMetadataNode,
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
        content: [{ type: "text", text: "hello" }],
      },
    });
    await expect(node.process({})).resolves.toEqual({
      id: "m1",
      thread_id: "t1",
      role: "assistant",
      text: "hello",
      image: null,
      audio: null,
      model: { provider: "openai", id: "gpt-4o" },
    });
  });

  it("OutputNode forwards a value handle", async () => {
    await expect(new OutputNode().process({ value: 5 })).resolves.toEqual({
      output: 5,
    });
  });

  it("OutputNode emits output_update and normalizes value", async () => {
    const node = new OutputNode();
    node.assign({ __node_id: "out1", __node_name: "result", name: "result" });
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
      normalizeOutputValue: async (value: unknown) =>
        typeof value === "string" ? value.toUpperCase() : value,
    } as unknown as ProcessingContext;

    await expect(node.process({ value: "hello" }, context)).resolves.toEqual({
      output: "HELLO",
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "output_update",
      node_id: "out1",
      node_name: "result",
      output_name: "result",
      value: "HELLO",
    });
  });

  it("PreviewNode emits preview_update and returns normalized output", async () => {
    const node = new PreviewNode();
    node.assign({ value: "fallback" });
    const emitted: Array<Record<string, unknown>> = [];
    const context = {
      emit: (msg: Record<string, unknown>) => emitted.push(msg),
      normalizeOutputValue: async (value: unknown) =>
        typeof value === "string" ? value.toUpperCase() : value,
    } as unknown as ProcessingContext;

    await expect(node.process({ value: "hello" }, context)).resolves.toEqual({
      output: "HELLO",
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      type: "preview_update",
      value: "HELLO",
    });
  });

  it("workspace text file nodes read and write", async () => {
    const dir = `/tmp/nodetool-ws-${Date.now()}`;
    const write = new WriteTextFileNode();
    const read = new ReadTextFileNode();
    await expect(
      write.process({
        workspace_dir: dir,
        path: "notes/a.txt",
        content: "hello",
      })
    ).resolves.toEqual({ output: "notes/a.txt" });
    await expect(
      read.process({
        workspace_dir: dir,
        path: "notes/a.txt",
      })
    ).resolves.toEqual({ output: "hello" });
  });

  it("workspace helpers validate and inspect paths", async () => {
    const dir = `/tmp/nodetool-ws-${Date.now()}-2`;
    const joined = new JoinWorkspacePathsNode();
    const exists = new WorkspaceFileExistsNode();
    await expect(
      joined.process({ workspace_dir: dir, paths: ["x", "y.txt"] })
    ).resolves.toEqual({ output: "x/y.txt" });
    await expect(
      exists.process({ workspace_dir: dir, path: "x/y.txt" })
    ).resolves.toEqual({ output: false });
  });

  it("CompareImagesNode returns perfect score for equal bytes", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const node = new CompareImagesNode();
    await expect(
      node.process({ image_a: { data: bytes }, image_b: { data: bytes } })
    ).resolves.toEqual({ score: 1, equal: true });
  });

  it("document save/load and split json nodes work", async () => {
    const file = `/tmp/nodetool-doc-${Date.now()}.json`;
    const save = new SaveDocumentFileNode();
    await expect(
      save.process({
        path: file,
        document: {
          text: "{\"a\":1,\"b\":2}",
        },
      })
    ).resolves.toEqual({ output: file });

    const load = new LoadDocumentFileNode();
    const loaded = await load.process({ path: file });
    expect((loaded.output as { data: string }).data).toBeTruthy();

    const split = new SplitJSONNode();
    const out: Array<string> = [];
    for await (const chunk of split.genProcess({
      document: { uri: `file://${file}` },
      chunk_size: 8,
      chunk_overlap: 2,
    })) {
      out.push(String(chunk.chunk));
    }
    expect(out.length).toBeGreaterThan(0);
  });

  it("data nodes import/select/aggregate/rename/fill work", async () => {
    const imported = await new ImportCSVNode().process({
      csv_data: "team,score\nA,10\nA,20\nB,5",
    });
    const selected = await new SelectColumnNode().process({
      dataframe: imported.output,
      columns: "team,score",
    });
    const aggregated = await new AggregateNode().process({
      dataframe: selected.output,
      columns: "team",
      aggregation: "sum",
    });
    const renamed = await new RenameNode().process({
      dataframe: aggregated.output,
      rename_map: "score:total",
    });
    const filled = await new FillNANode().process({
      dataframe: renamed.output,
      method: "value",
      value: 0,
    });

    expect((filled.output as { rows: Array<Record<string, unknown>> }).rows.length).toBe(2);
  });

  it("FilterNoneNode omits null and forwards non-null", async () => {
    await expect(new FilterNoneNode().process({ value: null })).resolves.toEqual({
      output: [],
    });
    await expect(new FilterNoneNode().process({ value: "ok" })).resolves.toEqual({
      output: "ok",
    });
  });

  it("RunShellCommandNode executes shell command", async () => {
    const node = new RunShellCommandNode();
    const result = await node.process({ command: "echo ts-code-node" });
    expect(String(result.output)).toContain("ts-code-node");
    expect(result.exit_code).toBe(0);
  });

  it("WaitNode returns wait metadata", async () => {
    const result = await new WaitNode().process({
      timeout_seconds: 0.01,
      input: { x: 1 },
    });
    expect(result.data).toEqual({ x: 1 });
    expect(typeof result.resumed_at).toBe("string");
    expect(Number(result.waited_seconds)).toBeGreaterThanOrEqual(0);
  });

  it("audio nodes can create concat and convert arrays", async () => {
    const silenceA = await new CreateSilenceNode().process({ length: 8 });
    const silenceB = await new CreateSilenceNode().process({ length: 4 });
    const concat = await new ConcatAudioNode().process({
      audio_a: silenceA.output,
      audio_b: silenceB.output,
    });
    const arr = await new AudioToNumpyNode().process({ audio: concat.output });
    const audio = await new NumpyToAudioNode().process({ values: arr.output });
    expect(Array.isArray(arr.output)).toBe(true);
    expect((audio.output as { data: string }).data.length).toBeGreaterThan(0);
  });

  it("image nodes create and transform image refs", async () => {
    const generated = await new TextToImageNode().process({
      prompt: "hello-image",
      width: 320,
      height: 240,
    });
    const transformed = await new ImageToImageNode().process({
      image: generated.output,
      prompt: "style transfer",
    });
    const meta = await new GetMetadataNode().process({ image: transformed.output });
    expect((transformed.output as { prompt: string }).prompt).toBe("style transfer");
    expect((meta.output as { size_bytes: number }).size_bytes).toBeGreaterThan(0);
  });

  it("video nodes create video refs and expose metadata", async () => {
    const generated = await new TextToVideoNode().process({
      prompt: "clip-one",
    });
    const info = await new GetVideoInfoNode().process({ video: generated.output });
    expect((info.output as { size_bytes: number }).size_bytes).toBeGreaterThan(0);
  });

  it("agent nodes create threads and classify text", async () => {
    const thread = await new CreateThreadNode().process({ title: "T" });
    expect(String(thread.thread_id)).toContain("thread_");
    const classified = await new ClassifierNode().process(
      {
        text: "payment failed and card was charged twice",
        categories: ["billing", "sales", "support"],
        model: { provider: "openai", id: "gpt-4o-mini" },
      },
      {
        getProvider: async () => ({
          generateMessage: async () => ({ content: '{"category":"billing"}' }),
          async generateMessageTraced(...a: any[]) { return (this as any).generateMessage(...a); },
        }),
      } as unknown as ProcessingContext
    );
    expect(classified.category).toBe("billing");
  });

  it("AgentNode uses runtime provider when model is connected", async () => {
    const agent = new AgentNode();
    const context = {
      getProvider: async () => ({
        generateMessage: async () => ({
          content: "provider-response",
        }),
        async generateMessageTraced(...a: any[]) { return (this as any).generateMessage(...a); },
      }),
    } as unknown as ProcessingContext;
    const result = await agent.process(
      {
        system: "You are helpful",
        prompt: "Say hello",
        model: { provider: "openai", id: "gpt-4o" },
      },
      context
    );
    expect(result.text).toBe("provider-response");
  });

  it("generator nodes return structured/list outputs", async () => {
    const structured = await new StructuredOutputGeneratorNode().process({
      schema: { properties: { ok: { type: "boolean" }, name: { type: "string" } } },
    });
    expect(structured.ok).toBe(false);
    expect(structured.name).toBe("");

    const listed = await new ListGeneratorNode().process({ prompt: "Generate 3 fruits" });
    expect(Array.isArray(listed.output)).toBe(true);
    expect((listed.output as unknown[]).length).toBe(3);
  });

  it("model3d nodes generate and inspect metadata", async () => {
    const model = await new TextTo3DNode().process({ prompt: "cube" });
    const meta = await new GetModel3DMetadataNode().process({ model: model.output });
    expect((meta.output as { size_bytes: number }).size_bytes).toBeGreaterThan(0);
  });
});

describe("control nodes", () => {
  it("IfNode routes output by condition", async () => {
    const node = new IfNode();
    node.assign({ condition: true, value: "x" });

    await expect(node.process({})).resolves.toEqual({
      if_true: "x",
      if_false: null,
    });

    await expect(node.process({ condition: false, value: 42 })).resolves.toEqual({
      if_true: null,
      if_false: 42,
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
      { output: "b", index: 1 },
    ]);
  });

  it("CollectNode accumulates across invocations", async () => {
    const node = new CollectNode();
    await node.initialize();
    await expect(node.process({ input_item: 1 })).resolves.toEqual({ output: [1] });
    await expect(node.process({ input_item: 2 })).resolves.toEqual({ output: [1, 2] });
  });

  it("RerouteNode passes through input_value", async () => {
    const node = new RerouteNode();
    await expect(node.process({ input_value: "pass" })).resolves.toEqual({
      output: "pass",
    });
  });
});


describe("text nodes", () => {
  it("basic text transform nodes work", async () => {
    await expect(
      new SplitTextNode().process({ text: "a,b,c", delimiter: "," })
    ).resolves.toEqual({
      output: ["a", "b", "c"],
    });
    await expect(
      new ExtractTextNode().process({ text: "abcdef", start: 1, end: 4 })
    ).resolves.toEqual({ output: "bcd" });
    await expect(
      new ChunkTextNode().process({ text: "a b c d", length: 2, overlap: 1, separator: " " })
    ).resolves.toEqual({ output: ["a b", "b c", "c d", "d"] });
  });

  it("regex/text comparison helpers work", async () => {
    await expect(
      new RegexReplaceNode().process({
        text: "abc-123-def",
        pattern: "\\d+",
        replacement: "X",
      })
    ).resolves.toEqual({ output: "abc-X-def" });

    await expect(
      new CompareTextNode().process({
        text_a: "Alpha",
        text_b: "alpha",
        case_sensitive: false,
      })
    ).resolves.toEqual({ output: "equal" });
  });

  it("contains/trim/slugify/pad/length/surround helpers work", async () => {
    await expect(
      new ContainsTextNode().process({
        text: "hello world",
        search_values: ["hello", "world"],
        match_mode: "all",
      })
    ).resolves.toEqual({ output: true });

    await expect(
      new TrimWhitespaceNode().process({ text: "  hi  ", trim_start: true, trim_end: false })
    ).resolves.toEqual({ output: "hi  " });

    await expect(
      new SlugifyNode().process({ text: "Hello, World!", separator: "-", lowercase: true })
    ).resolves.toEqual({ output: "hello-world" });

    await expect(
      new PadTextNode().process({ text: "x", length: 3, pad_character: ".", direction: "both" })
    ).resolves.toEqual({ output: ".x." });

    await expect(
      new LengthTextNode().process({ text: "a b c", measure: "words" })
    ).resolves.toEqual({ output: 3 });

    await expect(
      new SurroundWithTextNode().process({
        text: "value",
        prefix: "[",
        suffix: "]",
        skip_if_wrapped: true,
      })
    ).resolves.toEqual({ output: "[value]" });
  });

  it("stream-style text filters keep state", async () => {
    const filter = new FilterStringNode();
    filter.assign({ filter_type: "contains", criteria: "ok" });
    await filter.initialize();
    await expect(filter.process({ value: "hello" })).resolves.toEqual({});
    await expect(filter.process({ value: "ok-now" })).resolves.toEqual({
      output: "ok-now",
    });

    const regexFilter = new FilterRegexStringNode();
    regexFilter.assign({ pattern: "^a.+z$", full_match: true });
    await regexFilter.initialize();
    await expect(regexFilter.process({ value: "abz" })).resolves.toEqual({
      output: "abz",
    });
    await expect(regexFilter.process({ value: "abzx" })).resolves.toEqual({});
  });

  it("extract json / token count / html to text", async () => {
    await expect(
      new ExtractJSONNode().process({
        text: "{\"a\":{\"b\":[1,2]}}",
        json_path: "$.a.b[1]",
        find_all: false,
      })
    ).resolves.toEqual({ output: 2 });

    await expect(new CountTokensNode().process({ text: "hello, world!" })).resolves
      .toEqual({ output: 4 });

    await expect(
      new HtmlToTextNode().process({ html: "<p>Hello<br>World</p>" })
    ).resolves.toEqual({ output: "Hello\nWorld" });
  });

  it("filesystem text save/load and embedding fallback", async () => {
    const savePath = `/tmp/nodetool-save-text-${Date.now()}.txt`;
    await expect(
      new SaveTextNode().process({ text: "hello", name: savePath })
    ).resolves.toEqual({
      output: { uri: savePath, data: "hello" },
    });

    const saveDir = `/tmp/nodetool-save-text-dir-${Date.now()}`;
    await expect(
      new SaveTextFileNode().process({ text: "abc", folder: saveDir, name: "x.txt" })
    ).resolves.toEqual({
      output: { uri: `${saveDir}/x.txt`, data: "abc" },
    });

    const load = new LoadTextFolderNode();
    const items: Array<Record<string, unknown>> = [];
    for await (const row of load.genProcess({
      folder: saveDir,
      include_subdirectories: false,
      extensions: [".txt"],
      pattern: "",
    })) {
      items.push(row);
    }
    expect(items.length).toBe(1);
    expect(items[0].text).toBe("abc");

    const emb = await new EmbeddingTextNode().process({ input: "hello world" });
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
    await expect(node.process({ value: { ok: true } })).resolves.toEqual({
      output: { ok: true },
    });
  });

  it("additional constant node variants work", async () => {
    await expect(
      new ConstantImageSizeNode().process({ value: { width: 640, height: 480 } })
    ).resolves.toEqual({
      output: { width: 640, height: 480 },
      image_size: { width: 640, height: 480 },
      width: 640,
      height: 480,
    });
    await expect(
      new ConstantDateNode().process({ year: 2025, month: 3, day: 1 })
    ).resolves.toEqual({ output: { year: 2025, month: 3, day: 1 } });
    await expect(
      new ConstantSelectNode().process({ value: "x", options: ["x", "y"] })
    ).resolves.toEqual({ output: "x" });
  });

  it("ConstantBaseNode emits null output", async () => {
    await expect(new ConstantBaseNode().process({})).resolves.toEqual({ output: null });
  });
});

