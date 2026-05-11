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
import { and, eq, desc, asc, inArray, notInArray } from "drizzle-orm";

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
const KEEP_WORKTREES = !!process.env.NODETOOL_TASKS_KEEP_WORKTREES;

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
  // eslint-disable-next-line no-var
  var __agentReaperRan: boolean | undefined;
}

const runners: Map<number, RunnerState> = globalThis.__agentRunners ?? new Map();
if (!globalThis.__agentRunners) globalThis.__agentRunners = runners;

// On module load, mark any non-terminal sessions left behind by a previous
// process as failed. Removes their worktrees too.
if (!globalThis.__agentReaperRan) {
  globalThis.__agentReaperRan = true;
  try {
    reapOrphans();
  } catch (err) {
    console.error("agent: reaper failed:", err);
  }
}

function reapOrphans() {
  const orphans = db
    .select()
    .from(agentSessions)
    .where(notInArray(agentSessions.status, ["completed", "failed", "cancelled"]))
    .all();
  for (const orphan of orphans) {
    if (runners.has(orphan.id)) continue;
    const now = new Date();
    db.update(agentSessions)
      .set({
        status: "failed",
        error: orphan.error ?? "Orphaned by server restart",
        completedAt: now,
      })
      .where(eq(agentSessions.id, orphan.id))
      .run();
    db.insert(agentEvents)
      .values({
        sessionId: orphan.id,
        type: "status",
        payload: JSON.stringify({ status: "failed", error: "Orphaned by server restart" }),
        createdAt: now,
      })
      .run();
    if (orphan.worktreePath) {
      cleanupWorktree(orphan.worktreePath).catch(() => {});
    }
  }
}

// ──────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────

export interface StartSessionInput {
  taskId: string;
  model?: string;
  baseBranch?: string;
  resumeOf?: number;
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

  let sdkSessionId: string | null = null;
  if (input.resumeOf) {
    const prior = getSession(input.resumeOf);
    if (!prior) throw new repo.RepoError(`Prior session #${input.resumeOf} not found`, 404);
    if (prior.taskId !== input.taskId) {
      throw new repo.RepoError(`Session #${input.resumeOf} belongs to a different task`, 400);
    }
    if (!prior.sdkSessionId) {
      throw new repo.RepoError(
        `Session #${input.resumeOf} has no SDK session id — nothing to resume`,
        400
      );
    }
    sdkSessionId = prior.sdkSessionId;
  }

  const inserted = db
    .insert(agentSessions)
    .values({
      taskId: input.taskId,
      status: "pending",
      model: input.model ?? DEFAULT_MODEL,
      resumeOf: input.resumeOf ?? null,
      startedAt: new Date(),
    })
    .returning()
    .all();
  const session = hydrateSession(inserted[0]);

  void runSession(
    session.id,
    input.taskId,
    session.model ?? DEFAULT_MODEL,
    input.baseBranch ?? "main",
    sdkSessionId ?? undefined
  );

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

export function getSessionEvents(
  sessionId: number,
  sinceId = 0,
  limit?: number
): AgentEventRow[] {
  const all = db
    .select()
    .from(agentEvents)
    .where(eq(agentEvents.sessionId, sessionId))
    .orderBy(asc(agentEvents.id))
    .all()
    .filter((e) => e.id > sinceId);
  const slice = limit && all.length > limit ? all.slice(all.length - limit) : all;
  return slice.map((e) => ({
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
  if (session.worktreePath) cleanupWorktree(session.worktreePath).catch(() => {});
  return getSession(sessionId)!;
}

// ──────────────────────────────────────────────────────────
// Background worker
// ──────────────────────────────────────────────────────────

async function runSession(
  sessionId: number,
  taskId: string,
  model: string,
  baseBranch: string,
  resumeSdkSessionId?: string
) {
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
    if (resumeSdkSessionId) emit(sessionId, "resume", { sdkSessionId: resumeSdkSessionId });

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
    const { summary } = await runAgent({
      sessionId,
      task,
      model,
      worktreePath,
      abort,
      resumeSdkSessionId,
    });

    if (abort.signal.aborted) return;

    setStatus(sessionId, "pushing");
    await sh(["git", "push", "-u", "origin", branch], worktreePath, sessionId);

    setStatus(sessionId, "opening_pr");
    const prUrl = await openPr({ sessionId, task, branch, baseBranch, worktreePath, summary });
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
    if (worktreePath) cleanupWorktree(worktreePath).catch(() => {});
  }
}

interface RunAgentArgs {
  sessionId: number;
  task: NonNullable<ReturnType<typeof repo.getTask>>;
  model: string;
  worktreePath: string;
  abort: AbortController;
  resumeSdkSessionId?: string;
}

interface AgentRunResult {
  summary: string | null;
}

async function runAgent({
  sessionId,
  task,
  model,
  worktreePath,
  abort,
  resumeSdkSessionId,
}: RunAgentArgs): Promise<AgentRunResult> {
  const prompt = buildPrompt(task);
  emit(sessionId, "prompt", { prompt });

  // Lazy import — keeps the SDK out of the bundle when unused.
  const sdk = (await import("@anthropic-ai/claude-agent-sdk")) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: (args: { prompt: string; options?: any }) => AsyncIterable<unknown>;
  };
  // Lazy import the MCP server too — it pulls in zod via the SDK.
  const { createTaskMcpServer } = await import("./agent-mcp");

  const env = sanitizeEnv(process.env);
  const mcpServer = createTaskMcpServer(task.id, "claude-agent");

  const stream = sdk.query({
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
      mcpServers: { nodetool_tasks: mcpServer },
      resume: resumeSdkSessionId,
    },
  });

  let summary: string | null = null;
  let lastAssistantText: string | null = null;

  for await (const message of stream) {
    if (abort.signal.aborted) return { summary };
    emit(sessionId, "agent", message);

    const m = message as {
      type?: string;
      subtype?: string;
      session_id?: string;
      message?: { content?: Array<{ type?: string; text?: string }> };
      result?: string;
      is_error?: boolean;
      total_cost_usd?: number;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    // Persist the SDK session id from the system init message so future
    // sessions can resume from it.
    if (m.type === "system" && m.subtype === "init" && m.session_id) {
      updateSession(sessionId, { sdkSessionId: m.session_id });
    }

    if (m.type === "assistant" && m.message?.content) {
      const text = m.message.content
        .filter((b) => b?.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n")
        .trim();
      if (text) lastAssistantText = text;
    }

    if (m.type === "result") {
      if (!m.is_error && typeof m.result === "string") summary = m.result.trim() || null;
      // Record cost + tokens regardless of success.
      updateSession(sessionId, {
        totalCostUsd: m.total_cost_usd ?? null,
        inputTokens: m.usage?.input_tokens ?? null,
        outputTokens: m.usage?.output_tokens ?? null,
      });
    }
  }

  return { summary: summary ?? lastAssistantText };
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
  lines.push("");
  lines.push("# Task-system MCP tools");
  lines.push("- mcp__nodetool_tasks__add_note(body): log a decision so the next person can see why.");
  lines.push("- mcp__nodetool_tasks__check_criterion(criterion): mark an acceptance criterion done.");
  lines.push("- mcp__nodetool_tasks__uncheck_criterion(criterion): undo if you check the wrong one.");
  lines.push("- mcp__nodetool_tasks__add_criterion(text): add a criterion you discovered along the way.");
  lines.push("- mcp__nodetool_tasks__list_criteria(): see the current state of criteria.");
  lines.push("Use these as you work — don't batch them until the end. Match criteria by substring.");
  lines.push("");
  lines.push("# Finishing");
  lines.push("- Commit, then stop. Do NOT push, do NOT open the PR — the orchestrator does both.");
  lines.push("- Your final assistant message becomes the PR description. Write a clean summary:");
  lines.push("  - 1-3 sentences explaining what you did and why");
  lines.push("  - bullet list of the main files / behaviours that changed if non-trivial");
  lines.push("  - call out any caveats, follow-ups, or skipped acceptance criteria");
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
  summary: string | null;
}

async function openPr({
  sessionId,
  task,
  branch,
  baseBranch,
  worktreePath,
  summary,
}: OpenPrArgs): Promise<string | null> {
  const title = `[${task.id}] ${task.title}`;
  const body = buildPrBody(task, summary);
  try {
    const out = await sh(
      ["gh", "pr", "create", "--title", title, "--body", body, "--base", baseBranch, "--head", branch],
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

function buildPrBody(
  task: NonNullable<ReturnType<typeof repo.getTask>>,
  summary: string | null
): string {
  const sections: string[] = [];
  if (summary) sections.push(summary);
  else if (task.body.trim()) sections.push(task.body.trim());
  sections.push(`---`);
  sections.push(`Closes task **${task.id}**: ${task.title}.`);
  if (task.criteria.length > 0) {
    sections.push(
      `\n### Acceptance criteria\n` +
        task.criteria.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`).join("\n")
    );
  }
  return sections.join("\n\n");
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
    totalCostUsd: row.totalCostUsd,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    sdkSessionId: row.sdkSessionId,
    resumeOf: row.resumeOf,
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

function cleanupWorktree(path: string): Promise<void> {
  if (KEEP_WORKTREES) return Promise.resolve();
  if (!path || !existsSync(path)) return Promise.resolve();
  return new Promise((resolveP) => {
    const child = spawn("git", ["worktree", "remove", "--force", path], { cwd: REPO_ROOT });
    child.on("close", () => resolveP());
    child.on("error", () => resolveP());
  });
}
