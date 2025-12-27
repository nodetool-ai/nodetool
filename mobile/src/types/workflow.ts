/**
 * Mobile-adapted workflow types
 */

import type {
  RunJobRequest,
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  TaskUpdate,
  PlanningUpdate,
  Prediction,
  Workflow,
  Node,
  Edge,
  Asset,
} from "./ApiTypes";

export type {
  RunJobRequest,
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  TaskUpdate,
  PlanningUpdate,
  Prediction,
  Workflow,
  Node,
  Edge,
  Asset,
};

export interface NodeData {
  [key: string]: any;
}

export interface GraphNode {
  id: string;
  parent_id?: string | null;
  type: string;
  data?: NodeData;
  ui_properties?: unknown;
  dynamic_properties?: {
    [key: string]: unknown;
  };
  dynamic_outputs?: {
    [key: string]: {
      type: string;
      optional: boolean;
      values?: (string | number)[];
      type_args: any[];
      type_name?: string;
    };
  };
  sync_mode: string;
}

export interface GraphEdge {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  ui_properties?: {
    [key: string]: string;
  } | null;
}

export type MsgpackData =
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | TaskUpdate
  | PlanningUpdate;
