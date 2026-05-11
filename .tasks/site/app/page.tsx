import Link from "next/link";
import * as repo from "@/lib/repo";
import { STATE_LABEL, TASK_BOARD_STATES } from "@/lib/types";
import { KanbanBoard } from "@/components/kanban-board";
import { Progress } from "@/components/ui/progress";
import { StateBadge } from "@/components/state-badge";
import { StateIcon } from "@/components/state-icon";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const tasks = repo.listTasks();
  const plans = repo.listPlans();
  const activePlans = plans.filter((p) => p.state === "accepted");
  const countMap = repo.taskCountsByState();
  const counts = TASK_BOARD_STATES.map((s) => ({ state: s, n: countMap[s] ?? 0 }));
  // Batched single-query progress for every active plan in the list.
  const progressByPlan = repo.planProgressBatch(activePlans.map((p) => p.id));

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {tasks.length} tasks across {plans.length} plans.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {counts.map((c) => (
              <Link
                key={c.state}
                href={`/tasks?state=${c.state}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-2 py-1 text-xs hover:bg-secondary transition-colors"
              >
                <StateIcon state={c.state} />
                <span className="text-foreground">{STATE_LABEL[c.state]}</span>
                <span className="text-muted-foreground tabular-nums">{c.n}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <section>
          <KanbanBoard tasks={tasks} />
        </section>
      )}

      {activePlans.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Active plans</h2>
            <Link href="/plans" className="text-xs text-muted-foreground hover:text-foreground">
              All plans →
            </Link>
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
            {activePlans.map((p) => {
              const { done, total, pct, open } = progressByPlan.get(p.id) ?? {
                done: 0,
                total: 0,
                pct: 0,
                open: 0,
              };
              return (
                <Link
                  key={p.id}
                  href={`/plans/${p.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.title}</span>
                      <StateBadge state={p.state} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground font-mono">{p.id}</div>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-1 w-48">
                    <Progress value={pct} className="w-full" />
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {done} / {total} done · {open} open
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-dashed border-border/60 bg-secondary/20 p-12 text-center">
      <h2 className="text-base font-semibold">No tasks yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Create your first plan and task with the CLI:
      </p>
      <pre className="mt-4 inline-block text-left text-xs bg-muted px-3 py-2 rounded-md font-mono leading-6">
        npm run task new plan --title="Hello world"{"\n"}
        npm run task new task --plan=P-... --title="First task"
      </pre>
    </section>
  );
}
