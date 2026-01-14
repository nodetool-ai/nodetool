import { TypeMetadata } from "./ApiTypes";

export type NodeData = {
  properties: any;
  selectable: boolean | undefined;
  dynamic_properties: any;
  dynamic_outputs?: Record<string, TypeMetadata>;
  sync_mode?: string;
  workflow_id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
  bypassed?: boolean;
  annotation?: string;
  // Original node type from the workflow graph (useful when React Flow falls back to "default" type)
  originalType?: string;
  size?: {
    width: number;
    height: number;
  };
  positionAbsolute?: {
    x: number;
    y: number;
  };
};
