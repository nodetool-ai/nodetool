// Exact visual tokens lifted from the live NodeTool ReactFlow node UI
// (verified against getComputedStyle on a running editor). These reproduce the
// node chrome 1:1 for static, non-interactive marketing demos. Do not "tidy"
// the values, they are matched to the real renderer.

export const NODE = {
  bg: "#1B1D21", // c_node_bg
  // 1px border is the node bg at 84% alpha (reads as a faint edge on the canvas)
  border: "rgba(27, 29, 33, 0.84)",
  radius: 8, // --rounded-node
  padding: 8, // --node-body-padding
  minHeight: 150, // MIN_NODE_HEIGHT
  // subtle top highlight baked into the body background
  gradient:
    "linear-gradient(180deg, rgba(255,255,255,0.024) 0%, rgba(255,255,255,0.008) 18%, rgba(0,0,0,0) 52%)",
  // ::after overlay (a touch stronger highlight, drawn over the body)
  overlay:
    "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 16%, transparent 42%)",
  shadow:
    "0 8px 20px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.03)",
  shadowSelected:
    "0 0 0 1px rgba(255,255,255,0.28), 0 10px 28px rgba(0,0,0,0.34), 0 2px 10px rgba(0,0,0,0.18)",
  font: "Inter, sans-serif",
  textPrimary: "#F7F8F8",
  textSecondary: "#8A8F98",
} as const;

export const HANDLE = {
  width: 6,
  height: 12,
  overhang: 14, // left/right: -14px relative to the property row
  shadow: "0 1px 2px rgba(0,0,0,0.25)",
} as const;

export const CONTROL_HANDLE = {
  width: 14,
  height: 8,
  bg: "#f59e0b", // amber-500
  border: "#d97706", // amber-600
} as const;

export const CANVAS = {
  bg: "#08090A", // c_editor_bg_color
  grid: "#1F2126", // c_editor_grid_color
  gridSize: 16,
} as const;

// SpectraNode data-type palette → handle colors (data_types.ts)
export const TYPE_COLORS: Record<string, string> = {
  string: "#FFA808", // textual
  text: "#FFA808",
  str: "#FFA808",
  int: "#18E0F8", // scalar
  integer: "#18E0F8",
  float: "#18E0F8",
  number: "#18E0F8",
  bool: "#0DD49A", // boolean
  image: "#E838FF", // texture
  video: "#9460FF",
  audio: "#08B8FF",
  model: "#3888FF", // reference
  file: "#3888FF",
  list: "#FFD612", // collection
  dict: "#FFD612",
  tensor: "#5B5EFF",
  any: "#6880A0",
  event: "#FF3060",
  task: "#FF3060",
};

export type DataType = keyof typeof TYPE_COLORS;

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? type; // allow passing a raw hex too
}
