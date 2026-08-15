import { describe, it, expect, vi } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { BaseProvider } from "@nodetool-ai/runtime";
import {
  registerBaseNodes,
  IfNode,
  ForEachNode,
  RerouteNode,
  CollectNode,
  CountTokensNode,
  SaveTextFileNode,
  SaveTextNode,
  LoadTextFolderNode,
  EmbeddingTextNode,
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
  CompareImagesNode,
  SaveDocumentFileNode,
  LoadDocumentFileNode,
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
    expect(registry.has("nodetool.control.RepeatCount")).toBe(true);
    expect(registry.has("nodetool.control.RepeatValue")).toBe(true);
    expect(registry.has("nodetool.input.StringInput")).toBe(true);
    expect(registry.has("nodetool.output.Output")).toBe(true);
    expect(registry.has("nodetool.workflows.base_node.Preview")).toBe(true);
    expect(registry.has("nodetool.audio.TextToSpeech")).toBe(true);
    expect(registry.has("nodetool.image.ImageToImage")).toBe(true);
    expect(registry.has("nodetool.constant.Sketch")).toBe(true);
    expect(registry.has("nodetool.video.TextToVideo")).toBe(true);
    expect(registry.has("nodetool.document.LoadDocumentFile")).toBe(true);
    expect(registry.has("nodetool.compare.CompareImages")).toBe(true);
    expect(registry.has("nodetool.data.ForEachRow")).toBe(true);
    expect(registry.has("nodetool.code.Code")).toBe(true);
    expect(registry.has("nodetool.audio.TextToSpeech")).toBe(true);
    expect(registry.has("nodetool.triggers.Wait")).toBe(true);
    expect(registry.has("nodetool.triggers.ManualTrigger")).toBe(true);
    expect(registry.has("nodetool.triggers.IntervalTrigger")).toBe(true);
    expect(registry.has("nodetool.triggers.WebhookTrigger")).toBe(true);
    expect(registry.has("nodetool.triggers.FileWatchTrigger")).toBe(true);
    expect(registry.has("nodetool.image.TextToImage")).toBe(true);
    expect(registry.has("nodetool.video.Resize")).toBe(true);
  });
});

describe("input/output nodes", () => {
  it("StringInputNode enforces max length", async () => {
    const node = new StringInputNode();
    node.assign({ value: "abcdef", max_length: 3 });
    await expect(node.process({})).resolves.toEqual({ output: "abc" });
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

  it("PreviewNode returns normalized output without emitting a separate preview_update", async () => {
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
    // PreviewNode now relies on the runner's output_update for its display
    // value — no redundant preview_update emission.
    expect(emitted).toHaveLength(0);
  });

  it("CompareImagesNode returns perfect score for equal bytes", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const node = new CompareImagesNode();
    node.assign({ image_a: { data: bytes }, image_b: { data: bytes } });
    const result = await node.process();
    expect(result.score).toBe(1);
    expect(result.equal).toBe(true);
    expect(result.comparison).toMatchObject({ type: "image_comparison" });
  });

  it("CompareImagesNode returns the image comparison snapshot as a regular output", async () => {
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

    const result = await node.process(context);

    // The snapshot now flows through the regular output channel — no
    // out-of-band preview_update emission.
    expect(emitted).toHaveLength(0);
    expect(result.comparison).toMatchObject({
      type: "image_comparison",
      image_a: { uri: "https://example.com/a.png", type: "image" },
      image_b: { uri: "https://example.com/b.png", type: "image" },
      label_a: "Before",
      label_b: "After"
    });
  });

  it("CompareImagesNode reports not-equal for different inline bytes of same length", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([1, 2, 3, 4]) },
      image_b: { data: Uint8Array.from([1, 2, 0, 0]) }
    });
    const result = await node.process();
    // Identity semantics: any byte difference → not the same image.
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode reports not-equal for inline bytes of different lengths", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([1, 2, 3, 4]) },
      image_b: { data: Uint8Array.from([1, 2]) }
    });
    const result = await node.process();
    // Different byte lengths can never be byte-equal.
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode returns score=0 when one image has bytes and the other is empty", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([1, 2, 3]) },
      image_b: { data: new Uint8Array() }
    });
    const result = await node.process();
    // One ref carries bytes, the other carries none → not comparable → not equal.
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode returns score=1 when both images are empty", async () => {
    const node = new CompareImagesNode();
    node.assign({ image_a: {}, image_b: {} });
    const result = await node.process();
    // Two genuinely empty (unwired) inputs are treated as equal.
    expect(result.score).toBe(1);
    expect(result.equal).toBe(true);
  });

  it("CompareImagesNode reports not-equal for different inline bytes of different lengths", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { data: Uint8Array.from([10, 20, 30, 40, 50, 60]) },
      image_b: { data: Uint8Array.from([10, 20, 99]) }
    });
    const result = await node.process();
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode reports equal for matching non-data URIs", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { uri: "https://example.com/same.png" },
      image_b: { uri: "https://example.com/same.png" }
    });
    const result = await node.process();
    expect(result.score).toBe(1);
    expect(result.equal).toBe(true);
  });

  it("CompareImagesNode reports not-equal for different non-data URIs", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { uri: "https://example.com/a.png" },
      image_b: { uri: "https://example.com/b.png" }
    });
    const result = await node.process();
    expect(result.score).toBe(0);
    expect(result.equal).toBe(false);
  });

  it("CompareImagesNode reports equal for matching asset ids", async () => {
    const node = new CompareImagesNode();
    node.assign({
      image_a: { asset_id: "asset-1" },
      image_b: { asset_id: "asset-1" }
    });
    const result = await node.process();
    expect(result.score).toBe(1);
    expect(result.equal).toBe(true);
  });

  it("document save/load nodes work", async () => {
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
    _cat.assign({ audio_1: silenceA.output, audio_2: silenceB.output });
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
    // AgentNode drives the provider through generateLoop; stream a single
    // assistant chunk and delegate the loop to BaseProvider's implementation.
    const context = {
      getProvider: async () => ({
        async *generateMessages() {
          yield {
            type: "chunk",
            content: "provider-response",
            content_type: "text",
            done: true
          };
        },
        async *generateMessagesTraced(...a: any[]) {
          yield* (this as any).generateMessages(...a);
        },
        generateLoop(loopArgs: unknown) {
          return (
            BaseProvider.prototype as { generateLoop: (a: unknown) => unknown }
          ).generateLoop.call(this, loopArgs);
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

    // Only the taken branch is emitted; the untaken key is absent entirely.
    const trueResult = await node.process({});
    expect(trueResult).toEqual({ if_true: "x" });
    expect(trueResult).not.toHaveProperty("if_false");

    node.assign({ condition: false, value: 42 });
    const falseResult = await node.process();
    expect(falseResult).toEqual({ if_false: 42 });
    expect(falseResult).not.toHaveProperty("if_true");
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

  it("token count", async () => {
    const _ct = new CountTokensNode();
    _ct.assign({ text: "hello, world!" });
    await expect(_ct.process()).resolves.toEqual({ output: 4 });
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

    // Embedding requires a provider-backed context — no more fake fallback.
    const _embNoCtx = new EmbeddingTextNode();
    _embNoCtx.assign({ input: "hello world" });
    await expect(_embNoCtx.process()).rejects.toThrow(
      /provider/i
    );

    const _emb = new EmbeddingTextNode();
    _emb.assign({ input: "hello world" });
    const runProviderPrediction = vi
      .fn()
      .mockResolvedValue([[0.1, 0.2, 0.3]]);
    const emb = await _emb.process({
      runProviderPrediction
    } as never);
    expect(emb.output).toEqual([0.1, 0.2, 0.3]);
    expect(runProviderPrediction).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "generate_embedding",
        provider: "openai",
        model: "text-embedding-3-small"
      })
    );
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
