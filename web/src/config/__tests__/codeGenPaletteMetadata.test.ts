import {
  CODE_GEN_PALETTE_ALIASES,
  CODE_GEN_PALETTE_NODE_TYPE,
  codeGenPaletteMetadata,
  generateCodeGenPaletteMetadata
} from "../codeGenPaletteMetadata";
import { stub } from "../../test-utils/doubles";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { rankSearchNodes } from "../../utils/nodeSearch";

const anyType = { type: "any", type_args: [], optional: false };

const decoy = (title: string, nodeType: string): NodeMetadata =>
  stub<NodeMetadata>({
    title,
    description: "An unrelated node.",
    namespace: "nodetool.other",
    node_type: nodeType,
    layout: "default",
    properties: [{ name: "value", type: anyType }],
    outputs: [{ name: "output", type: anyType, stream: false }],
    recommended_models: [],
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  });

const catalog: NodeMetadata[] = [
  codeGenPaletteMetadata(),
  decoy("Add", "nodetool.math.Add"),
  decoy("Preview", "nodetool.workflows.Preview"),
  decoy("Save Text", "nodetool.text.SaveText")
];

describe("codeGenPaletteMetadata", () => {
  it("registers under the code namespace with a distinct node type", () => {
    const record = generateCodeGenPaletteMetadata();
    expect(Object.keys(record)).toEqual([CODE_GEN_PALETTE_NODE_TYPE]);
    expect(record[CODE_GEN_PALETTE_NODE_TYPE].namespace).toBe("nodetool.code");
    expect(record[CODE_GEN_PALETTE_NODE_TYPE].title).toBe("Write Code with AI");
  });

  it("carries its aliases as search terms on the description", () => {
    const { description } = codeGenPaletteMetadata();
    for (const alias of CODE_GEN_PALETTE_ALIASES) {
      expect(description).toContain(alias);
    }
  });

  it.each([
    "transform",
    "reshape",
    "merge",
    "extract",
    "parse",
    "validate",
    "write code with ai"
  ])("is findable by searching %p", (term) => {
    const found = rankSearchNodes(catalog, term).map((node) => node.node_type);
    expect(found).toContain(CODE_GEN_PALETTE_NODE_TYPE);
  });
});
