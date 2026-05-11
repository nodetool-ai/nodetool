#!/usr/bin/env node
// CLI for the .tasks/ markdown task system.
// See .tasks/SCHEMA.md and .tasks/AGENTS.md.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TASKS_DIR = join(ROOT, ".tasks", "tasks");
const PLANS_DIR = join(ROOT, ".tasks", "plans");

const TASK_STATES = ["todo", "in_progress", "review", "blocked", "done", "cancelled"];
const PLAN_STATES = ["draft", "proposed", "accepted", "done", "cancelled"];

const TASK_TRANSITIONS = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["review", "done", "blocked", "cancelled"],
  review: ["in_progress", "done", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  done: [],
  cancelled: [],
};

const REQUIRED_TASK_FIELDS = ["id", "title", "state", "plan", "created", "updated"];
const REQUIRED_PLAN_FIELDS = ["id", "title", "state", "created"];

const REQUIRED_TASK_SECTIONS = ["# Description", "# Acceptance criteria", "# Notes"];

// ──────────────────────────────────────────────────────────────────
// Tiny YAML parser/serializer (subset sufficient for our schema).
// Supports top-level: scalars, ISO date strings, inline `[a, b]`
// lists, block lists with leading `- `. No nested maps.
// ──────────────────────────────────────────────────────────────────

function parseFrontmatter(text, filename) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${filename}: missing or malformed frontmatter`);
  return { frontmatter: parseYAML(m[1], filename), body: m[2] };
}

function parseYAML(text, filename) {
  const lines = text.split(/\r?\n/);
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) { i++; continue; }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) throw new Error(`${filename}: invalid YAML at line ${i + 1}: ${line}`);
    const key = m[1];
    const rawValue = m[2].trim();
    if (rawValue === "") {
      // May be followed by a block list
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        items.push(parseScalar(lines[j].replace(/^\s+-\s+/, "").trim()));
        j++;
      }
      if (items.length > 0) { out[key] = items; i = j; continue; }
      out[key] = null;
      i++;
      continue;
    }
    out[key] = parseValue(rawValue);
    i++;
  }
  return out;
}

function parseValue(s) {
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => parseScalar(x.trim()));
  }
  return parseScalar(s);
}

function parseScalar(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return s;
}

function serializeFrontmatter(fm) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(v.length === 0 ? `${k}: []` : `${k}: [${v.map(serializeScalar).join(", ")}]`);
    } else if (v === null || v === undefined) {
      lines.push(`${k}: null`);
    } else {
      lines.push(`${k}: ${serializeScalar(v)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function serializeScalar(v) {
  if (typeof v === "string") {
    if (/^[A-Za-z0-9_\-:.+/T]+$/.test(v) && !["true", "false", "null", "~"].includes(v)) return v;
    return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return String(v);
}

// ──────────────────────────────────────────────────────────────────
// Loading
// ──────────────────────────────────────────────────────────────────

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function loadCollection(dir) {
  ensureDir(dir);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const path = join(dir, f);
      const text = readFileSync(path, "utf8");
      const { frontmatter, body } = parseFrontmatter(text, f);
      return { file: f, path, frontmatter, body };
    });
}

function loadAll() {
  return { tasks: loadCollection(TASKS_DIR), plans: loadCollection(PLANS_DIR) };
}

// ──────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────

function validate() {
  const { tasks, plans } = loadAll();
  const errors = [];
  const planIds = new Set(plans.map((p) => p.frontmatter.id));
  const taskIds = new Set(tasks.map((t) => t.frontmatter.id));

  for (const p of plans) {
    const fm = p.frontmatter;
    for (const f of REQUIRED_PLAN_FIELDS) {
      if (fm[f] === undefined || fm[f] === null) errors.push(`${p.file}: missing required field '${f}'`);
    }
    if (fm.state && !PLAN_STATES.includes(fm.state)) {
      errors.push(`${p.file}: invalid state '${fm.state}' (allowed: ${PLAN_STATES.join(", ")})`);
    }
    if (fm.id && !/^P-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(fm.id)) {
      errors.push(`${p.file}: id '${fm.id}' must match P-YYYY-MM-DD-slug`);
    }
  }

  for (const t of tasks) {
    const fm = t.frontmatter;
    for (const f of REQUIRED_TASK_FIELDS) {
      if (fm[f] === undefined || fm[f] === null) errors.push(`${t.file}: missing required field '${f}'`);
    }
    if (fm.state && !TASK_STATES.includes(fm.state)) {
      errors.push(`${t.file}: invalid state '${fm.state}' (allowed: ${TASK_STATES.join(", ")})`);
    }
    if (fm.id && !/^T-\d{8}-\d{4}$/.test(fm.id)) {
      errors.push(`${t.file}: id '${fm.id}' must match T-YYYYMMDD-NNNN`);
    }
    if (fm.plan && !planIds.has(fm.plan)) {
      errors.push(`${t.file}: plan '${fm.plan}' does not exist`);
    }
    if (fm.state && fm.state !== "todo" && fm.state !== "cancelled" && !fm.assignee) {
      errors.push(`${t.file}: state '${fm.state}' requires an assignee`);
    }
    if (Array.isArray(fm.dependencies)) {
      for (const dep of fm.dependencies) {
        if (!taskIds.has(dep)) errors.push(`${t.file}: dependency '${dep}' does not exist`);
      }
    }
    for (const sec of REQUIRED_TASK_SECTIONS) {
      const re = new RegExp(`^${sec}\\b`, "m");
      if (!re.test(t.body)) errors.push(`${t.file}: missing section '${sec}'`);
    }
    if (fm.state === "done") {
      const open = (t.body.match(/^- \[ \]/gm) || []).length;
      if (open > 0) errors.push(`${t.file}: state is 'done' but ${open} acceptance criteria are unchecked`);
    }
  }

  if (errors.length === 0) {
    console.log(`OK: ${plans.length} plans, ${tasks.length} tasks validated.`);
    return 0;
  }
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n${errors.length} error(s) in ${plans.length} plans + ${tasks.length} tasks.`);
  return 1;
}

// ──────────────────────────────────────────────────────────────────
// Listing
// ──────────────────────────────────────────────────────────────────

function list(args) {
  const { tasks } = loadAll();
  let filtered = tasks.map((t) => t.frontmatter);
  if (args.state) filtered = filtered.filter((t) => t.state === args.state);
  if (args.plan) filtered = filtered.filter((t) => t.plan === args.plan);
  filtered.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (args.json) { console.log(JSON.stringify(filtered, null, 2)); return 0; }
  if (filtered.length === 0) { console.log("(no tasks)"); return 0; }
  const w = (s, n) => String(s ?? "").padEnd(n);
  console.log(`${w("ID", 18)} ${w("STATE", 12)} ${w("ASSIGNEE", 12)} TITLE`);
  for (const t of filtered) {
    console.log(`${w(t.id, 18)} ${w(t.state, 12)} ${w(t.assignee || "—", 12)} ${t.title}`);
  }
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// Creation
// ──────────────────────────────────────────────────────────────────

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

function today() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); }

function nextTaskCounter(date) {
  const { tasks } = loadAll();
  const datePart = date.replace(/-/g, "");
  const used = tasks
    .map((t) => t.frontmatter.id)
    .filter((id) => typeof id === "string" && id.startsWith(`T-${datePart}-`))
    .map((id) => parseInt(id.slice(`T-${datePart}-`.length), 10))
    .filter((n) => !isNaN(n));
  return (used.length === 0 ? 0 : Math.max(...used)) + 1;
}

function newPlan(args) {
  if (!args.title) throw new Error("--title is required");
  const date = args.date || today();
  const slug = slugify(args.title);
  const id = args.id || `P-${date}-${slug}`;
  const file = `${date}-${slug}.md`;
  const path = join(PLANS_DIR, file);
  if (existsSync(path)) throw new Error(`Plan already exists: ${file}`);
  const fm = {
    id,
    title: args.title,
    state: "draft",
    owner: args.owner || null,
    created: date,
    updated: date,
    tags: args.tags ? args.tags.split(",").map((s) => s.trim()) : [],
  };
  const body = `# Goal\n\n_Describe the outcome._\n\n# Approach\n\n_How we'll get there._\n\n# Out of scope\n\n_What this plan deliberately does not cover._\n`;
  ensureDir(PLANS_DIR);
  writeFileSync(path, `${serializeFrontmatter(fm)}\n${body}`);
  console.log(`Created plan ${id} at ${path}`);
  return 0;
}

function newTask(args) {
  if (!args.title) throw new Error("--title is required");
  if (!args.plan) throw new Error("--plan is required");
  const { plans } = loadAll();
  if (!plans.some((p) => p.frontmatter.id === args.plan)) {
    throw new Error(`Plan does not exist: ${args.plan}`);
  }
  const date = args.date || today();
  const counter = nextTaskCounter(date);
  const slug = slugify(args.title);
  const id = args.id || `T-${date.replace(/-/g, "")}-${String(counter).padStart(4, "0")}`;
  const file = `${id}-${slug}.md`;
  const path = join(TASKS_DIR, file);
  if (existsSync(path)) throw new Error(`Task already exists: ${file}`);
  const fm = {
    id,
    title: args.title,
    state: "todo",
    plan: args.plan,
    assignee: args.assignee || null,
    dependencies: args.dependencies ? args.dependencies.split(",").map((s) => s.trim()) : [],
    created: nowIso(),
    updated: nowIso(),
    estimate: args.estimate || null,
    tags: args.tags ? args.tags.split(",").map((s) => s.trim()) : [],
  };
  const body = `# Description\n\n_What needs to happen._\n\n# Acceptance criteria\n\n- [ ] _Concrete, testable criterion_\n\n# Notes\n\n## ${date} — ${args.assignee || "you"}\n\nCreated.\n`;
  ensureDir(TASKS_DIR);
  writeFileSync(path, `${serializeFrontmatter(fm)}\n${body}`);
  console.log(`Created task ${id} at ${path}`);
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// Transition
// ──────────────────────────────────────────────────────────────────

function transition(args) {
  const [id, newState] = args._;
  if (!id || !newState) throw new Error("Usage: tasks transition <id> <new-state>");
  if (!TASK_STATES.includes(newState)) throw new Error(`Invalid state: ${newState}`);
  const { tasks } = loadAll();
  const task = tasks.find((t) => t.frontmatter.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  const fm = task.frontmatter;
  const prevState = fm.state;
  const allowed = TASK_TRANSITIONS[prevState] || [];
  if (newState !== prevState && !allowed.includes(newState)) {
    throw new Error(`Cannot transition '${prevState}' → '${newState}'. Allowed: ${allowed.join(", ") || "(none — terminal)"}`);
  }
  if (newState === "in_progress") {
    const assignee = args.assignee || fm.assignee;
    if (!assignee) throw new Error("Going to in_progress requires --assignee");
    fm.assignee = assignee;
  } else if (args.assignee) {
    fm.assignee = args.assignee;
  }
  fm.state = newState;
  fm.updated = nowIso();
  let body = task.body;
  if (args.note || newState !== prevState) {
    const date = today();
    const handle = fm.assignee || "you";
    const note = args.note || `→ ${newState}`;
    body = body.replace(/\n*$/, "");
    body += `\n\n## ${date} — ${handle}\n\n${note}\n`;
  }
  writeFileSync(task.path, `${serializeFrontmatter(fm)}\n${body}`);
  console.log(`${id}: ${prevState} → ${newState}`);
  return 0;
}

// ──────────────────────────────────────────────────────────────────
// CLI plumbing
// ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
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

function help() {
  console.log(`Usage: npm run task -- <command> [args]

Commands:
  list                       List tasks. --state=X --plan=X --json
  new plan --title=...       Create a new plan. --owner=X --tags=a,b --date=YYYY-MM-DD
  new task --plan=P-... --title=...
                             Create a new task. --assignee=X --dependencies=T-...,T-...
                             --estimate=2h --tags=a,b --date=YYYY-MM-DD
  transition <id> <state>    Move a task to a new state. --assignee=X --note="..."
  validate                   Lint all plans and tasks.

States:
  Tasks: ${TASK_STATES.join(", ")}
  Plans: ${PLAN_STATES.join(", ")}

See .tasks/SCHEMA.md and .tasks/AGENTS.md.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._.shift();
  try {
    switch (cmd) {
      case "list": return process.exit(list(args));
      case "validate": return process.exit(validate());
      case "transition": return process.exit(transition(args));
      case "new": {
        const sub = args._.shift();
        if (sub === "plan") return process.exit(newPlan(args));
        if (sub === "task") return process.exit(newTask(args));
        throw new Error("Usage: tasks new <plan|task> ...");
      }
      case "help": case undefined: help(); return process.exit(0);
      default: throw new Error(`Unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error(`tasks: ${err.message}`);
    process.exit(1);
  }
}

main();
