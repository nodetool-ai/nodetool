import { describe, it, expect } from "vitest";
import {
  BaseNode,
  NodeRegistry,
  createGraphNodeTypeResolver,
  hydrateGraphNodeFlags,
  prop
} from "@nodetool-ai/node-sdk";
import {
  ComfyCloudWorkflowNode,
  ComfyWorkflowNode,
  comfyDynamicSlots,
  extractComfyPromptFromPng,
  isComfyConnection,
  normalizeComfyPrompt,
  parseComfyWorkflowJson,
  resolveComfySchema,
  resolveComfyWorkflow,
  type ComfyWorkflowPrompt
} from "@nodetool-ai/integration-nodes";

const samplePrompt: ComfyWorkflowPrompt = {
  "3": {
    class_type: "KSampler",
    inputs: {
      seed: 42,
      steps: 20,
      cfg: 7.5,
      model: ["4", 0],
      positive: ["6", 0],
      latent_image: ["5", 0]
    }
  },
  "6": {
    class_type: "CLIPTextEncode",
    inputs: { text: "a cat", clip: ["4", 1] },
    _meta: { title: "Positive Prompt" }
  },
  "10": {
    class_type: "LoadImage",
    inputs: { image: "input.png", upload: "image" }
  },
  "9": {
    class_type: "SaveImage",
    inputs: { images: ["8", 0], filename_prefix: "ComfyUI" }
  }
};

/** A PNG holding only a `tEXt` chunk and `IEND`. CRCs are not checked. */
function pngWithText(key: string, text: string): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = (type: string, data: Uint8Array): number[] => {
    const length = data.length;
    return [
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
      ...Buffer.from(type, "latin1"),
      ...data,
      0,
      0,
      0,
      0
    ];
  };
  const textData = Buffer.concat([
    Buffer.from(key, "latin1"),
    Buffer.from([0]),
    Buffer.from(text, "utf8")
  ]);
  return Uint8Array.from([
    ...signature,
    ...chunk("tEXt", textData),
    ...chunk("IEND", new Uint8Array())
  ]);
}

describe("isComfyConnection", () => {
  it("detects [sourceId, slot] connection refs", () => {
    expect(isComfyConnection(["4", 0])).toBe(true);
    expect(isComfyConnection([4, 1])).toBe(true);
  });
  it("rejects literal values", () => {
    expect(isComfyConnection("input.png")).toBe(false);
    expect(isComfyConnection(42)).toBe(false);
    expect(isComfyConnection(["a", "b"])).toBe(false);
    expect(isComfyConnection([1, 2, 3])).toBe(false);
  });
});

describe("normalizeComfyPrompt", () => {
  it("accepts a bare API-format prompt", () => {
    expect(normalizeComfyPrompt(samplePrompt)).toBe(samplePrompt);
  });
  it("unwraps an object nested under `prompt`", () => {
    expect(normalizeComfyPrompt({ prompt: samplePrompt })).toEqual(
      samplePrompt
    );
  });
  it("rejects the UI workflow format with a helpful error", () => {
    expect(() => normalizeComfyPrompt({ nodes: [], links: [] })).toThrow(
      /Save \(API Format\)/
    );
  });
  it("rejects nodes that are not in API format", () => {
    expect(() => normalizeComfyPrompt({ "1": { foo: "bar" } })).toThrow(
      /API format/
    );
  });
  it("rejects an empty workflow", () => {
    expect(() => normalizeComfyPrompt({})).toThrow(/empty/);
  });
});

describe("parseComfyWorkflowJson", () => {
  it("throws on invalid JSON", () => {
    expect(() => parseComfyWorkflowJson("{not json")).toThrow(/Invalid JSON/);
  });
  it("parses valid API-format JSON", () => {
    expect(parseComfyWorkflowJson(JSON.stringify(samplePrompt))).toEqual(
      samplePrompt
    );
  });
});

describe("extractComfyPromptFromPng", () => {
  it("reads the prompt from a tEXt chunk", () => {
    const png = pngWithText("prompt", JSON.stringify(samplePrompt));
    expect(extractComfyPromptFromPng(png)).toEqual(samplePrompt);
  });
  it("rejects bytes that are not a PNG", () => {
    expect(() => extractComfyPromptFromPng(Uint8Array.from([1, 2, 3]))).toThrow(
      /Not a PNG/
    );
  });
  it("explains a PNG without a ComfyUI prompt", () => {
    expect(() =>
      extractComfyPromptFromPng(pngWithText("Software", "GIMP"))
    ).toThrow(/No ComfyUI prompt/);
  });
});

describe("resolveComfySchema", () => {
  const schema = resolveComfySchema(samplePrompt);

  it("exposes LoadImage as an optional image input keyed <id>:<field>", () => {
    expect(schema.dynamic_inputs["10:image"]).toEqual({
      type: { type: "image", type_args: [], optional: true },
      description: "LoadImage · image",
      default: "input.png"
    });
    expect(schema.dynamic_properties["10:image"]).toBe("input.png");
  });

  it("exposes prompt text as a str input so a prompt can be wired in", () => {
    expect(schema.dynamic_inputs["6:text"]).toEqual({
      type: { type: "str", type_args: [], optional: true },
      description: "Positive Prompt · text",
      default: "a cat"
    });
    expect(schema.dynamic_properties["6:text"]).toBe("a cat");
  });

  it("exposes SaveImage as a singular streaming image output", () => {
    expect(schema.dynamic_outputs).toEqual({
      "9:image": { type: "image", type_args: [], optional: false }
    });
  });

  it("collects other literal params with inferred types", () => {
    const byHandle = Object.fromEntries(
      schema.available_params.map((p) => [p.handle, p])
    );
    expect(byHandle["3:seed"].type).toBe("int");
    expect(byHandle["3:cfg"].type).toBe("float");
    expect(byHandle["9:filename_prefix"].type).toBe("str");
    expect(byHandle["3:seed"].label).toBe("KSampler · seed");
  });

  it("never offers connections or exposed inputs as params", () => {
    const handles = schema.available_params.map((p) => p.handle);
    expect(handles).not.toContain("3:model");
    expect(handles).not.toContain("6:clip");
    expect(handles).not.toContain("6:text");
    expect(handles).not.toContain("10:image");
  });
});

describe("resolveComfyWorkflow", () => {
  it("resolves JSON text, a parsed object, and a PNG to the same schema", () => {
    const fromText = resolveComfyWorkflow({
      workflow: JSON.stringify(samplePrompt)
    });
    const fromObject = resolveComfyWorkflow({ workflow: samplePrompt });
    const fromPng = resolveComfyWorkflow({
      png_base64: Buffer.from(
        pngWithText("prompt", JSON.stringify(samplePrompt))
      ).toString("base64")
    });
    expect(fromObject).toEqual(fromText);
    expect(fromPng).toEqual(fromText);
  });
});

describe("comfyDynamicSlots", () => {
  it("derives slots from the workflow property", () => {
    const slots = comfyDynamicSlots({
      properties: { workflow: JSON.stringify(samplePrompt) }
    });
    expect(Object.keys(slots?.dynamic_outputs ?? {})).toEqual(["9:image"]);
    expect(Object.keys(slots?.dynamic_inputs ?? {}).sort()).toEqual([
      "10:image",
      "6:text"
    ]);
  });

  it("returns nothing for an empty or unparseable workflow", () => {
    expect(comfyDynamicSlots({ properties: { workflow: "" } })).toBeUndefined();
    expect(
      comfyDynamicSlots({ properties: { workflow: "{oops" } })
    ).toBeUndefined();
    expect(comfyDynamicSlots({})).toBeUndefined();
  });

  it("is the hook of both workflow-driven Comfy runners", () => {
    expect(ComfyWorkflowNode.resolveDynamicSlots).toBe(comfyDynamicSlots);
    expect(ComfyCloudWorkflowNode.resolveDynamicSlots).toBe(comfyDynamicSlots);
  });
});

/** A downstream image consumer, like Preview or Save Image. */
class ImageSinkNode extends BaseNode {
  static readonly nodeType = "test.ImageSink";
  static readonly title = "Image Sink";
  static readonly description = "";

  @prop({ type: "image", default: {} })
  declare image: unknown;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

/**
 * The graph from issue #6094: a Run ComfyUI Workflow node created over the
 * API, with `workflow` set and no `dynamic_outputs`, wired from its Save
 * node's slot. Before slots were derived at hydration, `validate()` rejected
 * the edge as an unknown output.
 */
function apiCreatedGraph() {
  const workflow = JSON.stringify({
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: "photo of a woman", clip: ["2", 0] }
    },
    "15": {
      class_type: "SaveImage",
      inputs: { images: ["14", 0], filename_prefix: "nodetool-bridge/quality" }
    }
  });
  return {
    nodes: [
      {
        id: "comfy",
        type: "lib.comfy.RunWorkflow",
        properties: { endpoint: "127.0.0.1:8188", workflow }
      },
      { id: "sink", type: "test.ImageSink", properties: {} }
    ],
    edges: [
      {
        id: "e1",
        source: "comfy",
        sourceHandle: "15:image",
        target: "sink",
        targetHandle: "image"
      }
    ]
  };
}

function registry(): NodeRegistry {
  const reg = new NodeRegistry();
  reg.register(ComfyWorkflowNode);
  reg.register(ImageSinkNode);
  return reg;
}

describe("Comfy slots on a graph built over the API", () => {
  it("hydrateGraphNodeFlags declares the workflow's slots", () => {
    const hydrated = hydrateGraphNodeFlags(apiCreatedGraph(), registry());
    const comfy = hydrated.nodes.find((n) => n.id === "comfy");
    expect(comfy?.dynamic_outputs).toEqual({
      "15:image": { type: "image", type_args: [], optional: false }
    });
    expect(Object.keys(comfy?.dynamic_inputs ?? {})).toEqual(["4:text"]);
  });

  it("keeps slots saved on the node over derived ones", () => {
    const graph = apiCreatedGraph();
    const saved = { type: "image", type_args: [], optional: true };
    Object.assign(graph.nodes[0], {
      dynamic_outputs: { "15:image": saved }
    });
    const hydrated = hydrateGraphNodeFlags(graph, registry());
    expect(hydrated.nodes[0].dynamic_outputs?.["15:image"]).toBe(saved);
  });

  it("the graph resolver hands the hook to Graph.loadFromDict", async () => {
    const resolved = await createGraphNodeTypeResolver(
      registry()
    ).resolveNodeType("lib.comfy.RunWorkflow");
    expect(resolved?.resolveInstanceSlots).toBe(comfyDynamicSlots);
  });
});
