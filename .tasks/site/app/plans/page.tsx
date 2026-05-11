import Link from "next/link";
import { getAllPlans, getTasksByPlan, planProgress, STATE_LABEL } from "@/lib/tasks";
import { StateBadge } from "@/components/state-badge";
import { Progress } from "@/components/ui/progress";

export default function PlansIndexPage() {
  const plans = getAllPlans();
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Plans</h1>
        <p className="text-sm text-muted-foreground">{plans.length} total.</p>
      </header>

      <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
        {plans.map((p) => {
          const { done, total, pct } = planProgress(p.id);
          const open = getTasksByPlan(p.id).filter(
            (t) => t.state !== "done" && t.state !== "cancelled"
          ).length;
          return (
            <Link
              key={p.id}
              href={`/plans/${p.slug}/`}
              className="block px-4 py-4 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{p.id}</span>
                <span className="text-sm font-medium">{p.title}</span>
                <StateBadge state={p.state} />
                {p.owner && (
                  <span className="text-xs text-muted-foreground">@{p.owner}</span>
                )}
              </div>
              {total > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={pct} className="w-40" />
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {done} / {total} done &middot; {open} open
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
