import Link from "next/link";
import { X } from "lucide-react";
import * as repo from "@/lib/repo";
import { STATE_LABEL, TASK_STATES, type TaskState } from "@/lib/types";
import { TaskRow } from "@/components/task-row";
import { StateIcon } from "@/components/state-icon";

export const dynamic = "force-dynamic";

interface SearchParams {
  state?: string;
  plan?: string;
  assignee?: string;
}

export default async function TasksIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filterState = TASK_STATES.includes(sp.state as TaskState) ? (sp.state as TaskState) : undefined;
  const filterPlan = sp.plan;
  const filterAssignee = sp.assignee;
  const hasFilter = Boolean(filterState || filterPlan || filterAssignee);

  const tasks = repo.listTasks({
    state: filterState,
    planId: filterPlan,
    assignee: filterAssignee,
  });
  const plans = repo.listPlans();
  const planTitles = new Map(plans.map((p) => [p.id, p.title]));

  const groupOrder: readonly TaskState[] = filterState ? [filterState] : TASK_STATES;
  const grouped = groupOrder
    .map((state) => ({ state, tasks: tasks.filter((t) => t.state === state) }))
    .filter((g) => g.tasks.length > 0);

  const sansParam = (drop: keyof SearchParams) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === drop || !v) continue;
      next.set(k, String(v));
    }
    const qs = next.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">{tasks.length} total · grouped by state.</p>
        </div>
        {hasFilter && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Filters</span>
            {filterState && (
              <FilterChip label={`State: ${STATE_LABEL[filterState]}`} clearTo={sansParam("state")} />
            )}
            {filterPlan && (
              <FilterChip
                label={`Plan: ${planTitles.get(filterPlan) ?? filterPlan}`}
                clearTo={sansParam("plan")}
              />
            )}
            {filterAssignee && (
              <FilterChip label={`Assignee: @${filterAssignee}`} clearTo={sansParam("assignee")} />
            )}
            <Link href="/tasks" className="ml-1 text-[11px] text-muted-foreground hover:text-foreground">
              clear all
            </Link>
          </div>
        )}
      </header>

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching tasks.</p>
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

function FilterChip({ label, clearTo }: { label: string; clearTo: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 pl-2 pr-1 py-0.5 text-xs">
      {label}
      <Link href={clearTo} aria-label="Clear" className="text-muted-foreground hover:text-foreground">
        <X className="size-3" />
      </Link>
    </span>
  );
}
