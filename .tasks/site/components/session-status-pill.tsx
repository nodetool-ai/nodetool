import { Loader2 } from "lucide-react";
import type { SessionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const labels: Record<SessionStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  running: "Running",
  pushing: "Pushing",
  opening_pr: "Opening PR",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const tones: Record<SessionStatus, string> = {
  pending: "text-muted-foreground",
  preparing: "text-state-progress",
  running: "text-state-progress",
  pushing: "text-state-review",
  opening_pr: "text-state-review",
  completed: "text-state-done",
  failed: "text-state-blocked",
  cancelled: "text-muted-foreground",
};

export function SessionStatusPill({
  status,
  className,
}: {
  status: SessionStatus;
  className?: string;
}) {
  const isLive = !["completed", "failed", "cancelled"].includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/60 px-2 py-0.5 text-xs font-medium",
        tones[status],
        className
      )}
    >
      {isLive && <Loader2 className="size-3 animate-spin" />}
      {labels[status]}
    </span>
  );
}
