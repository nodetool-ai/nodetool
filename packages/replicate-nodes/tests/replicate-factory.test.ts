import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import type { ReplicateManifestEntry } from "../src/replicate-factory.js";

const assetToUrl = vi.fn(
  async (ref: Record<string, unknown>) => `uploaded:${String(ref.uri)}`
);

vi.mock("../src/replicate-base.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/replicate-base.js")>()),
  assetToUrl
}));

const { createReplicateNodeClass } = await import("../src/replicate-factory.js");
const { default: manifest } = await import("../src/replicate-manifest.json", {
  with: { type: "json" }
});

describe("Replicate factory argument building", () => {
  let provider: ScriptedProvider;
  let ctx: ProcessingContext;

  /** Answer every endpoint call with `output`. */
  function replyWith(output: unknown): void {
    provider = new ScriptedProvider([], {
      providerId: "replicate",
      endpoints: { "*": { output } }
    });
    ctx = new ProcessingContext({ jobId: "job-1" });
    ctx.setProviderResolver(() => provider);
  }

  /** The model and input of the one endpoint call the node made. */
  function sent(): { model: string; input: Record<string, unknown> } {
    expect(provider.endpointCalls).toHaveLength(1);
    const { model, input } = provider.endpointCalls[0]!;
    return { model, input };
  }

  beforeEach(() => {
    assetToUrl.mockClear();
    replyWith("ok");
  });

  it("uploads each item in list media inputs", async () => {
    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "ListMediaModel",
      moduleName: "image.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      inputFields: [
        {
          name: "images",
          propType: "list[image]",
          tsType: "string",
          default: [],
          description: "",
          fieldType: "input",
          required: true
        }
      ],
      outputFields: [],
      enums: []
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).images = [
      { type: "image", uri: "https://example.com/a.png" },
      { type: "image", uri: "https://example.com/b.png" }
    ];

    await instance.process(ctx);

    expect(assetToUrl).toHaveBeenCalledTimes(2);
    expect(sent()).toEqual({
      model: "owner/model",
      input: {
        images: [
          "uploaded:https://example.com/a.png",
          "uploaded:https://example.com/b.png"
        ]
      }
    });
  });

  it("passes scalar lists through and preserves numeric zero inputs", async () => {
    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "ScalarListModel",
      moduleName: "text.embed",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      inputFields: [
        {
          name: "texts",
          propType: "list[str]",
          tsType: "string",
          default: [],
          description: "",
          fieldType: "input",
          required: true
        },
        {
          name: "seed",
          propType: "int",
          tsType: "number",
          default: 0,
          description: "",
          fieldType: "input",
          required: false
        }
      ],
      outputFields: [],
      enums: []
    });

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).texts = ["alpha", "beta"];
    (instance as unknown as Record<string, unknown>).seed = 0;

    await instance.process(ctx);

    expect(sent()).toEqual({
      model: "owner/model",
      input: {
        texts: ["alpha", "beta"],
        seed: 0
      }
    });
  });

  it("produces a single output per process() call for image-generation nodes", async () => {
    replyWith(["u1", "u2", "u3"]);

    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "MultiImageModel",
      moduleName: "image.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "image",
      inputFields: [],
      outputFields: [],
      enums: []
    });
    const instance = new NodeClass({});

    // process() returns a single mapped output — no genProcess fan-out.
    const result = await instance.process(ctx);
    expect(result).toHaveProperty("output");
    expect((result as { output: { type: string } }).output.type).toBe("image");
    expect(NodeClass.outputCorrelation).toBeUndefined();
    expect(
      (NodeClass as unknown as { isStreamingOutput?: boolean })
        .isStreamingOutput
    ).toBeFalsy();
  });

  it("does not register num_outputs and forces num_outputs=1 in API args", async () => {
    replyWith("u1");

    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "MultiOutputModel",
      moduleName: "image.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "image",
      inputFields: [
        {
          name: "prompt",
          propType: "str",
          tsType: "string",
          default: "",
          description: "",
          fieldType: "input",
          required: true
        },
        {
          name: "num_outputs",
          propType: "int",
          tsType: "number",
          default: 1,
          description: "",
          fieldType: "input",
          required: false,
          min: 1,
          max: 4
        }
      ],
      outputFields: [],
      enums: []
    });

    expect(
      NodeClass.getDeclaredProperties().find((p) => p.name === "num_outputs")
    ).toBeUndefined();

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).prompt = "cat";
    (instance as unknown as Record<string, unknown>).num_outputs = 4;

    await instance.process(ctx);

    expect(sent()).toEqual({
      model: "owner/model",
      input: {
        prompt: "cat",
        num_outputs: 1
      }
    });
  });

  it("registers numeric enums as numbers and sends a number to the API", async () => {
    replyWith("u1");

    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "NumericEnumModel",
      moduleName: "image.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "image",
      inputFields: [
        {
          name: "width",
          propType: "enum",
          tsType: "enum",
          default: 768,
          description: "",
          fieldType: "input",
          required: false,
          enumValues: ["512", "768", "1024"]
        }
      ],
      outputFields: [],
      enums: []
    });

    // Metadata: numeric option list + numeric default so the UI select matches.
    const prop = NodeClass.getDeclaredProperties().find(
      (p) => p.name === "width"
    );
    expect(prop?.options.values).toEqual([512, 768, 1024]);
    expect(prop?.options.default).toBe(768);

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).width = 1024;

    await instance.process(ctx);

    expect(sent()).toEqual({
      model: "owner/model",
      input: {
        width: 1024
      }
    });
  });

  it("keeps string enums as strings", async () => {
    replyWith("u1");

    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "StringEnumModel",
      moduleName: "image.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "image",
      inputFields: [
        {
          name: "mode",
          propType: "enum",
          tsType: "enum",
          default: "fast",
          description: "",
          fieldType: "input",
          required: false,
          enumValues: ["fast", "quality"]
        }
      ],
      outputFields: [],
      enums: []
    });

    const prop = NodeClass.getDeclaredProperties().find(
      (p) => p.name === "mode"
    );
    expect(prop?.options.values).toEqual(["fast", "quality"]);

    const instance = new NodeClass({});
    (instance as unknown as Record<string, unknown>).mode = "quality";

    await instance.process(ctx);

    expect(sent()).toEqual({
      model: "owner/model",
      input: {
        mode: "quality"
      }
    });
  });

  it("omits a zero default that its field's minimum forbids", async () => {
    // Flux_2_Pro declares width/height as default 0, min 256. Replicate
    // answers 422 to the 0 unless aspect_ratio is "custom".
    const spec = (manifest as ReplicateManifestEntry[]).find(
      (entry) => entry.className === "Flux_2_Pro"
    )!;
    const instance = new (createReplicateNodeClass(spec))({});
    Object.assign(instance, {
      prompt: "a red cube",
      aspect_ratio: "16:9",
      output_format: "jpg",
      seed: 7
    });

    await instance.process(ctx);

    const args = sent().input;
    expect(args).not.toHaveProperty("width");
    expect(args).not.toHaveProperty("height");
    expect(args).toMatchObject({ aspect_ratio: "16:9", seed: 7 });
  });

  it("sends a zero that its field's minimum allows", async () => {
    const spec = (manifest as ReplicateManifestEntry[]).find(
      (entry) => entry.className === "Flux_2_Pro"
    )!;
    const instance = new (createReplicateNodeClass(spec))({});
    // output_quality is min 0, so 0 is a real value.
    Object.assign(instance, { prompt: "a red cube", output_quality: 0 });

    await instance.process(ctx);

    const args = sent().input;
    expect(args.output_quality).toBe(0);
  });

  it("does not mark text outputs as streaming iterations", () => {
    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "TextModel",
      moduleName: "text.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "str",
      inputFields: [],
      outputFields: [],
      enums: []
    });

    expect(NodeClass.outputCorrelation).toBeUndefined();
    expect(NodeClass.toDescriptor("text").is_streaming_output).toBe(false);
  });

  it("runs inside the generation seam and emits a prediction message", async () => {
    replyWith("https://replicate.delivery/out/fox.mp4");
    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/video-model",
      className: "VideoModel",
      moduleName: "video.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "video",
      inputFields: [
        {
          name: "prompt",
          propType: "str",
          tsType: "string",
          default: "",
          description: "",
          fieldType: "input",
          required: true
        }
      ],
      outputFields: [],
      enums: []
    });
    const instance = new NodeClass({ __node_id: "node-7" });
    (instance as unknown as Record<string, unknown>).prompt = "a fox";

    const result = await instance.process(ctx);

    expect(result).toEqual({
      output: { type: "video", uri: "https://replicate.delivery/out/fox.mp4" }
    });
    const predictions = ctx
      .getMessages()
      .filter((m) => m.type === "prediction");
    expect(predictions.map((m) => m.status)).toEqual(["running", "completed"]);
    expect(predictions.at(-1)).toMatchObject({
      status: "completed",
      provider: "replicate",
      capability: "text_to_video",
      model: "owner/video-model",
      node_id: "node-7",
      params: { prompt: "a fox" }
    });
  });

  it("fails without a processing context", async () => {
    const NodeClass = createReplicateNodeClass({
      endpointId: "owner/model",
      className: "NoContextModel",
      moduleName: "image.generate",
      docstring: "test",
      tags: [],
      useCases: [],
      outputType: "image",
      inputFields: [],
      outputFields: [],
      enums: []
    });

    await expect(new NodeClass({}).process()).rejects.toThrow(
      "replicate.image.generate.NoContextModel needs a processing context to call Replicate"
    );
  });
});

describe("replicateCapabilityForOutputType", () => {
  it("records each manifest output type under a generation capability", async () => {
    const { replicateCapabilityForOutputType } = await import(
      "../src/replicate-base.js"
    );
    expect(
      ["image", "video", "audio", "str", "dict"].map(
        replicateCapabilityForOutputType
      )
    ).toEqual([
      "text_to_image",
      "text_to_video",
      "text_to_speech",
      "generate_message",
      "text_to_image"
    ]);
  });
});
