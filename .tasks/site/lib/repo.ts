import { and, asc, count, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  acceptanceCriteria,
  plans,
  taskDependencies,
  taskNotes,
  tasks,
  type Plan as PlanRow,
  type Task as TaskRow,
} from "@/db/schema";
import {
  TASK_TRANSITIONS,
  PLAN_TRANSITIONS,
  type PlanFull,
  type PlanProgress,
  type PlanState,
  type TaskFull,
  type TaskState,
} from "./types";

// ──────────────────────────────────────────────────────────
// IDs & slugs
// ──────────────────────────────────────────────────────────

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function planIdFromTitle(title: string, date: string): string {
  return `P-${date}-${slugify(title)}`;
}

function nextTaskId(date: string): string {
  const datePart = date.replace(/-/g, "");
  const prefix = `T-${datePart}-`;
  const rows = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(like(tasks.id, `${prefix}%`))
    .all();
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.id.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// ──────────────────────────────────────────────────────────
// Hydration helpers
// ──────────────────────────────────────────────────────────

function hydratePlan(row: PlanRow): PlanFull {
  return {
    id: row.id,
    title: row.title,
    state: row.state as PlanState,
    owner: row.owner,
    body: row.body,
    tags: safeJsonArray(row.tags),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hydrateTask(row: TaskRow, deps: string[], notes: TaskFull["notes"], criteria: TaskFull["criteria"]): TaskFull {
  return {
    id: row.id,
    title: row.title,
    state: row.state as TaskState,
    planId: row.planId,
    assignee: row.assignee,
    body: row.body,
    estimate: row.estimate,
    tags: safeJsonArray(row.tags),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    dependencies: deps,
    notes,
    criteria,
  };
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Plan queries
// ──────────────────────────────────────────────────────────

export function listPlans(): PlanFull[] {
  return db.select().from(plans).orderBy(asc(plans.id)).all().map(hydratePlan);
}

export function getPlan(id: string): PlanFull | null {
  const row = db.select().from(plans).where(eq(plans.id, id)).get();
  return row ? hydratePlan(row) : null;
}

export function planProgress(planId: string): PlanProgress {
  const all = db
    .select({ state: tasks.state })
    .from(tasks)
    .where(eq(tasks.planId, planId))
    .all();
  const active = all.filter((t) => t.state !== "cancelled");
  const total = active.length;
  const done = active.filter((t) => t.state === "done").length;
  const open = active.filter((t) => t.state !== "done").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct, open };
}

// Batched planProgress for N plans in a single GROUP BY query. Returns
// a Map keyed by plan id; plans with no tasks are still present with
// zeroed counts so callers can index unconditionally.
export function planProgressBatch(planIds: string[]): Map<string, PlanProgress> {
  const out = new Map<string, PlanProgress>();
  for (const id of planIds) out.set(id, { total: 0, done: 0, pct: 0, open: 0 });
  if (planIds.length === 0) return out;
  const rows = db
    .select({ planId: tasks.planId, state: tasks.state, n: count() })
    .from(tasks)
    .where(inArray(tasks.planId, planIds))
    .groupBy(tasks.planId, tasks.state)
    .all();
  // First pass: accumulate totals and done.
  for (const r of rows) {
    if (r.state === "cancelled") continue;
    const p = out.get(r.planId)!;
    p.total += Number(r.n);
    if (r.state === "done") p.done += Number(r.n);
  }
  for (const p of out.values()) {
    p.open = p.total - p.done;
    p.pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
  }
  return out;
}

// ──────────────────────────────────────────────────────────
// Task queries
// ──────────────────────────────────────────────────────────

export interface TaskFilters {
  state?: TaskState;
  planId?: string;
  assignee?: string;
}

export function listTasks(filters: TaskFilters = {}): TaskFull[] {
  const wheres = [];
  if (filters.state) wheres.push(eq(tasks.state, filters.state));
  if (filters.planId) wheres.push(eq(tasks.planId, filters.planId));
  if (filters.assignee) wheres.push(eq(tasks.assignee, filters.assignee));
  const where = wheres.length ? and(...wheres) : undefined;
  const rows = where
    ? db.select().from(tasks).where(where).orderBy(asc(tasks.id)).all()
    : db.select().from(tasks).orderBy(asc(tasks.id)).all();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const depRows = db
    .select()
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, ids))
    .all();
  const noteRows = db
    .select()
    .from(taskNotes)
    .where(inArray(taskNotes.taskId, ids))
    .orderBy(asc(taskNotes.createdAt))
    .all();
  const critRows = db
    .select()
    .from(acceptanceCriteria)
    .where(inArray(acceptanceCriteria.taskId, ids))
    .orderBy(asc(acceptanceCriteria.position))
    .all();
  const depsByTask = groupBy(depRows, (r) => r.taskId);
  const notesByTask = groupBy(noteRows, (r) => r.taskId);
  const critsByTask = groupBy(critRows, (r) => r.taskId);
  return rows.map((r) =>
    hydrateTask(
      r,
      (depsByTask.get(r.id) ?? []).map((d) => d.dependsOnId),
      (notesByTask.get(r.id) ?? []).map((n) => ({
        id: n.id,
        author: n.author,
        body: n.body,
        createdAt: n.createdAt,
      })),
      (critsByTask.get(r.id) ?? []).map((c) => ({
        id: c.id,
        text: c.text,
        done: c.done,
        position: c.position,
      }))
    )
  );
}

export function getTask(id: string): TaskFull | null {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) return null;
  const deps = db
    .select({ dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, id))
    .all()
    .map((r) => r.dependsOnId);
  const notes = db
    .select()
    .from(taskNotes)
    .where(eq(taskNotes.taskId, id))
    .orderBy(asc(taskNotes.createdAt))
    .all()
    .map((n) => ({ id: n.id, author: n.author, body: n.body, createdAt: n.createdAt }));
  const criteria = db
    .select()
    .from(acceptanceCriteria)
    .where(eq(acceptanceCriteria.taskId, id))
    .orderBy(asc(acceptanceCriteria.position))
    .all()
    .map((c) => ({ id: c.id, text: c.text, done: c.done, position: c.position }));
  return hydrateTask(row, deps, notes, criteria);
}

export function taskCountsByState(): Record<TaskState, number> {
  const rows = db
    .select({ state: tasks.state, n: count() })
    .from(tasks)
    .groupBy(tasks.state)
    .all();
  const out: Record<TaskState, number> = {
    todo: 0,
    in_progress: 0,
    review: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
  };
  for (const r of rows) out[r.state as TaskState] = Number(r.n);
  return out;
}

// ──────────────────────────────────────────────────────────
// Mutations: plans
// ──────────────────────────────────────────────────────────

export interface CreatePlanInput {
  id?: string;
  title: string;
  state?: PlanState;
  owner?: string;
  body?: string;
  tags?: string[];
  date?: string;
}

export function createPlan(input: CreatePlanInput): PlanFull {
  const date = input.date ?? today();
  const id = input.id ?? planIdFromTitle(input.title, date);
  if (db.select().from(plans).where(eq(plans.id, id)).get()) {
    throw new RepoError(`Plan ${id} already exists`, 409);
  }
  const now = new Date();
  db.insert(plans)
    .values({
      id,
      title: input.title,
      state: input.state ?? "draft",
      owner: input.owner ?? null,
      body: input.body ?? "",
      tags: JSON.stringify(input.tags ?? []),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getPlan(id)!;
}

export function updatePlan(
  id: string,
  patch: Partial<Pick<PlanFull, "title" | "state" | "owner" | "body" | "tags">>
): PlanFull {
  const existing = getPlan(id);
  if (!existing) throw new RepoError(`Plan ${id} not found`, 404);
  if (patch.state && patch.state !== existing.state) {
    const allowed = PLAN_TRANSITIONS[existing.state];
    if (!allowed.includes(patch.state)) {
      throw new RepoError(
        `Cannot transition plan ${existing.state} → ${patch.state}`,
        400
      );
    }
  }
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.state !== undefined) values.state = patch.state;
  if (patch.owner !== undefined) values.owner = patch.owner;
  if (patch.body !== undefined) values.body = patch.body;
  if (patch.tags !== undefined) values.tags = JSON.stringify(patch.tags);
  db.update(plans).set(values).where(eq(plans.id, id)).run();
  return getPlan(id)!;
}

export function deletePlan(id: string) {
  db.delete(plans).where(eq(plans.id, id)).run();
}

// ──────────────────────────────────────────────────────────
// Mutations: tasks
// ──────────────────────────────────────────────────────────

export interface CreateTaskInput {
  id?: string;
  planId: string;
  title: string;
  assignee?: string | null;
  body?: string;
  estimate?: string | null;
  tags?: string[];
  dependencies?: string[];
  criteria?: string[];
  date?: string;
}

export function createTask(input: CreateTaskInput): TaskFull {
  if (!getPlan(input.planId)) {
    throw new RepoError(`Plan ${input.planId} not found`, 404);
  }
  const date = input.date ?? today();
  const id = input.id ?? nextTaskId(date);
  if (db.select().from(tasks).where(eq(tasks.id, id)).get()) {
    throw new RepoError(`Task ${id} already exists`, 409);
  }
  const deps = input.dependencies ?? [];
  if (deps.length > 0) {
    const existing = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.id, deps))
      .all();
    const found = new Set(existing.map((r) => r.id));
    const missing = deps.filter((d) => !found.has(d));
    if (missing.length > 0) {
      throw new RepoError(`Dependencies not found: ${missing.join(", ")}`, 400);
    }
  }
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(tasks)
      .values({
        id,
        title: input.title,
        state: "todo",
        planId: input.planId,
        assignee: input.assignee ?? null,
        body: input.body ?? "",
        estimate: input.estimate ?? null,
        tags: JSON.stringify(input.tags ?? []),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (deps.length > 0) {
      tx.insert(taskDependencies)
        .values(deps.map((d) => ({ taskId: id, dependsOnId: d })))
        .run();
    }
    if (input.criteria?.length) {
      tx.insert(acceptanceCriteria)
        .values(
          input.criteria.map((text, i) => ({
            taskId: id,
            text,
            done: false,
            position: i,
          }))
        )
        .run();
    }
  });
  return getTask(id)!;
}

export function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    assignee: string | null;
    body: string;
    estimate: string | null;
    tags: string[];
    dependencies: string[];
  }>
): TaskFull {
  const existing = getTask(id);
  if (!existing) throw new RepoError(`Task ${id} not found`, 404);
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.assignee !== undefined) values.assignee = patch.assignee;
  if (patch.body !== undefined) values.body = patch.body;
  if (patch.estimate !== undefined) values.estimate = patch.estimate;
  if (patch.tags !== undefined) values.tags = JSON.stringify(patch.tags);
  db.transaction((tx) => {
    tx.update(tasks).set(values).where(eq(tasks.id, id)).run();
    if (patch.dependencies !== undefined) {
      tx.delete(taskDependencies).where(eq(taskDependencies.taskId, id)).run();
      if (patch.dependencies.length > 0) {
        tx.insert(taskDependencies)
          .values(patch.dependencies.map((d) => ({ taskId: id, dependsOnId: d })))
          .run();
      }
    }
  });
  return getTask(id)!;
}

export interface TransitionInput {
  state: TaskState;
  assignee?: string;
  note?: string;
}

export function transitionTask(id: string, input: TransitionInput): TaskFull {
  const existing = getTask(id);
  if (!existing) throw new RepoError(`Task ${id} not found`, 404);
  const prev = existing.state;
  if (input.state !== prev) {
    const allowed = TASK_TRANSITIONS[prev];
    if (!allowed.includes(input.state)) {
      throw new RepoError(
        `Cannot transition ${prev} → ${input.state}. Allowed: ${allowed.join(", ") || "(terminal)"}`,
        400
      );
    }
  }
  let assignee = input.assignee ?? existing.assignee ?? undefined;
  if (input.state === "in_progress" && !assignee) {
    throw new RepoError("Going to in_progress requires an assignee", 400);
  }
  if (input.state === "done") {
    const openCriteria = existing.criteria.filter((c) => !c.done).length;
    if (openCriteria > 0) {
      throw new RepoError(
        `Cannot mark done: ${openCriteria} acceptance criteria still open`,
        400
      );
    }
  }
  const now = new Date();
  db.transaction((tx) => {
    tx.update(tasks)
      .set({ state: input.state, assignee: assignee ?? null, updatedAt: now })
      .where(eq(tasks.id, id))
      .run();
    if (input.note || input.state !== prev) {
      const body = input.note ?? `→ ${input.state}`;
      tx.insert(taskNotes)
        .values({ taskId: id, author: assignee ?? "system", body, createdAt: now })
        .run();
    }
  });
  return getTask(id)!;
}

export function deleteTask(id: string) {
  db.delete(tasks).where(eq(tasks.id, id)).run();
}

// ──────────────────────────────────────────────────────────
// Notes
// ──────────────────────────────────────────────────────────

export function addNote(taskId: string, author: string, body: string) {
  if (!getTask(taskId)) throw new RepoError(`Task ${taskId} not found`, 404);
  db.insert(taskNotes)
    .values({ taskId, author, body, createdAt: new Date() })
    .run();
  db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId)).run();
}

// ──────────────────────────────────────────────────────────
// Acceptance criteria
// ──────────────────────────────────────────────────────────

export function addCriterion(taskId: string, text: string) {
  if (!getTask(taskId)) throw new RepoError(`Task ${taskId} not found`, 404);
  const lastPos = db
    .select({ p: sql<number>`COALESCE(MAX(${acceptanceCriteria.position}), -1)` })
    .from(acceptanceCriteria)
    .where(eq(acceptanceCriteria.taskId, taskId))
    .get();
  const pos = (lastPos?.p ?? -1) + 1;
  db.insert(acceptanceCriteria)
    .values({ taskId, text, done: false, position: pos })
    .run();
  db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId)).run();
}

export function updateCriterion(criterionId: number, patch: { done?: boolean; text?: string }) {
  const row = db
    .select()
    .from(acceptanceCriteria)
    .where(eq(acceptanceCriteria.id, criterionId))
    .get();
  if (!row) throw new RepoError(`Criterion ${criterionId} not found`, 404);
  const values: Record<string, unknown> = {};
  if (patch.done !== undefined) values.done = patch.done;
  if (patch.text !== undefined) values.text = patch.text;
  db.update(acceptanceCriteria).set(values).where(eq(acceptanceCriteria.id, criterionId)).run();
  db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, row.taskId)).run();
}

export function deleteCriterion(criterionId: number) {
  const row = db
    .select()
    .from(acceptanceCriteria)
    .where(eq(acceptanceCriteria.id, criterionId))
    .get();
  if (!row) return;
  db.delete(acceptanceCriteria).where(eq(acceptanceCriteria.id, criterionId)).run();
  db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, row.taskId)).run();
}

// ──────────────────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────────────────

export class RepoError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = "RepoError";
  }
}

// ──────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = m.get(k);
    if (list) list.push(item);
    else m.set(k, [item]);
  }
  return m;
}
