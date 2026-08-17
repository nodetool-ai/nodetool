import { findMissingModelNodes, isModelEmpty } from "../findMissingModelNodes";
import { stub } from "../../test-utils/doubles";
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
    return stub<NodeMetadata>({
      title: entry.title ?? nodeType,
      properties: entry.properties.map((p) => ({
        name: p.name,
        type: { type: p.type } as never,
        required: true
      }))
    });
  };

const llmMeta = metadataFor({
  "nodetool.llm.Chat": {
    title: "Chat",
    properties: [{ name: "model", type: "language_model" }]
  }
});

// Every provider × id shape a graph can carry. Only a non-empty provider that
// is not the "empty" sentinel, paired with an id, counts as a selection.
const ABSENT = Symbol("absent");
const PROVIDERS = [ABSENT, undefined, null, "", 0, false, "empty", "openai"];
const IDS = [ABSENT, undefined, null, "", 0, false, "gpt-5"];

const modelRef = (provider: unknown, id: unknown) => {
  const ref: Record<string, unknown> = { type: "language_model" };
  if (provider !== ABSENT) ref.provider = provider;
  if (id !== ABSENT) ref.id = id;
  return ref;
};

const label = (v: unknown) =>
  v === ABSENT ? "<absent>" : v === undefined ? "undefined" : JSON.stringify(v);

describe("isModelEmpty", () => {
  it.each([null, undefined, "", 0, false, NaN])(
    "treats the falsy value %p as empty",
    (value) => {
      expect(isModelEmpty(value)).toBe(true);
    }
  );

  const cases = PROVIDERS.flatMap((provider) =>
    IDS.map((id) => ({
      name: `{ provider: ${label(provider)}, id: ${label(id)} }`,
      provider,
      id,
      expected: !(provider === "openai" && id === "gpt-5")
    }))
  );

  it.each(cases)("$name is empty: $expected", ({ provider, id, expected }) => {
    expect(isModelEmpty(modelRef(provider, id))).toBe(expected);
  });
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

  it("flags a model that carries an id but no provider", () => {
    // `validateNodeProperties` refuses this graph with `unset_model`.
    const nodes = [
      makeNode("n1", "nodetool.llm.Chat", {
        model: { type: "language_model", id: "gpt-4", name: "GPT-4" }
      })
    ];
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
