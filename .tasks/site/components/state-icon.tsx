import type { TaskState, PlanState } from "@/lib/types";
import { cn } from "@/lib/utils";

// Linear-style status glyphs. Drawn as small inline SVGs so they line up
// with text and stay crisp at any size.
export function StateIcon({
  state,
  className,
}: {
  state: TaskState | PlanState;
  className?: string;
}) {
  const size = 14;
  const stroke = 1.75;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": true,
  } as const;
  switch (state) {
    case "todo":
    case "draft":
    case "proposed":
      return (
        <svg {...common} className={cn("text-state-todo shrink-0", className)}>
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={stroke} />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common} className={cn("text-state-progress shrink-0", className)}>
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={stroke} />
          <path d="M8 2.5a5.5 5.5 0 015.5 5.5h-5.5z" fill="currentColor" />
        </svg>
      );
    case "review":
      return (
        <svg {...common} className={cn("text-state-review shrink-0", className)}>
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={stroke} />
          <circle cx="8" cy="8" r="2.5" fill="currentColor" />
        </svg>
      );
    case "blocked":
      return (
        <svg {...common} className={cn("text-state-blocked shrink-0", className)}>
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth={stroke} />
          <path d="M5.5 8h5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "done":
    case "accepted":
      return (
        <svg {...common} className={cn("text-state-done shrink-0", className)}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.2l2.2 2.2L11 6.6"
            stroke="hsl(var(--background))"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    case "cancelled":
      return (
        <svg {...common} className={cn("text-state-cancelled shrink-0", className)}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5.5 5.5l5 5M10.5 5.5l-5 5"
            stroke="hsl(var(--background))"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}
