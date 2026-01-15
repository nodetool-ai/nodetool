export const NODE_COLORS = [
  { label: "Default", value: "", description: "Use type-based color" },
  { label: "Red", value: "#EF4444", description: "Error, stop, or critical" },
  { label: "Orange", value: "#F97316", description: "Warning or attention needed" },
  { label: "Amber", value: "#F59E0B", description: "Caution or review" },
  { label: "Yellow", value: "#EAB308", description: "Pending or waiting" },
  { label: "Lime", value: "#84CC16", description: "Success or complete" },
  { label: "Green", value: "#22C55E", description: "Approved or validated" },
  { label: "Emerald", value: "#10B981", description: "Confirmed or done" },
  { label: "Teal", value: "#14B8A6", description: "Information gathering" },
  { label: "Cyan", value: "#06B6D4", description: "Data processing" },
  { label: "Sky", value: "#0EA5E9", description: "Input or source" },
  { label: "Blue", value: "#3B82F6", description: "Processing or transformation" },
  { label: "Indigo", value: "#6366F1", description: "AI or ML model" },
  { label: "Violet", value: "#8B5CF6", description: "Generation or creation" },
  { label: "Purple", value: "#A855F7", description: "Output or result" },
  { label: "Fuchsia", value: "#D946EF", description: "Media or visual" },
  { label: "Pink", value: "#EC4899", description: "Audio or voice" },
  { label: "Rose", value: "#F43F5E", description: "Error handling" },
  { label: "Gray", value: "#6B7280", description: "Utility or helper" },
  { label: "Slate", value: "#64748B", description: "Control flow" }
] as const;

export type NodeColorValue = typeof NODE_COLORS[number]["value"];

export const DEFAULT_NODE_COLOR = NODE_COLORS[0].value;

export function getNodeColorLabel(colorValue: string): string {
  if (!colorValue) {
    return NODE_COLORS[0].label;
  }
  const found = NODE_COLORS.find((c) => c.value === colorValue);
  return found?.label || "Custom";
}
