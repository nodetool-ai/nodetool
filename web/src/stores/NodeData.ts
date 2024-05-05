import { Descendant } from "slate";

export type NodeData = {
  properties: any;
  workflow_id: string;
  collapsed?: boolean;
  dirty?: boolean;
  comment?: Descendant[];
  size?: {
    width: number;
    height: number;
  };
};
