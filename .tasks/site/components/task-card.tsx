import Link from "next/link";
import type { Task } from "@/lib/tasks";
import { StateIcon } from "./state-icon";

export function TaskCard({ task }: { task: Task }) {
  return (
    <Link
      href={`/tasks/${task.slug}/`}
      className="block rounded-md border border-border/70 bg-card/40 hover:bg-card hover:border-border transition-colors p-3"
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
        <StateIcon state={task.state} />
        <span className="tabular-nums">{task.id}</span>
      </div>
      <div className="mt-1.5 text-sm font-medium leading-snug text-foreground line-clamp-3">
        {task.title}
      </div>
      {(task.assignee || task.tags?.length) ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.assignee && <span>@{task.assignee}</span>}
          {task.tags?.slice(0, 3).map((t) => (
            <span key={t} className="rounded border border-border/70 px-1.5 py-px">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
