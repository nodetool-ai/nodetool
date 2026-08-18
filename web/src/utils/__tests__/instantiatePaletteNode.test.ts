/**
 * @jest-environment node
 */
import { instantiatePaletteNode } from "../instantiatePaletteNode";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import type { Node } from "@xyflow/react";

jest.mock("../../config/snippetMetadata", () => ({
  findSnippetByNodeType: jest.fn()
}));

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({
      getMetadata: jest.fn()
    }))
  }
}));

jest.mock("../codeOutputInference", () => ({
  inferOutputKeysFromCode: jest.fn(),
  inferInputKeysFromCode: jest.fn()
}));

jest.mock("../../components/node/codeNodeUi", () => ({
  CODE_NODE_TYPE: "nodetool.code.Code"
}));

import { findSnippetByNodeType } from "../../config/snippetMetadata";
import { materializeJsScriptNode } from "@nodetool-ai/node-sdk/js-script-materialize";
import {
  customNodeType,
  setCustomNodeScripts,
  type CustomNodeScript
} from "../../config/customNodeMetadata";
import { CODE_GEN_PALETTE_NODE_TYPE } from "../../config/codeGenPaletteMetadata";
import useMetadataStore from "../../stores/MetadataStore";
import useCodeGenDialogStore from "../../stores/CodeGenDialogStore";
import {
  inferOutputKeysFromCode,
  inferInputKeysFromCode
} from "../codeOutputInference";

const mockFindSnippet = findSnippetByNodeType as jest.MockedFunction<
  typeof findSnippetByNodeType
>;
const mockInferOutputs = inferOutputKeysFromCode as jest.MockedFunction<
  typeof inferOutputKeysFromCode
>;
const mockInferInputs = inferInputKeysFromCode as jest.MockedFunction<
  typeof inferInputKeysFromCode
>;

function makeMetadata(nodeType: string): NodeMetadata {
  return {
    node_type: nodeType,
    title: nodeType,
    namespace: "test",
    description: "",
    layout: "default",
    properties: [],
    outputs: [],
    supports_dynamic_inputs: false,
    recommended_models: [],
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    required_settings: []
  };
}

function makeCreateNode(): jest.Mock<Node<NodeData>> {
  return jest.fn((metadata, position, properties) => ({
    id: "new-node-1",
    type: metadata.node_type,
    position,
    data: {
      properties: properties ?? {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "wf-1"
    }
  }));
}

describe("instantiatePaletteNode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindSnippet.mockReturnValue(undefined);
  });

  it("creates a regular node when no snippet matches", () => {
    const metadata = makeMetadata("nodetool.text.Join");
    const createNode = makeCreateNode();

    const result = instantiatePaletteNode(
      metadata,
      { x: 100, y: 200 },
      createNode
    );

    expect(createNode).toHaveBeenCalledWith(metadata, { x: 100, y: 200 });
    expect(result.node.type).toBe("nodetool.text.Join");
    expect(result.afterAdd).toBeUndefined();
  });

  it("creates a code node for snippets with inferred IO", () => {
    const snippet = {
      id: "test-snippet",
      title: "Test Snippet",
      code: "output = input_a + input_b",
      description: "Adds two values",
      tags: ["test"],
      category: "Math" as const
    };
    mockFindSnippet.mockReturnValue(snippet);
    mockInferOutputs.mockReturnValue(["output"]);
    mockInferInputs.mockReturnValue(["input_a", "input_b"]);

    const codeMetadata = makeMetadata("nodetool.code.Code");
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(codeMetadata)
    });

    const createNode = makeCreateNode();
    const result = instantiatePaletteNode(
      makeMetadata("nodetool.math.test_snippet"),
      { x: 0, y: 0 },
      createNode
    );

    expect(createNode).toHaveBeenCalledWith(codeMetadata, { x: 0, y: 0 }, {
      code: "output = input_a + input_b"
    });
    expect(result.node.data.title).toBe("Test Snippet");
    expect(result.node.data.codeNodeMode).toBe("snippet");
    expect(result.afterAdd).toBeDefined();
    expect(result.afterAdd!.dynamic_outputs).toEqual({
      output: { type: "any", type_args: [], optional: false }
    });
    expect(result.afterAdd!.dynamic_properties).toEqual({
      input_a: "",
      input_b: ""
    });
  });

  it("seeds declared slot types onto the created node", () => {
    const snippet = {
      id: "svg-circle",
      title: "Circle",
      code: "return { output: { cx, r: radius, fill } };",
      description: "A circle",
      tags: ["svg"],
      category: "SVG" as const,
      inputs: {
        cx: { type: "int", default: 0 },
        radius: { type: "int", default: 50, min: 0 },
        fill: { type: "color", default: "#000000", description: "Fill colour" }
      },
      outputs: { output: "svg_element" }
    };
    mockFindSnippet.mockReturnValue(snippet);
    mockInferOutputs.mockReturnValue(["output"]);
    mockInferInputs.mockReturnValue(["cx", "radius", "fill"]);

    const codeMetadata = makeMetadata("nodetool.code.Code");
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(codeMetadata)
    });

    const result = instantiatePaletteNode(
      makeMetadata("nodetool.svg.svg_circle"),
      { x: 0, y: 0 },
      makeCreateNode()
    );

    expect(result.afterAdd!.dynamic_outputs).toEqual({
      output: { type: "svg_element", type_args: [], optional: false }
    });
    expect(result.afterAdd!.dynamic_inputs).toEqual({
      cx: {
        type: { type: "int", type_args: [], optional: false },
        default: 0
      },
      radius: {
        type: { type: "int", type_args: [], optional: false },
        default: 50,
        min: 0
      },
      fill: {
        type: { type: "color", type_args: [], optional: false },
        default: "#000000",
        description: "Fill colour"
      }
    });
    expect(result.afterAdd!.dynamic_properties).toEqual({
      cx: 0,
      radius: 50,
      fill: "#000000"
    });
  });

  it("leaves undeclared slots untyped", () => {
    const snippet = {
      id: "partly-typed",
      title: "Partly typed",
      code: "return { output: a, other: b };",
      description: "One declared slot",
      tags: [],
      category: "Math" as const,
      inputs: { a: { type: "float" } },
      outputs: { output: "dataframe" }
    };
    mockFindSnippet.mockReturnValue(snippet);
    mockInferOutputs.mockReturnValue(["output", "other"]);
    mockInferInputs.mockReturnValue(["a", "b"]);

    const codeMetadata = makeMetadata("nodetool.code.Code");
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(codeMetadata)
    });

    const result = instantiatePaletteNode(
      makeMetadata("nodetool.math.partly_typed"),
      { x: 0, y: 0 },
      makeCreateNode()
    );

    expect(result.afterAdd!.dynamic_outputs).toEqual({
      output: { type: "dataframe", type_args: [], optional: false },
      other: { type: "any", type_args: [], optional: false }
    });
    expect(Object.keys(result.afterAdd!.dynamic_inputs!)).toEqual(["a"]);
    expect(result.afterAdd!.dynamic_properties).toEqual({ a: 0, b: "" });
  });

  it("omits dynamic_inputs entirely when nothing is declared", () => {
    const snippet = {
      id: "plain",
      title: "Plain",
      code: "return { output: a };",
      description: "Untyped",
      tags: [],
      category: "Text" as const
    };
    mockFindSnippet.mockReturnValue(snippet);
    mockInferOutputs.mockReturnValue(["output"]);
    mockInferInputs.mockReturnValue(["a"]);

    const codeMetadata = makeMetadata("nodetool.code.Code");
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(codeMetadata)
    });

    const result = instantiatePaletteNode(
      makeMetadata("nodetool.text.plain"),
      { x: 0, y: 0 },
      makeCreateNode()
    );

    expect(result.afterAdd!.dynamic_inputs).toBeUndefined();
    expect(result.afterAdd!.dynamic_outputs).toEqual({
      output: { type: "any", type_args: [], optional: false }
    });
    expect(result.afterAdd!.dynamic_properties).toEqual({ a: "" });
  });

  it("returns no afterAdd when snippet has no inferred IO", () => {
    const snippet = {
      id: "bare-snippet",
      title: "Bare",
      code: "print('hello')",
      description: "No IO",
      tags: [],
      category: "Text" as const
    };
    mockFindSnippet.mockReturnValue(snippet);
    mockInferOutputs.mockReturnValue(null);
    mockInferInputs.mockReturnValue(null);

    const codeMetadata = makeMetadata("nodetool.code.Code");
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(codeMetadata)
    });

    const createNode = makeCreateNode();
    const result = instantiatePaletteNode(
      makeMetadata("nodetool.text.bare_snippet"),
      { x: 10, y: 20 },
      createNode
    );

    expect(result.afterAdd).toBeUndefined();
  });

  it("creates an empty Code node and opens the dialog for the AI authoring entry", () => {
    useCodeGenDialogStore.setState({ request: null });
    const codeMetadata = makeMetadata("nodetool.code.Code");
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(codeMetadata)
    });

    const createNode = makeCreateNode();
    const result = instantiatePaletteNode(
      makeMetadata(CODE_GEN_PALETTE_NODE_TYPE),
      { x: 1, y: 2 },
      createNode
    );

    expect(createNode).toHaveBeenCalledWith(codeMetadata, { x: 1, y: 2 });
    expect(result.node.type).toBe("nodetool.code.Code");
    expect(result.afterAdd).toBeUndefined();
    expect(useCodeGenDialogStore.getState().request).toBeNull();

    result.onAdded?.(result.node.id);

    // The node is created before the dialog, so cancelling has to remove it.
    expect(useCodeGenDialogStore.getState().request).toEqual({
      nodeId: "new-node-1",
      discard: { nodeIds: ["new-node-1"], edgeIds: [], restoreEdges: [] }
    });
  });

  it("falls back to regular creation when code metadata is missing", () => {
    const snippet = {
      id: "orphan",
      title: "Orphan",
      code: "x = 1",
      description: "No code node in registry",
      tags: [],
      category: "Math" as const
    };
    mockFindSnippet.mockReturnValue(snippet);

    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(undefined)
    });

    const metadata = makeMetadata("nodetool.math.orphan");
    const createNode = makeCreateNode();
    const result = instantiatePaletteNode(
      metadata,
      { x: 5, y: 5 },
      createNode
    );

    expect(createNode).toHaveBeenCalledWith(metadata, { x: 5, y: 5 });
    expect(result.afterAdd).toBeUndefined();
  });
});

describe("custom nodes", () => {
  const script: CustomNodeScript = {
    id: "abc-123",
    name: "Invoice number",
    version: 7,
    document: {
      description: "Formats our invoice numbers",
      code: 'await output("formatted", inputs.raw);',
      inputs: [{ name: "raw", type: "str" }],
      outputs: [{ name: "formatted", type: "str" }],
      packages: [{ specifier: "@nodetool-ai/sandbox-yaml" }],
      secrets: ["MY_KEY"],
      timeoutSeconds: 45,
      palette: { category: "My API" }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindSnippet.mockReturnValue(undefined);
    setCustomNodeScripts([script]);
    (useMetadataStore.getState as jest.Mock).mockReturnValue({
      getMetadata: jest.fn().mockReturnValue(makeMetadata("nodetool.code.Code"))
    });
  });

  afterEach(() => setCustomNodeScripts([]));

  it("materializes the script the way the link hook does", () => {
    const createNode = makeCreateNode();
    const result = instantiatePaletteNode(
      makeMetadata(customNodeType(script)),
      { x: 1, y: 2 },
      createNode
    );

    // The link hook calls the same helper, so equality here is what keeps a
    // dropped node and a linked node identical.
    const expected = materializeJsScriptNode(script.document, {
      id: script.id,
      version: script.version
    });

    expect(result.node.type).toBe("nodetool.code.Code");
    expect(result.node.data.properties).toEqual(expected.properties);
    expect(result.node.data.title).toBe("Invoice number");
    expect(result.node.data.codeNodeMode).toBe("custom");
    expect(result.afterAdd!.dynamic_inputs).toEqual(expected.dynamic_inputs);
    expect(result.afterAdd!.dynamic_outputs).toEqual(expected.dynamic_outputs);
    expect(result.afterAdd!.dynamic_properties).toEqual({ raw: "" });
  });

  it("pins the version the menu offered", () => {
    const result = instantiatePaletteNode(
      makeMetadata(customNodeType(script)),
      { x: 0, y: 0 },
      makeCreateNode()
    );
    expect(result.node.data.properties?.script).toEqual({
      id: "abc-123",
      version: 7
    });
  });
});
