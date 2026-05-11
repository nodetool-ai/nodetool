// Agent session orchestrator.
//
// Lifecycle:
//   1. Create row in agent_sessions (status: pending)
//   2. Spawn async worker:
//      a. Create git worktree at .tasks/.worktrees/<sessionId> on a fresh branch
//      b. Transition task → in_progress (assignee: claude-agent)
//      c. Run Claude Agent SDK with task as prompt
//      d. Push branch, open PR via `gh`
//      e. Transition task → review (or blocked on failure)
//   3. All SDK messages are mirrored to agent_events and a per-session EventEmitter
//      so SSE subscribers see them live.

import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, desc, asc, inArray } from "drizzle-orm";

import { db } from "@/db";
import { agentEvents, agentSessions } from "@/db/schema";
import * as repo from "./repo";
import {
  isTerminalStatus,
  type AgentEventRow,
  type AgentSessionFull,
  type SessionStatus,
} from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const WORKTREE_ROOT = resolve(REPO_ROOT, ".tasks", ".worktrees");
const DEFAULT_MODEL = process.env.NODETOOL_AGENT_MODEL ?? "claude-sonnet-4-5";

// ──────────────────────────────────────────────────────────
// In-process state (held on globalThis so HMR doesn't drop sessions)
// ──────────────────────────────────────────────────────────

interface RunnerState {
  abort: AbortController;
  bus: EventEmitter;
}

declare global {
  // eslint-disable-next-line no-var
  var __agentRunners: Map<number, RunnerState> | undefined;
}

const runners: Map<number, RunnerState> = globalThis.__agentRunners ?? new Map();
if (!globalThis.__agentRunners) globalThis.__agentRunners = runners;

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export interface StartSessionInput {
  taskId: string;
  model?: string;
  baseBranch?: string;
}

export function startSession(input: StartSessionInput): AgentSessionFull {
  const task = repo.getTask(input.taskId);
  if (!task) throw new repo.RepoError(`Task ${input.taskId} not found`, 404);
  const active = listActiveSessions(input.taskId);
  if (active.length > 0) {
    throw new repo.RepoError(
      `Task ${input.taskId} already has an active session (#${active[0].id})`,
      409
    );
  }

  const inserted = db
    .insert(agentSessions)
    .values({
      taskId: input.taskId,
      status: "pending",
      model: input.model ?? DEFAULT_MODEL,
      startedAt: new Date(),
    })
    .returning()
    .all();
  const session = hydrateSession(inserted[0]);

  // Don't await; background work continues independently.
  void runSession(session.id, input.taskId, session.model ?? DEFAULT_MODEL, input.baseBranch ?? "main");

  return session;
}

export function listSessions(): AgentSessionFull[] {
  return db
    .select()
    .from(agentSessions)
    .orderBy(desc(agentSessions.startedAt))
    .all()
    .map(hydrateSession);
}

export function listActiveSessions(taskId?: string): AgentSessionFull[] {
  const all = listSessions();
  return all.filter(
    (s) => !isTerminalStatus(s.status) && (!taskId || s.taskId === taskId)
  );
}

export function getSession(id: number): AgentSessionFull | null {
  const row = db.select().from(agentSessions).where(eq(agentSessions.id, id)).get();
  return row ? hydrateSession(row) : null;
}

export function getSessionEvents(sessionId: number, sinceId = 0): AgentEventRow[] {
  return db
    .select()
    .from(agentEvents)
    .where(eq(agentEvents.sessionId, sessionId))
    .orderBy(asc(agentEvents.id))
    .all()
    .filter((e) => e.id > sinceId)
    .map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      type: e.type,
      payload: safeJson(e.payload),
      createdAt: e.createdAt,
    }));
}

export function subscribe(sessionId: number, listener: (event: AgentEventRow) => void): () => void {
  const bus = runners.get(sessionId)?.bus;
  if (!bus) return () => {};
  bus.on("event", listener);
  return () => {
    bus.off("event", listener);
  };
}

export function isLive(sessionId: number): boolean {
  return runners.has(sessionId);
}

export function cancelSession(sessionId: number): AgentSessionFull {
  const session = getSession(sessionId);
  if (!session) throw new repo.RepoError(`Session ${sessionId} not found`, 404);
  if (isTerminalStatus(session.status)) return session;
  const runner = runners.get(sessionId);
  runner?.abort.abort();
  updateSession(sessionId, { status: "cancelled", completedAt: new Date() });
  emit(sessionId, "status", { status: "cancelled" });
  closeBus(sessionId);
  return getSession(sessionId)!;
}

// ──────────────────────────────────────────────────────────
// Background worker
// ──────────────────────────────────────────────────────────

async function runSession(sessionId: number, taskId: string, model: string, baseBranch: string) {
  const abort = new AbortController();
  const bus = new EventEmitter();
  runners.set(sessionId, { abort, bus });

  const branch = `claude/agent-${sessionId}`;
  const worktreePath = resolve(WORKTREE_ROOT, String(sessionId));
  let task = repo.getTask(taskId);
  if (!task) {
    fail(sessionId, `Task ${taskId} disappeared before session could start`);
    return;
  }

  try {
    setStatus(sessionId, "preparing");
    await mkdir(WORKTREE_ROOT, { recursive: true });
    await sh(["git", "worktree", "add", "-b", branch, worktreePath, baseBranch], REPO_ROOT, sessionId);
    updateSession(sessionId, { branch, worktreePath });
    emit(sessionId, "worktree", { branch, worktreePath });

    if (task.state === "todo" || task.state === "blocked") {
      try {
        repo.transitionTask(taskId, {
          state: "in_progress",
          assignee: task.assignee ?? "claude-agent",
          note: `Started agent session #${sessionId}.`,
        });
      } catch {
        // Best-effort; non-fatal.
      }
    }

    setStatus(sessionId, "running");
    await runAgent({ sessionId, task, model, worktreePath, abort });

    if (abort.signal.aborted) return;

    setStatus(sessionId, "pushing");
    await sh(["git", "push", "-u", "origin", branch], worktreePath, sessionId);

    setStatus(sessionId, "opening_pr");
    const prUrl = await openPr({ sessionId, task, branch, baseBranch, worktreePath });
    if (prUrl) {
      updateSession(sessionId, { prUrl });
      emit(sessionId, "pr", { url: prUrl });
    }

    try {
      repo.transitionTask(taskId, {
        state: "review",
        note: prUrl ? `Agent finished. PR: ${prUrl}` : `Agent finished. Branch: ${branch}`,
      });
    } catch (err) {
      // Transition might be invalid (e.g. user moved task already). Just note it.
      repo.addNote(taskId, "claude-agent", `Could not transition to review: ${describe(err)}`);
    }

    updateSession(sessionId, { status: "completed", completedAt: new Date() });
    emit(sessionId, "status", { status: "completed" });
  } catch (err) {
    if (abort.signal.aborted) {
      // cancelSession already updated state.
      return;
    }
    fail(sessionId, describe(err));
    try {
      repo.transitionTask(taskId, {
        state: "blocked",
        note: `Agent session #${sessionId} failed: ${describe(err)}`,
      });
    } catch {
      // Ignore; task may already be in a state that doesn't accept blocked.
    }
  } finally {
    closeBus(sessionId);
  }
}

interface RunAgentArgs {
  sessionId: number;
  task: NonNullable<ReturnType<typeof repo.getTask>>;
  model: string;
  worktreePath: string;
  abort: AbortController;
}

async function runAgent({ sessionId, task, model, worktreePath, abort }: RunAgentArgs) {
  const prompt = buildPrompt(task);
  emit(sessionId, "prompt", { prompt });

  // Lazy import — keeps the SDK out of the bundle when unused.
  const { query } = (await import("@anthropic-ai/claude-agent-sdk")) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: (args: { prompt: string; options?: any }) => AsyncIterable<unknown>;
  };

  const env = sanitizeEnv(process.env);

  const stream = query({
    prompt,
    options: {
      cwd: worktreePath,
      permissionMode: "bypassPermissions",
      model,
      env,
      abortController: abort,
      stderr: (data: string) => emit(sessionId, "stderr", { data }),
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
      },
    },
  });

  for await (const message of stream) {
    if (abort.signal.aborted) return;
    emit(sessionId, "agent", message);
  }
}

function buildPrompt(task: NonNullable<ReturnType<typeof repo.getTask>>): string {
  const lines: string[] = [];
  lines.push(`You are an autonomous coding agent working on task ${task.id}.`);
  lines.push("");
  lines.push(`# ${task.title}`);
  if (task.body.trim()) {
    lines.push("");
    lines.push("## Description");
    lines.push(task.body.trim());
  }
  if (task.criteria.length > 0) {
    lines.push("");
    lines.push("## Acceptance criteria");
    for (const c of task.criteria) {
      lines.push(`- [${c.done ? "x" : " "}] ${c.text}`);
    }
  }
  if (task.dependencies.length > 0) {
    lines.push("");
    lines.push("## Depends on (already done)");
    for (const dep of task.dependencies) lines.push(`- ${dep}`);
  }
  lines.push("");
  lines.push("# Working environment");
  lines.push("- You are in an isolated git worktree on a fresh branch.");
  lines.push("- Make all changes here. Commit with a clear message.");
  lines.push("- Do NOT push and do NOT open a PR — the orchestrator does both after you finish.");
  lines.push("- Run typecheck and lint where it applies; fix any errors you introduce.");
  lines.push("- This is a non-interactive run. Make reasonable decisions; do not ask questions.");
  lines.push("- When you are done, stop. Output a brief summary of what you did and any caveats.");
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────
// Side effects: status, events, shell, PR
// ──────────────────────────────────────────────────────────

function setStatus(sessionId: number, status: SessionStatus) {
  updateSession(sessionId, { status });
  emit(sessionId, "status", { status });
}

function fail(sessionId: number, error: string) {
  updateSession(sessionId, { status: "failed", error, completedAt: new Date() });
  emit(sessionId, "status", { status: "failed", error });
}

function updateSession(sessionId: number, patch: Partial<AgentSessionFull>) {
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    values[camelToSnake(k)] = v;
  }
  if (Object.keys(values).length === 0) return;
  db.update(agentSessions).set(values).where(eq(agentSessions.id, sessionId)).run();
}

function emit(sessionId: number, type: string, payload: unknown) {
  const inserted = db
    .insert(agentEvents)
    .values({
      sessionId,
      type,
      payload: safeStringify(payload),
      createdAt: new Date(),
    })
    .returning()
    .all();
  const row = inserted[0];
  const event: AgentEventRow = {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    payload: safeJson(row.payload),
    createdAt: row.createdAt,
  };
  runners.get(sessionId)?.bus.emit("event", event);
}

function closeBus(sessionId: number) {
  const runner = runners.get(sessionId);
  if (!runner) return;
  runner.bus.emit("done");
  runner.bus.removeAllListeners();
  runners.delete(sessionId);
}

function sh(args: string[], cwd: string, sessionId: number): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    emit(sessionId, "shell", { cmd: args.join(" "), cwd });
    const child = spawn(args[0], args.slice(1), { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      emit(sessionId, "shell_out", { stream: "stdout", data: s });
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      emit(sessionId, "shell_out", { stream: "stderr", data: s });
    });
    child.on("error", rejectP);
    child.on("close", (code) => {
      if (code === 0) resolveP(stdout);
      else rejectP(new Error(`${args.join(" ")} exited ${code}\n${stderr || stdout}`));
    });
  });
}

interface OpenPrArgs {
  sessionId: number;
  task: NonNullable<ReturnType<typeof repo.getTask>>;
  branch: string;
  baseBranch: string;
  worktreePath: string;
}

async function openPr({ sessionId, task, branch, baseBranch, worktreePath }: OpenPrArgs): Promise<string | null> {
  const title = `[${task.id}] ${task.title}`;
  const summary = `Closes task **${task.id}**.\n\n${task.body.trim() || "_(no description)_"}`;
  try {
    const out = await sh(
      ["gh", "pr", "create", "--title", title, "--body", summary, "--base", baseBranch, "--head", branch],
      worktreePath,
      sessionId
    );
    const m = out.match(/https?:\/\/\S+/);
    return m ? m[0] : out.trim() || null;
  } catch (err) {
    emit(sessionId, "warning", {
      message: `gh pr create failed: ${describe(err)}. Branch was pushed; open the PR manually.`,
    });
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function hydrateSession(row: typeof agentSessions.$inferSelect): AgentSessionFull {
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status as SessionStatus,
    model: row.model,
    branch: row.branch,
    worktreePath: row.worktreePath,
    prUrl: row.prUrl,
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, replacer);
  } catch {
    return JSON.stringify({ note: "unserializable", typeof: typeof v });
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (typeof value === "bigint") return value.toString();
  return value;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err);
}

function sanitizeEnv(input: NodeJS.ProcessEnv): Record<string, string> {
  // The Claude Agent SDK refuses to run when nested inside another Claude Code
  // session unless these vars are stripped. See CLAUDE.md § "Claude Agent
  // Provider in nested sessions".
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (
      k === "CLAUDECODE" ||
      k.startsWith("CLAUDE_CODE_") ||
      k.startsWith("CLAUDE_SESSION_") ||
      k.startsWith("CLAUDE_ENABLE_") ||
      k.startsWith("CLAUDE_AFTER_") ||
      k.startsWith("CLAUDE_AUTO_")
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}
