import { beforeEach, describe, expect, it, vi } from "vitest";

const assetToUrl = vi.fn(
  async (ref: Record<string, unknown>) => `uploaded:${String(ref.uri)}`
);
const replicateSubmit = vi.fn(async () => ({ output: "ok" }));

vi.mock("../src/replicate-base.js", () => ({
  assetToUrl,
  getReplicateApiKey: () => "test-key",
  isRefSet: (ref: unknown) => {
    if (!ref || typeof ref !== "object") return false;
    const r = ref as Record<string, unknown>;
    return Boolean(r.data || r.uri);
  },
  outputToAudioRef: (output: unknown) => ({ type: "audio", uri: output }),
  outputToImageRef: (output: unknown) => ({ type: "image", uri: output }),
  outputToString: (output: unknown) => String(output ?? ""),
  outputToVideoRef: (output: unknown) => ({ type: "video", uri: output }),
  removeNulls: (obj: Record<string, unknown>) => {
    for (const key of Object.keys(obj)) {
      if (obj[key] == null || obj[key] === "") delete obj[key];
    }
  },
  replicateSubmit
}));

const { createReplicateNodeClass } = await import("../src/replicate-factory.js");

describe("Replicate factory argument building", () => {
  beforeEach(() => {
    assetToUrl.mockClear();
    replicateSubmit.mockClear();
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

    await instance.process();

    expect(assetToUrl).toHaveBeenCalledTimes(2);
    expect(replicateSubmit).toHaveBeenCalledWith("test-key", "owner/model", {
      images: [
        "uploaded:https://example.com/a.png",
        "uploaded:https://example.com/b.png"
      ]
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

    await instance.process();

    expect(replicateSubmit).toHaveBeenCalledWith("test-key", "owner/model", {
      texts: ["alpha", "beta"],
      seed: 0
    });
  });

  it("streams one generative output per Replicate array item", async () => {
    replicateSubmit.mockResolvedValueOnce({ output: ["u1", "u2", "u3"] });

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

    const outputs: unknown[] = [];
    for await (const output of instance.genProcess()) {
      outputs.push(output);
    }

    expect(outputs).toEqual([
      { output: { type: "image", uri: "u1" } },
      { output: { type: "image", uri: "u2" } },
      { output: { type: "image", uri: "u3" } }
    ]);
    expect(NodeClass.outputCorrelation).toEqual({
      output: { kind: "iteration", source: "__execution__" }
    });
    expect(NodeClass.toDescriptor("replicate").output_correlation).toEqual({
      output: { kind: "iteration", source: "__execution__" }
    });
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
});
