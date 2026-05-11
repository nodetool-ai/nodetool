"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCcw } from "lucide-react";

export function ResumeSessionButton({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const resume = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const next = await res.json();
      router.push(`/sessions/${next.id}`);
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={resume}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 text-xs hover:bg-secondary disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCcw className="size-3" />}
        Resume
      </button>
      {error && <span className="text-[11px] text-state-blocked">{error}</span>}
    </div>
  );
}
