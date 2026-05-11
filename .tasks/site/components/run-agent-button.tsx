"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function RunAgentButton({
  taskId,
  hasActive,
  className,
}: {
  taskId: string;
  hasActive: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${taskId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const session = await res.json();
      router.push(`/sessions/${session.id}`);
    });
  };

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={start}
        disabled={pending || hasActive}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-foreground text-background px-3 py-1.5 text-xs font-medium",
          "hover:opacity-90 transition-opacity",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {hasActive ? "Agent running" : "Run agent"}
      </button>
      {error && <span className="text-[11px] text-state-blocked">{error}</span>}
    </div>
  );
}
