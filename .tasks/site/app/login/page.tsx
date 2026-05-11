"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      router.replace(next);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-sm pt-20">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the value of <code className="font-mono">NODETOOL_TASKS_TOKEN</code>.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token"
          autoFocus
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-foreground/40"
        />
        <button
          type="submit"
          disabled={pending || !token}
          className={cn(
            "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium",
            "hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          Continue
        </button>
        {error && <p className="text-xs text-state-blocked">{error}</p>}
      </form>
    </div>
  );
}
