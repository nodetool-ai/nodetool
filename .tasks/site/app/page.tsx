import Link from "next/link";
import {
  getAllPlans,
  getAllTasks,
  getTasksByPlan,
  planProgress,
  STATE_LABEL,
  TASK_BOARD_STATES,
} from "@/lib/tasks";
import { KanbanBoard } from "@/components/kanban-board";
import { Progress } from "@/components/ui/progress";
import { StateBadge } from "@/components/state-badge";
import { StateIcon } from "@/components/state-icon";

export default function DashboardPage() {
  const tasks = getAllTasks();
  const activePlans = getAllPlans().filter((p) => p.state === "accepted");
  const counts = TASK_BOARD_STATES.map((s) => ({
    state: s,
    n: tasks.filter((t) => t.state === s).length,
  }));

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {tasks.length} tasks across {getAllPlans().length} plans.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {counts.map((c) => (
              <div
                key={c.state}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-2 py-1 text-xs"
              >
                <StateIcon state={c.state} />
                <span className="text-foreground">{STATE_LABEL[c.state]}</span>
                <span className="text-muted-foreground tabular-nums">{c.n}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <KanbanBoard tasks={tasks} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Active plans</h2>
          <Link href="/plans/" className="text-xs text-muted-foreground hover:text-foreground">
            All plans →
          </Link>
        </div>
        {activePlans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accepted plans.</p>
        ) : (
          <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
            {activePlans.map((p) => {
              const { done, total, pct } = planProgress(p.id);
              const open = getTasksByPlan(p.id).filter(
                (t) => t.state !== "done" && t.state !== "cancelled"
              ).length;
              return (
                <Link
                  key={p.id}
                  href={`/plans/${p.slug}/`}
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
                      {done} / {total} done &middot; {open} open
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
