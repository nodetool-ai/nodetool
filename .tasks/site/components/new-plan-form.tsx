"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function NewPlanForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [owner, setOwner] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setBody("");
    setTags("");
    setOwner("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || undefined,
          owner: owner.trim() || undefined,
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
      const created = await res.json();
      reset();
      setOpen(false);
      router.push(`/plans/${created.id}`);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90"
      >
        <Plus className="size-3.5" /> New plan
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border/60 bg-card/30 px-3 py-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Plan title"
        className="w-full rounded-sm border border-border/60 bg-background px-2 py-1.5 text-sm font-medium outline-none focus:border-foreground/40"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            reset();
            setOpen(false);
          }
        }}
      />
      <textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Goal / approach (markdown)"
        className="w-full resize-none rounded-sm border border-border/60 bg-background px-2 py-1.5 text-xs outline-none focus:border-foreground/40"
      />
      <div className="flex items-center gap-2">
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="owner"
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
