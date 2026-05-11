import Link from "next/link";
import type { TaskFull } from "@/lib/types";
import { StateIcon } from "./state-icon";
import { relativeDate } from "@/lib/utils";

export function TaskRow({ task }: { task: TaskFull }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group flex items-center gap-3 px-3 py-2.5 -mx-3 rounded-md hover:bg-muted/60 transition-colors"
    >
      <StateIcon state={task.state} />
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{task.id}</span>
      <span className="flex-1 truncate text-sm text-foreground group-hover:text-foreground">
        {task.title}
      </span>
      {task.tags?.slice(0, 2).map((t) => (
        <span
          key={t}
          className="hidden sm:inline-block rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
        >
          {t}
        </span>
      ))}
      {task.assignee && (
        <span className="hidden md:inline-block text-xs text-muted-foreground">
          @{task.assignee}
        </span>
      )}
      <span className="hidden lg:inline-block text-xs text-muted-foreground tabular-nums w-20 text-right">
        {relativeDate(task.updatedAt)}
      </span>
    </Link>
  );
}
