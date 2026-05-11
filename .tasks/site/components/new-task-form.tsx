"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function NewTaskForm({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [tags, setTags] = useState("");
  const [assignee, setAssignee] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setCriteria("");
    setTags("");
    setAssignee("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planId,
          title: title.trim(),
          assignee: assignee.trim() || undefined,
          criteria: criteria
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error ?? `HTTP ${res.status}`);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3" /> New task
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border/60 bg-card/30 px-3 py-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="w-full rounded-sm border border-border/60 bg-background px-2 py-1.5 text-sm font-medium outline-none focus:border-foreground/40"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            reset();
            setOpen(false);
          }
        }}
      />
      <textarea
        rows={3}
        value={criteria}
        onChange={(e) => setCriteria(e.target.value)}
        placeholder={"Acceptance criteria, one per line"}
        className="w-full resize-none rounded-sm border border-border/60 bg-background px-2 py-1.5 text-xs outline-none focus:border-foreground/40"
      />
      <div className="flex items-center gap-2">
        <input
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="assignee"
          className="w-28 rounded-sm border border-border/60 bg-background px-2 py-1 text-xs font-mono outline-none focus:border-foreground/40"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags (comma separated)"
          className="flex-1 rounded-sm border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className={cn(
            "inline-flex items-center gap-1 rounded-md bg-foreground text-background px-3 py-1 text-xs font-medium",
            "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {pending && <Loader2 className="size-3 animate-spin" />}
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-state-blocked">{error}</p>}
    </form>
  );
}
