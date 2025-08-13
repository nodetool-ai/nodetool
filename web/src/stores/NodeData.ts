export type NodeData = {
  properties: any;
  selectable: boolean | undefined;
  dynamic_properties: any;
  workflow_id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
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
