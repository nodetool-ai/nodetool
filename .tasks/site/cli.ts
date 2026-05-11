#!/usr/bin/env node
// CLI for the SQLite-backed tasks system.
// Imports repo functions directly — no HTTP server needed.

import * as repo from "./lib/repo";
import * as agent from "./lib/agent";
import { TASK_STATES, isTerminalStatus, type TaskState } from "./lib/types";
import { assistantText, toolUses, type SdkMessageEnvelope } from "./lib/sdk-message";

type Args = { _: string[]; [k: string]: unknown };

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq === -1) args[a.slice(2)] = true;
      else args[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      args._.push(a);
    }
  }
  return args;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asArray(v: unknown): string[] | undefined {
  if (typeof v !== "string") return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

// ──────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────

function cmdList(args: Args) {
  const filters: Parameters<typeof repo.listTasks>[0] = {};
  const state = asString(args.state);
  if (state) filters.state = state as TaskState;
  const plan = asString(args.plan);
  if (plan) filters.planId = plan;
  const assignee = asString(args.assignee);
  if (assignee) filters.assignee = assignee;
  const tasks = repo.listTasks(filters);
  if (args.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return 0;
  }
  if (tasks.length === 0) {
    console.log("(no tasks)");
    return 0;
  }
  console.log(`${pad("ID", 18)} ${pad("STATE", 14)} ${pad("ASSIGNEE", 12)} TITLE`);
  for (const t of tasks) {
    console.log(
      `${pad(t.id, 18)} ${pad(t.state, 14)} ${pad(t.assignee ?? "—", 12)} ${t.title}`
    );
  }
  return 0;
}

function cmdPlans(args: Args) {
  const plans = repo.listPlans();
  if (args.json) {
    console.log(JSON.stringify(plans, null, 2));
    return 0;
  }
  if (plans.length === 0) {
    console.log("(no plans)");
    return 0;
  }
  for (const p of plans) {
    const prog = repo.planProgress(p.id);
    console.log(`${pad(p.id, 36)} ${pad(p.state, 10)} ${prog.done}/${prog.total}  ${p.title}`);
  }
  return 0;
}

function cmdShow(args: Args) {
  const id = args._.shift();
  if (!id) throw new Error("Usage: show <id>");
  if (id.startsWith("P-")) {
    const plan = repo.getPlan(id);
    if (!plan) throw new Error(`Plan not found: ${id}`);
    const tasks = repo.listTasks({ planId: id });
    if (args.json) {
      console.log(JSON.stringify({ plan, tasks, progress: repo.planProgress(id) }, null, 2));
      return 0;
    }
    const prog = repo.planProgress(id);
    console.log(`${plan.id}  [${plan.state}]  ${plan.title}`);
    if (plan.owner) console.log(`  owner: @${plan.owner}`);
    if (plan.body) console.log(`\n${plan.body}\n`);
    console.log(`  progress: ${prog.done}/${prog.total} done (${prog.pct}%)`);
    if (tasks.length) {
      console.log("\nTasks:");
      for (const t of tasks) {
        console.log(`  ${pad(t.id, 18)} ${pad(t.state, 14)} ${t.title}`);
      }
    }
    return 0;
  }
  const task = repo.getTask(id);
  if (!task) throw new Error(`Task not found: ${id}`);
  if (args.json) {
    console.log(JSON.stringify(task, null, 2));
    return 0;
  }
  console.log(`${task.id}  [${task.state}]  ${task.title}`);
  console.log(`  plan: ${task.planId}`);
  if (task.assignee) console.log(`  assignee: @${task.assignee}`);
  if (task.tags.length) console.log(`  tags: ${task.tags.join(", ")}`);
  if (task.dependencies.length) console.log(`  deps: ${task.dependencies.join(", ")}`);
  if (task.body) console.log(`\n${task.body}`);
  if (task.criteria.length) {
    console.log("\nAcceptance criteria:");
    for (const c of task.criteria) {
      console.log(`  [${c.done ? "x" : " "}] (${c.id}) ${c.text}`);
    }
  }
  if (task.notes.length) {
    console.log("\nNotes:");
    for (const n of task.notes) {
      console.log(`  @${n.author} ${n.createdAt.toISOString()}`);
      console.log(`    ${n.body.replace(/\n/g, "\n    ")}`);
    }
  }
  return 0;
}

function cmdNewPlan(args: Args) {
  const title = asString(args.title);
  if (!title) throw new Error("--title is required");
  const plan = repo.createPlan({
    title,
    id: asString(args.id),
    owner: asString(args.owner),
    body: asString(args.body) ?? "",
    tags: asArray(args.tags) ?? [],
    date: asString(args.date),
  });
  console.log(`Created plan ${plan.id}`);
  return 0;
}

function cmdNewTask(args: Args) {
  const title = asString(args.title);
  const plan = asString(args.plan);
  if (!title) throw new Error("--title is required");
  if (!plan) throw new Error("--plan is required");
  const task = repo.createTask({
    planId: plan,
    title,
    id: asString(args.id),
    assignee: asString(args.assignee) ?? null,
    body: asString(args.body) ?? "",
    estimate: asString(args.estimate) ?? null,
    tags: asArray(args.tags) ?? [],
    dependencies: asArray(args.dependencies) ?? [],
    criteria: asArray(args.criteria) ?? [],
    date: asString(args.date),
  });
  console.log(`Created task ${task.id}`);
  return 0;
}

function cmdTransition(args: Args) {
  const id = args._.shift();
  const state = args._.shift();
  if (!id || !state) throw new Error("Usage: transition <id> <state>");
  if (!TASK_STATES.includes(state as TaskState)) throw new Error(`Invalid state: ${state}`);
  const before = repo.getTask(id);
  if (!before) throw new Error(`Task not found: ${id}`);
  const after = repo.transitionTask(id, {
    state: state as TaskState,
    assignee: asString(args.assignee),
    note: asString(args.note),
  });
  console.log(`${id}: ${before.state} → ${after.state}`);
  return 0;
}

function cmdNote(args: Args) {
  const id = args._.shift();
  const body = asString(args.body);
  if (!id || !body) throw new Error("Usage: note <task-id> --body=... [--author=...]");
  const author = asString(args.author) ?? process.env.USER ?? "you";
  repo.addNote(id, author, body);
  console.log(`Added note to ${id}`);
  return 0;
}

function cmdCrit(args: Args) {
  const sub = args._.shift();
  if (sub === "add") {
    const id = args._.shift();
    const text = asString(args.text) ?? args._.join(" ");
    if (!id || !text) throw new Error('Usage: crit add <task-id> --text="..."');
    repo.addCriterion(id, text);
    console.log(`Added criterion to ${id}`);
    return 0;
  }
  if (sub === "done" || sub === "undone") {
    const cid = args._.shift();
    if (!cid) throw new Error(`Usage: crit ${sub} <criterion-id>`);
    repo.updateCriterion(parseInt(cid, 10), { done: sub === "done" });
    console.log(`Criterion ${cid}: done=${sub === "done"}`);
    return 0;
  }
  if (sub === "rm") {
    const cid = args._.shift();
    if (!cid) throw new Error("Usage: crit rm <criterion-id>");
    repo.deleteCriterion(parseInt(cid, 10));
    console.log(`Removed criterion ${cid}`);
    return 0;
  }
  throw new Error("Usage: crit <add|done|undone|rm>");
}

function cmdPlanTransition(args: Args) {
  const id = args._.shift();
  const state = args._.shift();
  if (!id || !state) throw new Error("Usage: plan-state <plan-id> <state>");
  const before = repo.getPlan(id);
  if (!before) throw new Error(`Plan not found: ${id}`);
  const after = repo.updatePlan(id, {
    state: state as Parameters<typeof repo.updatePlan>[1]["state"],
  });
  console.log(`${id}: ${before.state} → ${after.state}`);
  return 0;
}

async function cmdAgent(args: Args) {
  const sub = args._[0];
  if (sub === "list") {
    args._.shift();
    const sessions = agent.listSessions();
    if (args.json) {
      console.log(JSON.stringify(sessions, null, 2));
      return 0;
    }
    if (sessions.length === 0) {
      console.log("(no sessions)");
      return 0;
    }
    for (const s of sessions) {
      const cost = s.totalCostUsd !== null ? `$${s.totalCostUsd.toFixed(4)}` : "";
      console.log(
        `#${pad(String(s.id), 4)} ${pad(s.status, 12)} ${pad(s.taskId, 18)} ${pad(s.branch ?? "—", 28)} ${pad(cost, 10)} ${s.prUrl ?? ""}`
      );
    }
    return 0;
  }
  if (sub === "cancel") {
    args._.shift();
    const sid = args._.shift();
    if (!sid) throw new Error("Usage: agent cancel <session-id>");
    const session = agent.cancelSession(parseInt(sid, 10));
    console.log(`#${session.id}: ${session.status}`);
    return 0;
  }
  if (sub === "resume") {
    args._.shift();
    const sid = args._.shift();
    if (!sid) throw new Error("Usage: agent resume <session-id> [--model=...] [--no-follow]");
    const prior = agent.getSession(parseInt(sid, 10));
    if (!prior) throw new Error(`Session #${sid} not found`);
    const session = agent.startSession({
      taskId: prior.taskId,
      model: asString(args.model) ?? prior.model ?? undefined,
      resumeOf: prior.id,
    });
    console.log(`Resumed as session #${session.id} (from #${prior.id})`);
    if (args["no-follow"]) return 0;
    await tailSession(session.id);
    return 0;
  }

  // Default: agent <task-id> [--model=...] [--no-follow]
  const taskId = args._.shift();
  if (!taskId) throw new Error("Usage: agent <task-id> [--model=...] [--no-follow]");
  const session = agent.startSession({
    taskId,
    model: asString(args.model),
  });
  console.log(`Started session #${session.id} for ${taskId}`);
  if (args["no-follow"]) return 0;
  await tailSession(session.id);
  return 0;
}

// Tail a session through to a terminal status. Single code path:
// if the session is already terminal at attach time, drain stored events
// and return immediately. Otherwise subscribe and wait for the bus to
// emit a terminal status event.
async function tailSession(sessionId: number) {
  const current = agent.getSession(sessionId);
  if (current && isTerminalStatus(current.status)) {
    for (const e of agent.getSessionEvents(sessionId)) printAgentEvent(e);
    return;
  }
  await new Promise<void>((resolveP) => {
    const off = agent.subscribe(sessionId, (event) => {
      printAgentEvent(event);
      if (event.type === "status") {
        const s = (event.payload as { status?: string })?.status;
        if (s && ["completed", "failed", "cancelled"].includes(s)) {
          off();
          resolveP();
        }
      }
    });
  });
}

function printAgentEvent(event: { type: string; payload: unknown; createdAt: Date }) {
  const ts = event.createdAt.toISOString().slice(11, 19);
  const p = event.payload as Record<string, unknown> | undefined;
  switch (event.type) {
    case "status":
      console.log(`[${ts}] ▸ ${String(p?.status)}${p?.error ? ` — ${p.error}` : ""}`);
      break;
    case "shell":
      console.log(`[${ts}] $ ${String(p?.cmd)}`);
      break;
    case "shell_out": {
      const s = String(p?.data ?? "").trimEnd();
      if (s) console.log(s.split("\n").map((l) => `         ${l}`).join("\n"));
      break;
    }
    case "agent": {
      const m = p as SdkMessageEnvelope;
      if (m?.type === "assistant") {
        const text = assistantText(m.message?.content);
        if (text) console.log(`[${ts}] ◆ ${text}`);
        for (const t of toolUses(m.message?.content)) {
          console.log(`[${ts}]   • tool: ${t.name}`);
        }
      } else if (m?.type === "result") {
        console.log(`[${ts}] ✓ result`);
      }
      break;
    }
    case "pr":
      console.log(`[${ts}] PR: ${String(p?.url)}`);
      break;
    case "warning":
      console.warn(`[${ts}] ! ${String(p?.message)}`);
      break;
  }
}

function help() {
  console.log(`Usage: npm run task -- <command> [args]

Commands:
  list                              List tasks. --state=X --plan=X --assignee=X --json
  plans                             List plans. --json
  show <id>                         Show task or plan detail. --json

  new plan --title="..."            Create plan. --owner=X --tags=a,b --body=... --date=YYYY-MM-DD
  new task --plan=P-... --title=... Create task. --assignee=X --tags=a,b --dependencies=T-...,T-...
                                    --criteria="text1,text2" --estimate=2h --body=... --date=...

  transition <T-...> <state>        Move task. --assignee=X --note="..."
  plan-state <P-...> <state>        Move plan.
  note <T-...> --body="..." [--author=...]
                                    Append a note to a task.
  crit add <T-...> --text="..."     Add an acceptance criterion.
  crit done <criterion-id>          Mark criterion done.
  crit undone <criterion-id>        Mark criterion undone.
  crit rm <criterion-id>            Remove criterion.

  agent <T-...> [--model=...]       Start an agent session for a task and tail
                                    events. Use --no-follow to detach.
  agent list [--json]               List all agent sessions.
  agent cancel <session-id>         Cancel an active session.
  agent resume <session-id>         Resume a prior (terminal) session; pass
                                    --model=... to change models on resume.

States:
  Tasks: ${TASK_STATES.join(", ")}

DB: .tasks/data.db (override with NODETOOL_TASKS_DB env var).
`);
}

// ──────────────────────────────────────────────────────────
// Entry
// ──────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._.shift();
  try {
    let code = 0;
    switch (cmd) {
      case "list":
        code = cmdList(args);
        break;
      case "plans":
        code = cmdPlans(args);
        break;
      case "show":
        code = cmdShow(args);
        break;
      case "new": {
        const sub = args._.shift();
        if (sub === "plan") code = cmdNewPlan(args);
        else if (sub === "task") code = cmdNewTask(args);
        else throw new Error("Usage: new <plan|task> ...");
        break;
      }
      case "transition":
        code = cmdTransition(args);
        break;
      case "plan-state":
        code = cmdPlanTransition(args);
        break;
      case "note":
        code = cmdNote(args);
        break;
      case "crit":
        code = cmdCrit(args);
        break;
      case "agent":
        code = await cmdAgent(args);
        break;
      case "help":
      case undefined:
        help();
        break;
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }
    process.exit(code);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`tasks: ${message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("tasks:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
