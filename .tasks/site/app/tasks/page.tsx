import * as repo from "@/lib/repo";
import { STATE_LABEL, TASK_STATES } from "@/lib/types";
import { TaskRow } from "@/components/task-row";
import { StateIcon } from "@/components/state-icon";

export const dynamic = "force-dynamic";

export default async function TasksIndexPage() {
  const tasks = repo.listTasks();
  const plans = repo.listPlans();
  const planTitles = new Map(plans.map((p) => [p.id, p.title]));

  const grouped = TASK_STATES.map((state) => ({
    state,
    tasks: tasks.filter((t) => t.state === state),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          {tasks.length} total · grouped by state.
        </p>
      </header>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        grouped.map((group) => (
          <section key={group.state} className="space-y-1.5">
            <div className="flex items-center gap-2 px-3">
              <StateIcon state={group.state} />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {STATE_LABEL[group.state]}
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">{group.tasks.length}</span>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/30 divide-y divide-border/60 overflow-hidden">
              {group.tasks.map((t) => (
                <div key={t.id} className="px-3">
                  <TaskRow task={t} />
                  <div className="-mt-2 ml-9 pb-2 text-[11px] text-muted-foreground">
                    {planTitles.get(t.planId) ?? t.planId}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
