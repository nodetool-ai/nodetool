import { z } from "zod";
import { PLAN_STATES, TASK_STATES } from "./types";

export const taskStateEnum = z.enum(TASK_STATES);
export const planStateEnum = z.enum(PLAN_STATES);

const idTaskRe = /^T-\d{8}-\d{4}$/;
const idPlanRe = /^P-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

export const createPlanSchema = z.object({
  id: z.string().regex(idPlanRe).optional(),
  title: z.string().min(1).max(200),
  state: planStateEnum.optional().default("draft"),
  owner: z.string().optional(),
  body: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updatePlanSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  state: planStateEnum.optional(),
  owner: z.string().nullable().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const createTaskSchema = z.object({
  id: z.string().regex(idTaskRe).optional(),
  plan: z.string().min(1),
  title: z.string().min(1).max(200),
  assignee: z.string().nullable().optional(),
  body: z.string().optional().default(""),
  estimate: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  dependencies: z.array(z.string()).optional().default([]),
  criteria: z.array(z.string()).optional().default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  assignee: z.string().nullable().optional(),
  body: z.string().optional(),
  estimate: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
});

export const transitionTaskSchema = z.object({
  state: taskStateEnum,
  assignee: z.string().optional(),
  note: z.string().optional(),
});

export const addNoteSchema = z.object({
  body: z.string().min(1),
  author: z.string().min(1),
});

export const addCriterionSchema = z.object({
  text: z.string().min(1).max(500),
});

export const updateCriterionSchema = z.object({
  done: z.boolean().optional(),
  text: z.string().min(1).max(500).optional(),
});
