import { countHeavyNodes } from "../heavyNodes";
import type { Node } from "@xyflow/react";
import type { NodeData } from "../../stores/NodeData";
import type { NodeMetadata } from "../../stores/ApiTypes";

const meta = (over: Partial<NodeMetadata>): NodeMetadata => over as NodeMetadata;

const node = (id: string, type: string, bypassed = false): Node<NodeData> =>
  ({ id, type, data: { bypassed } }) as unknown as Node<NodeData>;

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
