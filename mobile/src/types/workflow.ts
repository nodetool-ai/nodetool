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

export type MsgpackData =
  | JobUpdate
  | Prediction
  | NodeProgress
  | NodeUpdate
  | TaskUpdate
  | PlanningUpdate;
