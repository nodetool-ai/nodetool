export const NODE_COLOR_LABELS = {
  NONE: {
    label: "Default",
    value: undefined,
    description: "Use default node color"
  },
  RED: {
    label: "Red",
    value: "#EF4444",
    description: "Mark as important or urgent"
  },
  ORANGE: {
    label: "Orange",
    value: "#F97316",
    description: "Mark as warning or attention needed"
  },
  YELLOW: {
    label: "Yellow",
    value: "#EAB308",
    description: "Mark as pending or review"
  },
  GREEN: {
    label: "Green",
    value: "#22C55E",
    description: "Mark as completed or verified"
  },
  BLUE: {
    label: "Blue",
    value: "#3B82F6",
    description: "Mark as informational"
  },
  PURPLE: {
    label: "Purple",
    value: "#A855F7",
    description: "Mark as special or custom"
  },
  PINK: {
    label: "Pink",
    value: "#EC4899",
    description: "Mark as experimental"
  },
  GRAY: {
    label: "Gray",
    value: "#6B7280",
    description: "Mark as deprecated or low priority"
  }
} as const;

export type NodeColorLabel = keyof typeof NODE_COLOR_LABELS;

export const NODE_COLOR_OPTIONS = Object.entries(NODE_COLOR_LABELS).map(([key, config]) => ({
  key,
  ...config
}));

export const DEFAULT_NODE_COLOR = NODE_COLOR_LABELS.NONE.value;

export function getNodeColorLabel(color: string | undefined): NodeColorLabel {
  if (!color) {
    return "NONE";
  }
  for (const [key, config] of Object.entries(NODE_COLOR_LABELS)) {
    if (config.value === color) {
      return key as NodeColorLabel;
    }
  }
  return "NONE";
}
