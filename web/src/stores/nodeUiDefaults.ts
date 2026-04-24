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
  bypassed?: boolean;
  /** Persisted resolved IDs for dynamic nodes so schema loaders can skip re-fetch on reload */
  model_id?: string;
  endpoint_id?: string;
};

export const DEFAULT_NODE_WIDTH = 280;
