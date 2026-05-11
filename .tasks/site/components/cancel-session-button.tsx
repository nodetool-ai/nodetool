"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleX, Loader2 } from "lucide-react";

export function CancelSessionButton({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    startTransition(async () => {
      await fetch(`/api/sessions/${sessionId}/cancel`, { method: "POST" });
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={cancel}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 text-xs hover:bg-secondary text-state-blocked disabled:opacity-40"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <CircleX className="size-3" />}
      Cancel
    </button>
  );
}
