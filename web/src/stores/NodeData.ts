export type NodeData = {
  properties: any;
  selectable: boolean | undefined;
  workflow_id: string;
  collapsed?: boolean;
  dirty?: boolean;
  size?: {
    width: number;
    height: number;
  };
};
