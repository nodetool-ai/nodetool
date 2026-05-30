import { isHeavyNode, countHeavyNodes } from "../heavyNodes";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import type { NodeMetadata, UnifiedModel } from "../../stores/ApiTypes";

const meta = (over: Partial<NodeMetadata>): NodeMetadata => over as NodeMetadata;

const node = (id: string, type: string, bypassed = false): Node<NodeData> =>
  ({ id, type, data: { bypassed } }) as unknown as Node<NodeData>;

describe("isHeavyNode", () => {
  it("returns false for undefined or plain local nodes", () => {
    expect(isHeavyNode(undefined)).toBe(false);
    expect(
      isHeavyNode(meta({ required_settings: [], recommended_models: [] }))
    ).toBe(false);
  });

  it("flags nodes that require provider API-key settings", () => {
    expect(isHeavyNode(meta({ required_settings: ["OPENAI_API_KEY"] }))).toBe(
      true
    );
  });

  it("flags nodes that run a model", () => {
    expect(
      isHeavyNode(meta({ recommended_models: [{} as UnifiedModel] }))
    ).toBe(true);
  });

  it("flags generative (auto_save_asset) nodes", () => {
    expect(isHeavyNode(meta({ auto_save_asset: true }))).toBe(true);
  });
});

describe("countHeavyNodes", () => {
  const getMeta = (type: string): NodeMetadata | undefined => {
    if (type === "openai") return meta({ required_settings: ["OPENAI_API_KEY"] });
    if (type === "fal") return meta({ auto_save_asset: true });
    return meta({});
  };

  it("counts only non-bypassed heavy nodes", () => {
    const nodes = [
      node("1", "openai"),
      node("2", "fal"),
      node("3", "text.Concat"),
      node("4", "openai", true) // bypassed → excluded
    ];
    expect(countHeavyNodes(nodes, getMeta)).toBe(2);
  });

  it("returns 0 when there are no heavy nodes", () => {
    expect(countHeavyNodes([node("1", "text.Concat")], getMeta)).toBe(0);
  });
});
