import { describe, expect, it } from "vitest";
import {
  COMFY_CLOUD_GRAPH_NODE_ID,
  COMFY_CLOUD_GRAPH_NODE_TYPE,
  buildComfyPrompt,
  collapseComfyGraph,
  exposeComfyInterface,
  isComfyBoundaryNodeType,
  comfyEntryToMetadata,
  comfyOutputNames,
  comfyPromptToGraph,
  isComfyGraph,
  type ComfyApiPrompt,
  type ComfyObjectInfo
} from "../src/comfy-graph.js";

// Trimmed from Comfy Cloud's /api/object_info.
const INFO: ComfyObjectInfo = {
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [["sd_xl_base_1.0.safetensors", "flux1-schnell-fp8.safetensors"], {}] } },
    output: ["MODEL", "CLIP", "VAE"],
    output_name: ["MODEL", "CLIP", "VAE"],
    display_name: "Load Checkpoint",
    category: "loaders"
  },
  CLIPTextEncode: {
    input: { required: { text: ["STRING", { multiline: true }], clip: ["CLIP", {}] } },
    input_order: { required: ["text", "clip"] },
    output: ["CONDITIONING"],
    output_name: ["CONDITIONING"],
    category: "model/conditioning"
  },
  KSampler: {
    input: {
      required: {
        model: ["MODEL", {}],
        seed: ["INT", { default: 0, min: 0, max: 18446744073709551615 }],
        steps: ["INT", { default: 20, min: 1, max: 10000 }],
        cfg: ["FLOAT", { default: 8.0, min: 0, max: 100, step: 0.1 }],
        sampler_name: [["euler", "dpmpp_2m"], {}],
        positive: ["CONDITIONING", {}],
        latent_image: ["LATENT", {}]
      }
    },
    output: ["LATENT"],
    output_name: ["LATENT"],
    category: "sampling"
  },
  SaveVideo: {
    input: {
      required: {
        video: ["VIDEO", {}],
        format: [
          "COMFY_DYNAMICCOMBO_V3",
          {
            options: [
              { key: "auto", inputs: { required: { codec: ["COMFY_DYNAMICCOMBO_V3", { options: [{ key: "h264", inputs: { required: { encoding: ["STRING", { default: "fast" }] } } }] }] } } },
              { key: "mp4", inputs: { required: {} } }
            ]
          }
        ]
      }
    },
    output: [],
    output_node: true,
    category: "image/video"
  },
  LoadImage: {
    input: { required: { image: [["a.png"], { image_upload: true }] } },
    output: ["IMAGE", "MASK"],
    output_name: ["IMAGE", "MASK"],
    category: "image"
  }
};

const names = (cls: string) => (INFO[cls] ? comfyOutputNames(INFO[cls]) : undefined);

describe("comfyEntryToMetadata", () => {
  it("maps widgets to typed properties and sockets to comfy types", () => {
    const md = comfyEntryToMetadata("KSampler", INFO.KSampler);
    expect(md.node_type).toBe("comfy.KSampler");
    expect(md.namespace).toBe("comfy.sampling");
    const byName = Object.fromEntries(md.properties.map((p) => [p.name, p]));
    expect(byName.model.type.type).toBe("comfy.MODEL");
    expect(byName.seed.type.type).toBe("int");
    expect(byName.seed.max).toBeNull();
    expect(byName.cfg.type.type).toBe("float");
    expect(byName.sampler_name.type.type).toBe("enum");
    expect(byName.sampler_name.default).toBe("euler");
    expect(md.outputs).toEqual([
      { name: "LATENT", type: { type: "comfy.LATENT", optional: true, type_args: [] }, stream: false }
    ]);
  });

  it("asks for the Comfy Cloud key only when the caller names no other settings", () => {
    expect(comfyEntryToMetadata("KSampler", INFO.KSampler).required_settings).toEqual([
      "COMFY_API_KEY"
    ]);
    expect(
      comfyEntryToMetadata("KSampler", INFO.KSampler, { requiredSettings: [] }).required_settings
    ).toEqual([]);
  });

  it("flattens the default branch of a dynamic combo", () => {
    const md = comfyEntryToMetadata("SaveVideo", INFO.SaveVideo);
    expect(md.properties.map((p) => p.name)).toEqual(["video", "format", "format.codec", "format.codec.encoding"]);
    expect(md.properties[1].values).toEqual(["auto", "mp4"]);
  });

  it("compiles dynamic combo defaults with their full paths while preserving ordinary inputs", () => {
    const entry = {
      ...INFO.SaveVideo,
      input: {
        required: {
          ...INFO.SaveVideo.input?.required,
          codec: ["STRING", { default: "legacy" }],
          quality: [["high", "low"], {}]
        }
      }
    };
    const metadata = comfyEntryToMetadata("SaveVideo", entry);
    const properties = Object.fromEntries(metadata.properties.map((property) => [property.name, property.default]));
    const prompt = buildComfyPrompt({ nodes: [{ id: "1", type: metadata.node_type, properties }], edges: [] }, names);
    expect(prompt["1"].inputs).toEqual({
      format: "auto",
      "format.codec": "h264",
      "format.codec.encoding": "fast",
      codec: "legacy",
      quality: "high"
    });
  });
});

describe("buildComfyPrompt / comfyPromptToGraph", () => {
  const prompt: ComfyApiPrompt = {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "flux1-schnell-fp8.safetensors" } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: "a fox", clip: ["4", 1] } },
    "3": {
      class_type: "KSampler",
      inputs: { seed: 7, steps: 4, cfg: 1, sampler_name: "euler", model: ["4", 0], positive: ["6", 0], latent_image: ["5", 0] }
    }
  };

  it("round-trips a prompt through a graph", () => {
    const graph = comfyPromptToGraph(prompt, names);
    expect(graph.nodes.map((n) => n.type).sort()).toEqual([
      "comfy.CLIPTextEncode",
      "comfy.CheckpointLoaderSimple",
      "comfy.KSampler"
    ]);
    const x = (id: string) => (graph.nodes.find((n) => n.id === id)?.ui_properties?.position as { x: number }).x;
    expect(x("4")).toBeLessThan(x("6"));
    expect(x("6")).toBeLessThan(x("3"));
    const clipEdge = graph.edges.find((e) => e.target === "6");
    expect(clipEdge?.sourceHandle).toBe("CLIP");
    // KSampler links a node that is not in the prompt; that edge has no target to drop it on.
    const rebuilt = buildComfyPrompt(graph, names);
    expect(rebuilt["6"].inputs.clip).toEqual(["4", 1]);
    expect(rebuilt["3"].inputs.model).toEqual(["4", 0]);
    expect(rebuilt["3"].inputs.seed).toBe(7);
  });

  it("drops null literals so unconnected sockets are not sent", () => {
    const rebuilt = buildComfyPrompt(
      { nodes: [{ id: "1", type: "comfy.KSampler", data: { model: null, steps: 3 } }], edges: [] },
      names
    );
    expect(rebuilt["1"].inputs).toEqual({ steps: 3 });
  });
});

describe("collapseComfyGraph", () => {
  it("replaces a stored Comfy graph with the runner and its derived input", () => {
    const graph = {
      nodes: [
        { id: "a", type: "comfy.LoadImage", properties: { image: "a.png" } },
        { id: "c", type: "nodetool.workflows.base_node.Comment", properties: {} }
      ],
      edges: []
    };
    expect(isComfyGraph(graph)).toBe(true);
    const collapsed = collapseComfyGraph(graph);
    expect(collapsed.nodes.map((n) => n.id)).toEqual([COMFY_CLOUD_GRAPH_NODE_ID, "input_a_image"]);
    const derived = collapsed.nodes[1] as unknown as { properties: { name: string } };
    expect(derived.properties.name).toBe("image");
    const runner = collapsed.nodes[0] as unknown as { id: string; type: string; properties: { nodes: unknown[] } };
    expect(runner.id).toBe(COMFY_CLOUD_GRAPH_NODE_ID);
    expect(runner.type).toBe(COMFY_CLOUD_GRAPH_NODE_TYPE);
    expect(runner.properties.nodes).toHaveLength(1);
  });

  it("keeps Input and Output nodes and wires them to the runner", () => {
    const graph = {
      nodes: [
        { id: "a", type: "comfy.LoadImage", properties: { image: "a.png" } },
        { id: "s", type: "comfy.SaveImage", properties: {} },
        { id: "i", type: "nodetool.input.ImageInput", properties: { name: "image" } },
        { id: "o", type: "nodetool.output.Output", properties: { name: "output" } }
      ],
      edges: [
        { source: "i", sourceHandle: "output", target: "a", targetHandle: "image" },
        { source: "a", sourceHandle: "IMAGE", target: "s", targetHandle: "images" },
        { source: "s", sourceHandle: "output", target: "o", targetHandle: "value" }
      ]
    };
    const collapsed = collapseComfyGraph(graph);
    expect(collapsed.nodes.map((n) => n.id)).toEqual([COMFY_CLOUD_GRAPH_NODE_ID, "i", "o"]);
    expect(collapsed.edges).toEqual([
      { source: "i", sourceHandle: "output", target: COMFY_CLOUD_GRAPH_NODE_ID, targetHandle: "a:image" },
      { source: COMFY_CLOUD_GRAPH_NODE_ID, sourceHandle: "s:output", target: "o", targetHandle: "value" }
    ]);
    const runner = collapsed.nodes[0] as unknown as { properties: { edges: unknown[]; output_slots: string[] } };
    expect(runner.properties.edges).toHaveLength(1);
    expect(runner.properties.output_slots).toEqual(["s:output"]);
  });

  it("leaves graphs with other NodeTool nodes alone", () => {
    const graph = {
      nodes: [
        { id: "a", type: "comfy.LoadImage" },
        { id: "b", type: "nodetool.image.Blur" }
      ],
      edges: []
    };
    expect(collapseComfyGraph(graph)).toBe(graph);
  });
});

describe("exposeComfyInterface", () => {
  const graph = comfyPromptToGraph(
    {
      "1": { class_type: "LoadImage", inputs: { image: "a.png" } },
      "2": { class_type: "CLIPTextEncode", inputs: { text: "a fox" } },
      "3": { class_type: "CLIPTextEncode", inputs: { text: "blurry" } },
      "4": { class_type: "KSampler", inputs: { positive: ["2", 0], negative: ["3", 0] } },
      "5": { class_type: "SaveImage", inputs: { images: ["4", 0] } }
    },
    () => undefined
  );

  it("adds inputs for Load nodes and the positive prompt, and an output per Save node", () => {
    const exposed = exposeComfyInterface(graph);
    const added = exposed.nodes.filter((n) => isComfyBoundaryNodeType(n.type));
    expect(added.map((n) => [n.type, (n.data as { name: string }).name])).toEqual([
      ["nodetool.input.StringInput", "prompt"],
      ["nodetool.input.ImageInput", "image"],
      ["nodetool.output.Output", "output"]
    ]);
    expect(exposed.edges).toContainEqual(expect.objectContaining({ target: "2", targetHandle: "text" }));
    expect(exposed.edges).not.toContainEqual(expect.objectContaining({ target: "3", targetHandle: "text" }));
    const save = exposed.nodes.find((n) => n.id === "5");
    expect(save?.dynamic_outputs).toEqual({ output: { type: "image", optional: true, type_args: [] } });
  });

  it("leaves a NodeTool graph unchanged", () => {
    const plain = { nodes: [{ id: "a", type: "nodetool.image.Blur" }], edges: [] };
    expect(exposeComfyInterface(plain)).toBe(plain);
  });

  it("keeps a contract the graph already has", () => {
    const exposed = exposeComfyInterface(graph);
    expect(exposeComfyInterface(exposed)).toBe(exposed);
  });
});
