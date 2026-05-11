// Seeds the DB with a demo plan + a few tasks so first-run isn't empty.
// Safe to re-run — skips if seed plan already exists.
import * as repo from "../lib/repo";

const SEED_PLAN_ID = "P-2026-05-11-task-system";

function main() {
  if (repo.getPlan(SEED_PLAN_ID)) {
    console.log(`Seed plan ${SEED_PLAN_ID} already exists — skipping.`);
    return;
  }
  console.log("Seeding demo data…");
  const plan = repo.createPlan({
    id: SEED_PLAN_ID,
    title: "Markdown Task System for NodeTool",
    state: "accepted",
    owner: "claude",
    tags: ["tooling", "agents", "meta"],
    body:
      "# Goal\n\nGive humans and AI agents a shared way to plan and execute NodeTool development. " +
      "Plans and tasks live in a SQLite database maintained by the server, with a Linear-style web UI and a CLI.\n\n" +
      "# Approach\n\n- Drizzle ORM + better-sqlite3 in the Next.js app\n- API routes for all CRUD + state transitions\n- CLI imports the same repo functions — no separate codepath\n- Web UI: server-rendered, with inline interaction for acceptance criteria\n",
  });
  console.log(`  + ${plan.id}`);

  const tasks = [
    {
      title: "SQLite + Drizzle schema (plans, tasks, notes, criteria, deps)",
      state: "done" as const,
      criteria: [
        "Five tables with FKs and cascades",
        "Initial SQL migration applied on first boot",
        "JSON tags column (parsed on hydration)",
      ],
      tags: ["db", "schema"],
    },
    {
      title: "Repo layer with state-transition enforcement",
      state: "done" as const,
      criteria: [
        "createPlan / createTask / updateTask",
        "transitionTask rejects invalid moves",
        "Acceptance criteria gate the done transition",
      ],
      tags: ["backend"],
    },
    {
      title: "REST API under app/api/{plans,tasks}",
      state: "done" as const,
      criteria: [
        "GET/POST collections, PATCH/DELETE items",
        "Zod-validated request bodies",
        "Errors map RepoError.status correctly",
      ],
      tags: ["backend", "api"],
    },
    {
      title: "Linear-style UI (Kanban + detail pages)",
      state: "done" as const,
      criteria: [
        "Dashboard groups tasks by state",
        "Task detail shows criteria, notes, deps",
        "Criteria checkbox calls API and refreshes",
      ],
      tags: ["frontend"],
    },
    {
      title: "CLI shares the repo layer (no HTTP needed)",
      state: "in_progress" as const,
      assignee: "claude",
      tags: ["cli", "dx"],
      criteria: [
        "list / show / new / transition / note / crit",
        "Same DB the server writes to",
        "Documented in AGENTS.md",
      ],
    },
  ];

  let i = 1;
  const ids: string[] = [];
  for (const t of tasks) {
    const task = repo.createTask({
      id: `T-20260511-${String(i).padStart(4, "0")}`,
      planId: plan.id,
      title: t.title,
      assignee: t.assignee ?? null,
      tags: t.tags,
      criteria: t.criteria,
    });
    ids.push(task.id);
    console.log(`  + ${task.id}  ${task.title}`);
    if (t.state === "done") {
      // Tick all criteria, then move through review → done.
      const full = repo.getTask(task.id)!;
      for (const c of full.criteria) repo.updateCriterion(c.id, { done: true });
      repo.transitionTask(task.id, { state: "in_progress", assignee: "claude" });
      repo.transitionTask(task.id, { state: "review" });
      repo.transitionTask(task.id, { state: "done" });
    } else if (t.state === "in_progress") {
      repo.transitionTask(task.id, { state: "in_progress", assignee: t.assignee });
    }
    i++;
  }

  console.log("Done.");
}

main();
