export type GizmoMode = "translate" | "rotate" | "scale";

/** The tool label key for a gizmo mode: three.js calls Move "translate". */
export const GIZMO_TOOL_KEYS = {
  translate: "move",
  rotate: "rotate",
  scale: "scale"
} as const satisfies Record<GizmoMode, string>;
