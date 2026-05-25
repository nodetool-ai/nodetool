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
};

export const DEFAULT_NODE_WIDTH = 280;

/**
 * Narrow an `unknown` protocol value to NodeUIProperties with a runtime
 * object check. Returns a default-positioned object when the input is
 * not a valid object (null, undefined, primitives, arrays).
 */
export function parseNodeUIProperties(raw: unknown): NodeUIProperties {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as NodeUIProperties;
  }
  return { position: { x: 0, y: 0 } };
}
