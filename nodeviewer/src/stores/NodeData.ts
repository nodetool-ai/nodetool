export type NodeData = {
  properties: any;
  selectable: boolean | undefined;
  dynamic_properties: any;
  workflow_id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
  size?: {
    width: number;
    height: number;
  };
  positionAbsolute?: {
    x: number;
    y: number;
  };
};
