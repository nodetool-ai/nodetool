import { STATE_LABEL, TASK_BOARD_STATES, type TaskFull, type TaskState } from "@/lib/types";
import { StateIcon } from "./state-icon";
import { TaskCard } from "./task-card";

export function KanbanBoard({ tasks }: { tasks: TaskFull[] }) {
  const byState = groupBy(tasks);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {TASK_BOARD_STATES.map((state) => (
        <Column key={state} state={state} tasks={byState[state] ?? []} />
      ))}
    </div>
  );
}

function Column({ state, tasks }: { state: TaskState; tasks: TaskFull[] }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 min-h-[200px]">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60">
        <StateIcon state={state} />
        <span className="text-xs font-medium text-foreground">{STATE_LABEL[state]}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
      </div>
      <div className="p-2 space-y-1.5">
        {tasks.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">No tasks</div>
        ) : (
          tasks.map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

function groupBy(tasks: TaskFull[]): Record<TaskState, TaskFull[]> {
  const acc = {} as Record<TaskState, TaskFull[]>;
  for (const t of tasks) (acc[t.state] ??= []).push(t);
  return acc;
}
