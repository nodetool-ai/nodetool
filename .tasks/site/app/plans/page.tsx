import Link from "next/link";
import * as repo from "@/lib/repo";
import { StateBadge } from "@/components/state-badge";
import { Progress } from "@/components/ui/progress";
import { NewPlanForm } from "@/components/new-plan-form";

export const dynamic = "force-dynamic";

export default async function PlansIndexPage() {
  const plans = repo.listPlans();
  const progressByPlan = repo.planProgressBatch(plans.map((p) => p.id));
  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Plans</h1>
          <p className="text-sm text-muted-foreground">{plans.length} total.</p>
        </div>
        <NewPlanForm />
      </header>

      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans yet.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
          {plans.map((p) => {
            const { done, total, pct, open } = progressByPlan.get(p.id) ?? {
              done: 0,
              total: 0,
              pct: 0,
              open: 0,
            };
            return (
              <Link
                key={p.id}
                href={`/plans/${p.id}`}
                className="block px-4 py-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">{p.id}</span>
                  <span className="text-sm font-medium">{p.title}</span>
                  <StateBadge state={p.state} />
                  {p.owner && <span className="text-xs text-muted-foreground">@{p.owner}</span>}
                </div>
                {total > 0 && (
                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={pct} className="w-40" />
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {done} / {total} done · {open} open
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
