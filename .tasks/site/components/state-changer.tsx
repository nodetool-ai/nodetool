"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { StateIcon } from "./state-icon";
import { STATE_LABEL, TASK_TRANSITIONS, type TaskState } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StateChanger({
  taskId,
  current,
  assignee,
}: {
  taskId: string;
  current: TaskState;
  assignee: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const allowed = TASK_TRANSITIONS[current];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const transition = (next: TaskState) => {
    setOpen(false);
    setError(null);
    let assigneeOverride = assignee ?? undefined;
    if (next === "in_progress" && !assigneeOverride) {
      assigneeOverride = window.prompt("Assignee:", "")?.trim() || undefined;
      if (!assigneeOverride) return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${taskId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next, assignee: assigneeOverride }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div ref={wrap} className="relative inline-block">
      <button
        type="button"
        onClick={() => allowed.length > 0 && setOpen((v) => !v)}
        disabled={pending || allowed.length === 0}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/60 px-2 py-0.5 text-xs font-medium text-foreground",
          allowed.length > 0 && "hover:bg-secondary",
          allowed.length === 0 && "opacity-60 cursor-default"
        )}
      >
        <StateIcon state={current} />
        {STATE_LABEL[current]}
        {pending ? <Loader2 className="size-3 animate-spin" /> : allowed.length > 0 ? <ChevronDown className="size-3 opacity-60" /> : null}
      </button>
      {open && (
        <div className="absolute left-0 mt-1 z-20 min-w-[12rem] rounded-md border border-border bg-card p-1 shadow-lg">
          {allowed.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => transition(s)}
              className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-xs hover:bg-muted/60 text-left"
            >
              <StateIcon state={s} />
              {STATE_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      {error && <p className="absolute left-0 top-full mt-1 text-[11px] text-state-blocked">{error}</p>}
    </div>
  );
}
