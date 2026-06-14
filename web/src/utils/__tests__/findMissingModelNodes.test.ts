import { findMissingModelNodes } from "../findMissingModelNodes";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata } from "../../stores/ApiTypes";

const makeNode = (
  id: string,
  type: string,
  properties: Record<string, unknown>,
  extra: Partial<NodeData> = {}
): Node<NodeData> =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    data: { properties, ...extra } as NodeData
  }) as Node<NodeData>;

const metadataFor =
  (
    map: Record<
      string,
      { title?: string; properties: { name: string; type: string }[] }
    >
  ) =>
  (nodeType: string): NodeMetadata | undefined => {
    const entry = map[nodeType];
    if (!entry) return undefined;
    return {
      title: entry.title ?? nodeType,
      properties: entry.properties.map((p) => ({
        name: p.name,
        type: { type: p.type } as never,
        required: true
      }))
    } as unknown as NodeMetadata;
  };

const llmMeta = metadataFor({
  "nodetool.llm.Chat": {
    title: "Chat",
    properties: [{ name: "model", type: "language_model" }]
  }
});

describe("findMissingModelNodes", () => {
  it("flags a node whose model property is unset", () => {
    const nodes = [
      makeNode("n1", "nodetool.llm.Chat", {
        model: { type: "language_model", provider: "empty", id: "", name: "" }
      })
    ];
    const result = findMissingModelNodes(nodes, [], llmMeta);
    expect(result).toEqual([
      {
        nodeId: "n1",
        nodeTitle: "Chat",
        propertyName: "model",
        modelType: "language_model"
      }
    ]);
  });

  it("ignores a node with a model set", () => {
    const nodes = [
      makeNode("n1", "nodetool.llm.Chat", {
        model: {
          type: "language_model",
          provider: "openai",
          id: "gpt-4",
          name: "GPT-4"
        }
      })
    ];
    expect(findMissingModelNodes(nodes, [], llmMeta)).toEqual([]);
  });

  it("treats a missing property value as empty", () => {
    const nodes = [makeNode("n1", "nodetool.llm.Chat", {})];
    expect(findMissingModelNodes(nodes, [], llmMeta)).toHaveLength(1);
  });

  it("treats an empty object model value as empty", () => {
    const nodes = [makeNode("n1", "nodetool.llm.Chat", { model: {} })];
    expect(findMissingModelNodes(nodes, [], llmMeta)).toHaveLength(1);
  });

  it("skips bypassed nodes", () => {
    const nodes = [
      makeNode(
        "n1",
        "nodetool.llm.Chat",
        { model: { type: "language_model", provider: "empty", id: "" } },
        { bypassed: true }
      )
    ];
    expect(findMissingModelNodes(nodes, [], llmMeta)).toEqual([]);
  });

  it("skips model inputs fed by an edge", () => {
    const nodes = [
      makeNode("n1", "nodetool.llm.Chat", {
        model: { type: "language_model", provider: "empty", id: "" }
      })
    ];
    const edges: Edge[] = [
      {
        id: "e1",
        source: "src",
        target: "n1",
        targetHandle: "model"
      } as Edge
    ];
    expect(findMissingModelNodes(nodes, edges, llmMeta)).toEqual([]);
  });

  it("ignores non-provider model types (e.g. local llama)", () => {
    const meta = metadataFor({
      "nodetool.local.Llama": {
        properties: [{ name: "model", type: "llama_model" }]
      }
    });
    const nodes = [
      makeNode("n1", "nodetool.local.Llama", {
        model: { type: "llama_model", repo_id: "" }
      })
    ];
    expect(findMissingModelNodes(nodes, [], meta)).toEqual([]);
  });

  it("uses the node type's display title, not the custom title", () => {
    const nodes = [
      makeNode(
        "n1",
        "nodetool.llm.Chat",
        { model: { type: "language_model", provider: "empty", id: "" } },
        { title: "2️⃣ Pick a model here — instructions" }
      )
    ];
    expect(findMissingModelNodes(nodes, [], llmMeta)[0].nodeTitle).toBe("Chat");
  });
});
