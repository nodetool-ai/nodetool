import chroma from "chroma-js";

// Utility to detect CSS variable references (e.g. "var(--palette-primary-main)")
function isCssVar(color: string): boolean {
  return color.trim().startsWith("var(");
}

export function hexToRgba(hex: string, alpha: number): string {
  // Return transparent if the color is empty or undefined
  if (!hex) {
    return "transparent";
  }

  // If the supplied color is a CSS variable token we cannot compute the RGBA
  // value in JS because the browser resolves it at paint‐time. In this case
  // we return a CSS `rgb()` function that preserves the variable and embeds
  // the requested alpha value using the modern slash syntax: `rgb(var(--foo) / a)`.
  if (isCssVar(hex)) {
    return `rgb(${hex} / ${alpha})`;
  }

  try {
    const rgba = chroma(hex).alpha(alpha).rgba();
    return `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
  } catch (err) {
    // Fallback: if chroma cannot parse the color, just return the original
    // string unchanged to avoid runtime errors.
    console.error("hexToRgba: unable to parse color", hex, err);
    return hex;
  }
}

export function darkenHexColor(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .darken(amount / 100)
    .hex();
}

export function lightenHexColor(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .brighten(amount / 100)
    .hex();
}

export function adjustSaturation(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .set("hsl.s", `*${1 + amount / 100}`)
    .hex();
}

export function adjustHue(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex).set("hsl.h", `+${amount}`).hex();
}

export function adjustLightness(hex: string, amount: number): string {
  if (isCssVar(hex)) {return hex;}

  return chroma(hex)
    .set("hsl.l", `*${1 + amount / 100}`)
    .hex();
}

type GradientDirection =
  | "to top"
  | "to bottom"
  | "to left"
  | "to right"
  | "to top left"
  | "to top right"
  | "to bottom left"
  | "to bottom right";

type GradientMode = "darken" | "lighten" | "saturate";

export function createLinearGradient(
  hexColor: string,
  amount: number,
  direction: GradientDirection = "to bottom",
  mode: GradientMode = "darken"
): string {
  const rgbaColor = hexToRgba(hexColor, 1);
  let modifiedHexColor;

  switch (mode) {
    case "darken":
      modifiedHexColor = darkenHexColor(hexColor, amount);
      break;
    case "lighten":
      modifiedHexColor = lightenHexColor(hexColor, amount);
      break;
    case "saturate":
      modifiedHexColor = adjustSaturation(hexColor, amount);
      break;
    default:
      modifiedHexColor = hexColor;
  }

  const rgbaModifiedColor = hexToRgba(modifiedHexColor, 1);
  return `linear-gradient(${direction}, ${rgbaColor}, ${rgbaModifiedColor})`;
}

export function simulateOpacity(
  hexColor: string,
  alpha: number,
  backgroundColor: string = "#fff"
): string {
  // If either color is provided as a CSS variable token, we cannot blend
  // it numerically. Just return the foreground color unchanged – the browser
  // will resolve the variable at paint‐time.
  if (isCssVar(hexColor) || isCssVar(backgroundColor)) {
    return hexColor;
  }

  const foregroundColor = chroma(hexColor);
  const bgColor = chroma(backgroundColor);

  const blendedColor = chroma.mix(bgColor, foregroundColor, alpha, "rgb");

  return blendedColor.hex();
}

// ---------------------------------------------------------------------
// NODE TYPE COLORS FOR MINIMAP
// ---------------------------------------------------------------------

/**
 * Node categories for color coding in the minimap.
 */
export enum NodeTypeCategory {
  /** Input nodes that accept user data */
  Input = "input",
  /** Constant value nodes */
  Constant = "constant",
  /** Processing/workflow nodes (default) */
  Processing = "processing",
  /** Group nodes */
  Group = "group",
  /** Comment nodes */
  Comment = "comment",
  /** Output/asset nodes */
  Output = "output"
}

/**
 * Determines the category of a node based on its type string.
 */
export function getNodeTypeCategory(nodeType: string | undefined): NodeTypeCategory {
  if (!nodeType) {
    return NodeTypeCategory.Processing;
  }

  if (nodeType.startsWith("nodetool.input.")) {
    return NodeTypeCategory.Input;
  }
  if (nodeType.startsWith("nodetool.constant.")) {
    return NodeTypeCategory.Constant;
  }
  if (nodeType.includes(".Group") || nodeType.includes("group")) {
    return NodeTypeCategory.Group;
  }
  if (nodeType.includes(".Comment") || nodeType.includes("comment")) {
    return NodeTypeCategory.Comment;
  }
  if (nodeType.includes("output") || nodeType.includes("Output")) {
    return NodeTypeCategory.Output;
  }

  return NodeTypeCategory.Processing;
}

/**
 * Gets a color for a node type category in light mode.
 */
export function getNodeCategoryColor(
  category: NodeTypeCategory,
  isDarkMode: boolean
): string {
  const colors: Record<NodeTypeCategory, { light: string; dark: string }> = {
    [NodeTypeCategory.Input]: { light: "#3b82f6", dark: "#60a5fa" }, // Blue
    [NodeTypeCategory.Constant]: { light: "#8b5cf6", dark: "#a78bfa" }, // Purple
    [NodeTypeCategory.Processing]: { light: "#64748b", dark: "#94a3b8" }, // Slate
    [NodeTypeCategory.Group]: { light: "#6366f1", dark: "#818cf8" }, // Indigo
    [NodeTypeCategory.Comment]: { light: "#22c55e", dark: "#4ade80" }, // Green
    [NodeTypeCategory.Output]: { light: "#f59e0b", dark: "#fbbf24" } // Amber
  };

  return isDarkMode ? colors[category].dark : colors[category].light;
}

/**
 * Gets a minimap color function based on node type coloring mode.
 * When useTypeColors is false, all nodes get the same color (selected nodes
 * still use primary color).
 */
export function createMinimapNodeColorFn(
  isDarkMode: boolean,
  useTypeColors: boolean,
  primaryColor: string
): (node: { type?: string; selected?: boolean }) => string {
  return (node) => {
    // Always use primary color for selected nodes
    if (node.selected) {
      return primaryColor;
    }

    if (!useTypeColors) {
      // Original behavior: only special nodes get colors
      if (node.type === "nodetool.workflows.base_node.Group") {
        return isDarkMode ? "#6366f1" : "#818cf8";
      }
      if (node.type === "nodetool.workflows.base_node.Comment") {
        return isDarkMode ? "#22c55e" : "#22c55e";
      }
      return isDarkMode ? "#94a3b8" : "#64748b";
    }

    // Type-based coloring
    const category = getNodeTypeCategory(node.type);
    return getNodeCategoryColor(category, isDarkMode);
  };
}
