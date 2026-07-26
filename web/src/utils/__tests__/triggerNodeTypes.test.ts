import {
  TRIGGER_NODE_TYPES,
  TRIGGER_KIND_BY_NODE_TYPE,
  isTriggerNodeType,
  graphHasTriggerNodes
} from "../triggerNodeTypes";

describe("isTriggerNodeType", () => {
  it("recognizes every known trigger node type", () => {
    for (const type of TRIGGER_NODE_TYPES) {
      expect(isTriggerNodeType(type)).toBe(true);
    }
  });

  it("rejects a non-trigger node type", () => {
    expect(isTriggerNodeType("nodetool.text.Concat")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isTriggerNodeType(null)).toBe(false);
    expect(isTriggerNodeType(undefined)).toBe(false);
  });
});

describe("TRIGGER_KIND_BY_NODE_TYPE", () => {
  it("maps every node type in TRIGGER_NODE_TYPES to a kind", () => {
    for (const type of TRIGGER_NODE_TYPES) {
      expect(TRIGGER_KIND_BY_NODE_TYPE[type]).toBeDefined();
    }
  });

  it("maps the webhook trigger to the webhook kind", () => {
    expect(TRIGGER_KIND_BY_NODE_TYPE["nodetool.triggers.WebhookTrigger"]).toBe(
      "webhook"
    );
  });
});

describe("graphHasTriggerNodes", () => {
  it("is true when at least one node type is a trigger", () => {
    expect(
      graphHasTriggerNodes([
        "nodetool.text.Concat",
        "nodetool.triggers.WebhookTrigger"
      ])
    ).toBe(true);
  });

  it("is false when no node type is a trigger", () => {
    expect(
      graphHasTriggerNodes(["nodetool.text.Concat", "nodetool.math.Add"])
    ).toBe(false);
  });

  it("is false for an empty graph", () => {
    expect(graphHasTriggerNodes([])).toBe(false);
  });
});
