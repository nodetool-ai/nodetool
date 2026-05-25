import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500",
  reconnecting: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
  disconnected: "bg-muted-foreground/40",
  idle: "bg-muted-foreground/30"
};

const LABELS: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  error: "Connection error",
  disconnected: "Disconnected",
  idle: "Idle"
};

export function ConnectionDot({ state }: { state: string }) {
  const dotClass = COLORS[state] ?? "bg-muted-foreground/40";
  const label = LABELS[state] ?? state;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className={cn("inline-block size-2 rounded-full", dotClass)}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
