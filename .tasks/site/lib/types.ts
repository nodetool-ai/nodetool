export const TASK_STATES = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "cancelled",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const PLAN_STATES = ["draft", "proposed", "accepted", "done", "cancelled"] as const;
export type PlanState = (typeof PLAN_STATES)[number];

export const TASK_BOARD_STATES = ["todo", "in_progress", "review", "blocked", "done"] as const;

export const STATE_LABEL: Record<TaskState | PlanState, string> = {
  todo: "Todo",
  in_progress: "In progress",
  review: "In review",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
  draft: "Draft",
  proposed: "Proposed",
  accepted: "Accepted",
};

export const TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["review", "done", "blocked", "cancelled"],
  review: ["in_progress", "done", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  done: [],
  cancelled: [],
};

export const PLAN_TRANSITIONS: Record<PlanState, PlanState[]> = {
  draft: ["proposed", "accepted", "cancelled"],
  proposed: ["accepted", "cancelled"],
  accepted: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export interface TaskFull {
  id: string;
  title: string;
  state: TaskState;
  planId: string;
  assignee: string | null;
  body: string;
  estimate: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  dependencies: string[];
  notes: Array<{ id: number; author: string; body: string; createdAt: Date }>;
  criteria: Array<{ id: number; text: string; done: boolean; position: number }>;
}

export interface PlanFull {
  id: string;
  title: string;
  state: PlanState;
  owner: string | null;
  body: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanProgress {
  total: number;
  done: number;
  pct: number;
  open: number;
}
