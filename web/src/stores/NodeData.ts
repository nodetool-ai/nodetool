export type NodeData = {
  properties: any;
  workflow_id: string;
  collapsed?: boolean;
  dirty?: boolean;
  size?: {
    width: number;
    height: number;
  };
};
