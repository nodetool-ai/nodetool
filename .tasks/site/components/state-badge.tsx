import { STATE_LABEL, type PlanState, type TaskState } from "@/lib/types";
import { StateIcon } from "./state-icon";
import { cn } from "@/lib/utils";

export function StateBadge({
  state,
  className,
}: {
  state: TaskState | PlanState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/60 px-2 py-0.5 text-xs font-medium text-foreground",
        className
      )}
    >
      <StateIcon state={state} />
      {STATE_LABEL[state] ?? state}
    </span>
  );
}
