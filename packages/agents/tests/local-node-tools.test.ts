import { describe, it, expect } from "vitest";
import { LocalSearchNodesTool } from "../src/tools/local-search-nodes-tool.js";
import { LocalGetNodeInfoTool } from "../src/tools/local-get-node-info-tool.js";
import { LocalListNodesTool } from "../src/tools/local-list-nodes-tool.js";
import type { NodeMetadata } from "@nodetool/node-sdk";

function createMetadata(overrides: Partial<NodeMetadata> = {}): NodeMetadata {
  return {
    title: "Test Node",
    description: "A test node for unit testing.",
    namespace: "test",
    node_type: "test.TestNode",
    properties: [
      {
        name: "input",
        type: { type: "str", type_args: [] },
        default: "",
        title: "Input"
      }
    ],
    outputs: [{ name: "output", type: { type: "str", type_args: [] } }],
    ...overrides
  };
}

function mockRegistry(metadataList: NodeMetadata[]) {
  return {
    listMetadata: () => metadataList,
    getMetadata: (nodeType: string) =>
      metadataList.find((m) => m.node_type === nodeType) ?? undefined
  } as any;
}

function mockContext() {
  return {} as any;
}

describe("LocalSearchNodesTool", () => {
  const allNodes = [
    createMetadata({
      node_type: "nodetool.text.Split",
      title: "Split Text",
      description: "Split text by delimiter.",
      namespace: "nodetool.text"
    }),
    createMetadata({
      node_type: "nodetool.text.Concat",
      title: "Concat Text",
      description: "Concatenate strings.",
      namespace: "nodetool.text"
    }),
    createMetadata({
      node_type: "lib.image.Resize",
      title: "Resize Image",
      description: "Resize an image to target dimensions.",
      namespace: "lib.image",
      properties: [
        {
          name: "image",
          type: { type: "image", type_args: [] },
          title: "Image"
        },
        {
          name: "width",
          type: { type: "int", type_args: [] },
          title: "Width"
        }
      ],
      outputs: [
        { name: "output", type: { type: "image", type_args: [] } }
      ]
    })
  ];

  it("searches by keyword", async () => {
    const tool = new LocalSearchNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      query: ["split"]
    })) as Record<string, unknown>;

    expect(result.total).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].type).toBe("nodetool.text.Split");
  });

  it("searches with multiple terms", async () => {
    const tool = new LocalSearchNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      query: ["resize", "image"]
    })) as Record<string, unknown>;

    expect(result.total).toBe(1);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0].type).toBe("lib.image.Resize");
  });

  it("returns compact results with inputs and outputs", async () => {
    const tool = new LocalSearchNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      query: ["text"]
    })) as Record<string, unknown>;

    expect(result.total).toBe(2);
    const results = result.results as Array<Record<string, unknown>>;
    expect(results[0]).toHaveProperty("inputs");
    expect(results[0]).toHaveProperty("outputs");
  });

  it("limits results", async () => {
    const tool = new LocalSearchNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      query: ["text"],
      n_results: 1
    })) as Record<string, unknown>;

    expect(result.total).toBe(2);
    expect((result.results as unknown[]).length).toBe(1);
  });

  it("filters by output type", async () => {
    const tool = new LocalSearchNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      query: ["resize"],
      output_type: "image"
    })) as Record<string, unknown>;

    expect(result.total).toBe(1);
  });

  it("hides provider nodes by default", async () => {
    const mixed = [
      createMetadata({
        node_type: "nodetool.image.TextToImage",
        title: "Text To Image",
        namespace: "nodetool.image"
      }),
      createMetadata({
        node_type: "openai.ImageCreation",
        title: "Image Creation",
        namespace: "openai"
      })
    ];
    const tool = new LocalSearchNodesTool(mockRegistry(mixed));
    const result = (await tool.process(mockContext(), {
      query: ["image"]
    })) as Record<string, unknown>;
    const types = (result.results as Array<{ type: string }>).map(
      (r) => r.type
    );
    expect(types).toEqual(["nodetool.image.TextToImage"]);
  });

  it("includes provider nodes when include_provider_nodes is true", async () => {
    const mixed = [
      createMetadata({
        node_type: "nodetool.image.TextToImage",
        title: "Text To Image",
        namespace: "nodetool.image"
      }),
      createMetadata({
        node_type: "openai.ImageCreation",
        title: "Image Creation",
        namespace: "openai"
      })
    ];
    const tool = new LocalSearchNodesTool(mockRegistry(mixed));
    const result = (await tool.process(mockContext(), {
      query: ["image"],
      include_provider_nodes: true
    })) as Record<string, unknown>;
    const types = (result.results as Array<{ type: string }>).map(
      (r) => r.type
    );
    expect(types).toContain("nodetool.image.TextToImage");
    expect(types).toContain("openai.ImageCreation");
    // Core node should rank ahead of the provider node.
    expect(types.indexOf("nodetool.image.TextToImage")).toBeLessThan(
      types.indexOf("openai.ImageCreation")
    );
  });

  it("scopes by namespace prefix", async () => {
    const tool = new LocalSearchNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      query: ["text"],
      namespace: "nodetool.text"
    })) as Record<string, unknown>;
    expect(result.total).toBe(2);
    const types = (result.results as Array<{ type: string }>).map(
      (r) => r.type
    );
    expect(types.every((t) => t.startsWith("nodetool.text."))).toBe(true);
  });
});

describe("LocalGetNodeInfoTool", () => {
  const meta = createMetadata({
    node_type: "nodetool.text.Split",
    title: "Split Text",
    description: "Split text by delimiter.",
    namespace: "nodetool.text",
    properties: [
      {
        name: "text",
        type: { type: "str", type_args: [] },
        title: "Text",
        description: "Text to split"
      },
      {
        name: "delimiter",
        type: { type: "str", type_args: [] },
        title: "Delimiter",
        default: "\\n"
      }
    ],
    outputs: [
      { name: "output", type: { type: "list", type_args: [{ type: "str", type_args: [] }] } }
    ]
  });

  it("returns full metadata for a known type", async () => {
    const tool = new LocalGetNodeInfoTool(mockRegistry([meta]));
    const result = (await tool.process(mockContext(), {
      node_type: "nodetool.text.Split"
    })) as Record<string, unknown>;

    expect(result.node_type).toBe("nodetool.text.Split");
    expect(result.title).toBe("Split Text");
    const props = result.properties as Array<Record<string, unknown>>;
    expect(props).toHaveLength(2);
    expect(props[0].name).toBe("text");
    expect(props[0].type).toBe("str");
    const outputs = result.outputs as Array<Record<string, unknown>>;
    expect(outputs[0].type).toBe("list[str]");
  });

  it("returns error for unknown type", async () => {
    const tool = new LocalGetNodeInfoTool(mockRegistry([]));
    const result = (await tool.process(mockContext(), {
      node_type: "unknown.Node"
    })) as Record<string, unknown>;

    expect(result.status).toBe("error");
  });
});

describe("LocalListNodesTool", () => {
  const allNodes = [
    createMetadata({ node_type: "nodetool.text.Split", namespace: "nodetool.text" }),
    createMetadata({ node_type: "nodetool.text.Concat", namespace: "nodetool.text" }),
    createMetadata({ node_type: "lib.image.Resize", namespace: "lib.image" })
  ];

  it("lists all nodes", async () => {
    const tool = new LocalListNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {})) as Record<
      string,
      unknown
    >;

    expect(result.total).toBe(3);
    expect((result.nodes as unknown[]).length).toBe(3);
    const namespaces = result.namespaces as Record<string, number>;
    expect(namespaces["nodetool.text"]).toBe(2);
    expect(namespaces["lib.image"]).toBe(1);
  });

  it("filters by namespace", async () => {
    const tool = new LocalListNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      namespace: "nodetool.text"
    })) as Record<string, unknown>;

    expect(result.total).toBe(2);
  });

  it("limits results", async () => {
    const tool = new LocalListNodesTool(mockRegistry(allNodes));
    const result = (await tool.process(mockContext(), {
      limit: 1
    })) as Record<string, unknown>;

    expect(result.total).toBe(3);
    expect((result.nodes as unknown[]).length).toBe(1);
  });
});
