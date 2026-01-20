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
};

export const DEFAULT_NODE_WIDTH = 280;
