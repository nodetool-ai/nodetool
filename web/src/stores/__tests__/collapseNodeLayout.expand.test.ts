import type { Node } from "@xyflow/react";
import type { NodeData } from "../NodeData";
import {
  getCollapseTogglePatches,
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

describe("getCollapseTogglePatches — expand path", () => {
  it("restores saved expandedHeightPx, sets collapsed=false, clears expandedHeightPx", () => {
    const node = rf({
      data: {
        ...baseData(),
        collapsed: true,
        expandedHeightPx: 250,
        expandedWidthPx: 300
      },
      height: NODE_COLLAPSED_STRIP_HEIGHT_PX,
      style: { height: NODE_COLLAPSED_STRIP_HEIGHT_PX }
    });

    const { data, node: patch } = getCollapseTogglePatches(node, false);

    expect(data.collapsed).toBe(false);
    expect(data.expandedHeightPx).toBeUndefined();
    expect(patch.height).toBe(250);
    expect(patch.style?.height).toBe(250);
  });

  it("returns height=undefined when no saved expandedHeightPx", () => {
    const node = rf({
      data: {
        ...baseData(),
        collapsed: true
      },
      height: NODE_COLLAPSED_STRIP_HEIGHT_PX,
      style: { height: NODE_COLLAPSED_STRIP_HEIGHT_PX }
    });

    const { data, node: patch } = getCollapseTogglePatches(node, false);

    expect(data.collapsed).toBe(false);
    expect(data.expandedHeightPx).toBeUndefined();
    expect(patch.height).toBeUndefined();
    expect(patch.style?.height).toBeUndefined();
  });

  it("restores saved expandedWidthPx into style.width", () => {
    const node = rf({
      data: {
        ...baseData(),
        collapsed: true,
        expandedHeightPx: 200,
        expandedWidthPx: 350
      },
      height: NODE_COLLAPSED_STRIP_HEIGHT_PX,
      style: { height: NODE_COLLAPSED_STRIP_HEIGHT_PX }
    });

    const { data, node: patch } = getCollapseTogglePatches(node, false);

    expect(patch.style?.width).toBe(350);
    expect(data.expandedWidthPx).toBeUndefined();
  });

  it("falls back to measured width when no saved expandedWidthPx", () => {
    const node = rf({
      data: {
        ...baseData(),
        collapsed: true,
        expandedHeightPx: 180
      },
      height: NODE_COLLAPSED_STRIP_HEIGHT_PX,
      measured: { width: 260, height: NODE_COLLAPSED_STRIP_HEIGHT_PX },
      style: { height: NODE_COLLAPSED_STRIP_HEIGHT_PX }
    });

    const { data, node: patch } = getCollapseTogglePatches(node, false);

    expect(patch.style?.width).toBe(260);
    expect(data.expandedWidthPx).toBeUndefined();
  });

  it("collapse saves measured width as expandedWidthPx", () => {
    const node = rf({
      height: 200,
      measured: { width: 320, height: 200 },
      style: { width: 320, height: 200 }
    });

    const { data } = getCollapseTogglePatches(node, true);

    expect(data.expandedWidthPx).toBe(320);
  });

  it("collapse clears style.width to undefined", () => {
    const node = rf({
      height: 200,
      measured: { width: 320, height: 200 },
      style: { width: 320, height: 200 }
    });

    const { node: patch } = getCollapseTogglePatches(node, true);

    expect(patch.style?.width).toBeUndefined();
  });

  it("round-trip: collapse then expand preserves original dimensions", () => {
    const originalHeight = 275;
    const originalWidth = 340;

    const expandedNode = rf({
      height: originalHeight,
      measured: { width: originalWidth, height: originalHeight },
      style: { width: originalWidth, height: originalHeight }
    });

    // Step 1: collapse
    const collapsed = getCollapseTogglePatches(expandedNode, true);
    expect(collapsed.data.expandedHeightPx).toBe(originalHeight);
    expect(collapsed.data.expandedWidthPx).toBe(originalWidth);

    // Build a node representing the collapsed state
    const collapsedNode = rf({
      data: {
        ...baseData(),
        collapsed: true,
        expandedHeightPx: collapsed.data.expandedHeightPx,
        expandedWidthPx: collapsed.data.expandedWidthPx
      },
      height: collapsed.node.height,
      style: collapsed.node.style
    });

    // Step 2: expand
    const expanded = getCollapseTogglePatches(collapsedNode, false);
    expect(expanded.data.collapsed).toBe(false);
    expect(expanded.node.height).toBe(originalHeight);
    expect(expanded.node.style?.height).toBe(originalHeight);
    expect(expanded.node.style?.width).toBe(originalWidth);
    expect(expanded.data.expandedHeightPx).toBeUndefined();
    expect(expanded.data.expandedWidthPx).toBeUndefined();
  });
});
