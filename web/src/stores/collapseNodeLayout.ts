import type { Node } from "@xyflow/react";
import type { NodeData } from "./NodeData";
import { DEFAULT_NODE_WIDTH } from "./nodeUiDefaults";

/** Keep in sync with `--node-collapsed-height` in `styles/vars.css` */
export const NODE_COLLAPSED_STRIP_HEIGHT_PX = 40;

const MIN_EXPANDED_BODY_PX = 100;

function parseCssPixelHeight(value: string | number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : undefined;
    }
  }
  return undefined;
}

/**
 * Height to remember when collapsing so expand restores the same body size.
 * Prefer `node.height` (React Flow / resize) over `style.height`, which can stay
 * stale after the user resizes. Then `expandedHeightPx`, then measured DOM.
 */
export function readExpandedBodyHeightPx(node: Node<NodeData>): number {
  const strip = NODE_COLLAPSED_STRIP_HEIGHT_PX;

  const styleH = parseCssPixelHeight(node.style?.height);
  const styleOk = styleH != null && styleH > strip;
  const heightNum =
    node.height != null && node.height > strip ? node.height : undefined;
  const fromData =
    node.data.expandedHeightPx != null && node.data.expandedHeightPx > strip
      ? node.data.expandedHeightPx
      : undefined;
  const measuredRaw = node.measured?.height;
  const measuredOk =
    measuredRaw != null && measuredRaw > strip
      ? Math.round(measuredRaw)
      : undefined;

  if (heightNum != null) {
    return heightNum;
  }
  if (styleOk) {
    return styleH;
  }
  if (fromData != null) {
    return fromData;
  }
  if (measuredOk != null) {
    return measuredOk;
  }
  return MIN_EXPANDED_BODY_PX;
}

function readNodeWidthPx(node: Node<NodeData>): number | undefined {
  const mw = node.measured?.width;
  if (mw != null && mw > 0) {
    return mw;
  }
  if (node.width != null && node.width > 0) {
    return node.width;
  }
  const sw = node.style?.width;
  if (typeof sw === "number" && sw > 0) {
    return sw;
  }
  if (typeof sw === "string") {
    const parsed = parseCssPixelHeight(sw);
    if (parsed != null && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

type CollapseTogglePatches = {
  data: Partial<NodeData>;
  node: Partial<Node<NodeData>>;
};

/**
 * React Flow `height` / `style.height` must match the collapsed strip for handle math,
 * while `data.expandedHeightPx` remembers the expanded body for restore + save.
 */
export function getCollapseTogglePatches(
  node: Node<NodeData>,
  nextCollapsed: boolean
): CollapseTogglePatches {
  const strip = NODE_COLLAPSED_STRIP_HEIGHT_PX;
  const w = readNodeWidthPx(node);

  if (nextCollapsed) {
    const expandedH = readExpandedBodyHeightPx(node);
    const expandedWidthPx =
      w ??
      node.measured?.width ??
      node.width ??
      DEFAULT_NODE_WIDTH;
    // A5: when collapsing, drop the width constraint so the strip shrinks
    // to match its header content. React Flow needs *some* width to position
    // handles, so we publish the min-width here and let the DOM measurement
    // pass overwrite it once the rendered header is sized.
    return {
      data: {
        collapsed: true,
        expandedHeightPx: expandedH,
        expandedWidthPx
      },
      node: {
        height: strip,
        // Clearing `measured` forces React Flow to remeasure and pick up the
        // narrower header-content width on the next layout pass.
        measured: undefined,
        style: {
          ...node.style,
          height: strip,
          width: undefined
        }
      }
    };
  }

  // A5: when expanding, restore the width the node had before collapse if we
  // saved it. Otherwise fall back to the current (possibly auto-measured) w.
  const savedWidth =
    node.data.expandedWidthPx != null && node.data.expandedWidthPx > 0
      ? node.data.expandedWidthPx
      : w;
  const widthPatch = savedWidth != null ? { width: savedWidth } : {};

  const saved = node.data.expandedHeightPx;
  if (saved != null && saved > strip) {
    return {
      data: {
        collapsed: false,
        expandedHeightPx: undefined,
        expandedWidthPx: undefined
      },
      node: {
        height: saved,
        measured: undefined,
        style: {
          ...node.style,
          height: saved,
          ...widthPatch
        }
      }
    };
  }

  return {
    data: {
      collapsed: false,
      expandedHeightPx: undefined,
      expandedWidthPx: undefined
    },
    node: {
      height: undefined,
      measured: undefined,
      style: {
        ...node.style,
        height: undefined,
        ...widthPatch
      }
    }
  };
}
