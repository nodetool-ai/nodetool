import type { Node } from "@xyflow/react";
import type { NodeData } from "../NodeData";
import {
  getCollapseTogglePatches,
  readExpandedBodyHeightPx,
  NODE_COLLAPSED_STRIP_HEIGHT_PX
} from "../collapseNodeLayout";

const baseData = (): NodeData => ({
  properties: {},
  dynamic_properties: {},
  dynamic_outputs: {},
  selectable: true,
  collapsed: false,
  bypassed: false,
  workflow_id: "w1"
});

const rf = (overrides: Partial<Node<NodeData>>): Node<NodeData> => {
  const { data: dataOverrides, ...rest } = overrides;
  return {
    id: "n1",
    type: "nodetool.text.Prompt",
    position: { x: 0, y: 0 },
    data: { ...baseData(), ...dataOverrides },
    ...rest
  } as Node<NodeData>;
};

describe("readExpandedBodyHeightPx", () => {
  it("prefers node.height over larger measured.height", () => {
    const h = readExpandedBodyHeightPx(
      rf({
        style: { width: 300, height: 200 },
        height: 200,
        measured: { width: 300, height: 268 }
      })
    );
    expect(h).toBe(200);
  });

  it("prefers node.height over stale larger style.height (after resize)", () => {
    expect(
      readExpandedBodyHeightPx(
        rf({
          type: "nodetool.constant.Image",
          style: { width: 200, height: 274 },
          height: 185,
          measured: { width: 200, height: 185 }
        })
      )
    ).toBe(185);
  });

  it("prefers node.height over larger measured when style height absent", () => {
    expect(
      readExpandedBodyHeightPx(
        rf({
          height: 180,
          measured: { width: 200, height: 220 }
        })
      )
    ).toBe(180);
  });

  it("parses string style height", () => {
    expect(
      readExpandedBodyHeightPx(
        rf({
          style: { height: "195px" },
          measured: { width: 200, height: 240 }
        })
      )
    ).toBe(195);
  });

  it("falls back to measured when no explicit height", () => {
    expect(
      readExpandedBodyHeightPx(
        rf({
          measured: { width: 200, height: 155 }
        })
      )
    ).toBe(155);
  });

  it("rounds measured height", () => {
    expect(
      readExpandedBodyHeightPx(
        rf({
          measured: { width: 200, height: 150.4 }
        })
      )
    ).toBe(150);
  });

  it("returns minimum when nothing usable", () => {
    expect(readExpandedBodyHeightPx(rf({}))).toBe(100);
  });

  it("ignores strip-sized dimensions", () => {
    expect(
      readExpandedBodyHeightPx(
        rf({
          height: NODE_COLLAPSED_STRIP_HEIGHT_PX,
          style: { height: NODE_COLLAPSED_STRIP_HEIGHT_PX },
          measured: { width: 200, height: NODE_COLLAPSED_STRIP_HEIGHT_PX }
        })
      )
    ).toBe(100);
  });
});

describe("getCollapseTogglePatches", () => {
  it("stores expanded height from authoritative node.height, not inflated measured", () => {
    const node = rf({
      style: { width: 280, height: 190 },
      height: 190,
      measured: { width: 280, height: 260 }
    });
    const { data, node: patch } = getCollapseTogglePatches(node, true);
    expect(data.collapsed).toBe(true);
    expect(data.expandedHeightPx).toBe(190);
    expect(patch.height).toBe(NODE_COLLAPSED_STRIP_HEIGHT_PX);
  });
});
