"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function CriterionCheckbox({
  taskId,
  criterionId,
  initialDone,
  text,
}: {
  taskId: string;
  criterionId: number;
  initialDone: boolean;
  text: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState(initialDone);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !done;
    setDone(next);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${taskId}/criteria/${criterionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: next }),
      });
      if (!res.ok) {
        setDone(!next);
        setError(`Failed: ${res.status}`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="group flex items-start gap-2.5 py-1.5">
      <button
        type="button"
        aria-pressed={done}
        onClick={toggle}
        disabled={pending}
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          done
            ? "bg-state-done border-state-done text-background"
            : "border-border bg-background hover:border-foreground"
        )}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : done ? (
          <Check strokeWidth={3} className="size-3" />
        ) : null}
      </button>
      <span
        className={cn(
          "text-sm leading-6 select-none",
          done ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {text}
      </span>
      {error && <span className="ml-2 text-xs text-state-blocked">{error}</span>}
    </li>
  );
}
