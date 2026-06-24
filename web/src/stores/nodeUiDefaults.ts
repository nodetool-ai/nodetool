import { XYPosition } from "@xyflow/react";

export type NodeUIProperties = {
  selected?: boolean;
  selectable?: boolean;
  position: XYPosition;
  width?: number;
  height?: number;
  zIndex?: number;
  title?: string;
  color?: string;
  /** Header-only collapsed strip — persisted across save/load */
  collapsed?: boolean;
  bypassed?: boolean;
  /** Persisted resolved IDs for dynamic nodes so schema loaders can skip re-fetch on reload */
  model_id?: string;
  endpoint_id?: string;
  /** Persisted id of the generation chosen to feed downstream (asset id for media). */
  selected_generation?: string;
  /** Ordered ids of generations chosen to feed downstream as a list. <=1 -> single-selection behavior. */
  selected_generations?: string[];
};

export const DEFAULT_NODE_WIDTH = 280;

/**
 * Narrow an `unknown` protocol value to NodeUIProperties with a runtime
 * object check. Returns a default-positioned object when the input is
 * not a valid object (null, undefined, primitives, arrays).
 */
function isNodeUIPropertiesLike(value: unknown): value is NodeUIProperties {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseNodeUIProperties(raw: unknown): NodeUIProperties {
  if (isNodeUIPropertiesLike(raw)) {
    return raw;
  }
  return { position: { x: 0, y: 0 } };
}
