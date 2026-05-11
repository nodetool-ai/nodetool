import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";

function resolveDotTasksRoot(): string {
  const fromCwd = join(process.cwd(), "..");
  if (existsSync(join(fromCwd, "tasks"))) {
    return fromCwd;
  }
  /** Dev / workers where `cwd` is not `.tasks/site` — avoid empty `generateStaticParams`. */
  const fromSource = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  if (existsSync(join(fromSource, "tasks"))) {
    return fromSource;
  }
  return fromCwd;
}

const ROOT = resolveDotTasksRoot();

export type TaskState = "todo" | "in_progress" | "review" | "blocked" | "done" | "cancelled";
export type PlanState = "draft" | "proposed" | "accepted" | "done" | "cancelled";

export const TASK_STATES: TaskState[] = [
  "todo",
  "in_progress",
  "review",
  "blocked",
  "done",
  "cancelled",
];

export const TASK_BOARD_STATES: TaskState[] = ["todo", "in_progress", "review", "blocked", "done"];

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

export interface Task {
  id: string;
  slug: string;
  title: string;
  state: TaskState;
  plan: string;
  assignee?: string;
  dependencies: string[];
  created: string;
  updated: string;
  estimate?: string;
  tags: string[];
  body: string;
  bodyHtml: string;
}

export interface Plan {
  id: string;
  slug: string;
  title: string;
  state: PlanState;
  owner?: string;
  created: string;
  updated?: string;
  tags: string[];
  body: string;
  bodyHtml: string;
}

const PLANS_DIR = join(ROOT, "plans");
const TASKS_DIR = join(ROOT, "tasks");

marked.setOptions({ gfm: true, breaks: false });

function readMarkdownDir(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const { data, content } = matter(text);
      const slug = file.replace(/\.md$/, "");
      const bodyHtml = marked.parse(content, { async: false }) as string;
      return { data, content, bodyHtml, slug };
    });
}

let cachedTasks: Task[] | null = null;
let cachedPlans: Plan[] | null = null;

export function getAllTasks(): Task[] {
  if (cachedTasks) return cachedTasks;
  const tasks = readMarkdownDir(TASKS_DIR).map(({ data, content, bodyHtml, slug }) => ({
    id: data.id,
    slug,
    title: data.title,
    state: data.state as TaskState,
    plan: data.plan,
    assignee: data.assignee || undefined,
    dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
    created: String(data.created ?? ""),
    updated: String(data.updated ?? ""),
    estimate: data.estimate || undefined,
    tags: Array.isArray(data.tags) ? data.tags : [],
    body: content,
    bodyHtml,
  }));
  tasks.sort((a, b) => a.id.localeCompare(b.id));
  cachedTasks = tasks;
  return tasks;
}

export function getAllPlans(): Plan[] {
  if (cachedPlans) return cachedPlans;
  const plans = readMarkdownDir(PLANS_DIR).map(({ data, content, bodyHtml, slug }) => ({
    id: data.id,
    slug,
    title: data.title,
    state: data.state as PlanState,
    owner: data.owner || undefined,
    created: String(data.created ?? ""),
    updated: data.updated ? String(data.updated) : undefined,
    tags: Array.isArray(data.tags) ? data.tags : [],
    body: content,
    bodyHtml,
  }));
  plans.sort((a, b) => a.id.localeCompare(b.id));
  cachedPlans = plans;
  return plans;
}

export function getTaskBySlug(slug: string): Task | undefined {
  return getAllTasks().find((t) => t.slug === slug);
}

export function getPlanBySlug(slug: string): Plan | undefined {
  return getAllPlans().find((p) => p.slug === slug);
}

export function getTasksByPlan(planId: string): Task[] {
  return getAllTasks().filter((t) => t.plan === planId);
}

export function planProgress(planId: string): { total: number; done: number; pct: number } {
  const tasks = getTasksByPlan(planId).filter((t) => t.state !== "cancelled");
  const total = tasks.length;
  const done = tasks.filter((t) => t.state === "done").length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

export function tasksByState(): Record<TaskState, Task[]> {
  const acc = {} as Record<TaskState, Task[]>;
  for (const s of TASK_STATES) acc[s] = [];
  for (const t of getAllTasks()) acc[t.state]?.push(t);
  return acc;
}
