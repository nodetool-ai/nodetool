"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function AddNoteForm({
  taskId,
  defaultAuthor,
}: {
  taskId: string;
  defaultAuthor?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState(defaultAuthor ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !author.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/tasks/${taskId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), author: author.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error ?? `HTTP ${res.status}`);
        return;
      }
      setBody("");
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
        <Plus className="size-3" /> Add note
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border/60 bg-card/30 px-3 py-3">
      <textarea
        autoFocus
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setBody("");
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
        }}
        placeholder="What happened?"
        className="w-full resize-none rounded-sm border border-border/60 bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40"
      />
      <div className="flex items-center gap-2">
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="author"
          className="w-32 rounded-sm border border-border/60 bg-background px-2 py-1 text-xs font-mono outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={pending || !body.trim() || !author.trim()}
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-md bg-foreground text-background px-2.5 py-1 text-xs font-medium",
            "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {pending && <Loader2 className="size-3 animate-spin" />}
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setBody("");
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
