import Link from "next/link";
import * as agent from "@/lib/agent";
import * as repo from "@/lib/repo";
import { SessionStatusPill } from "@/components/session-status-pill";
import { formatDateTime, relativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const sessions = agent.listSessions();
  const taskTitles = new Map(repo.listTasks().map((t) => [t.id, t.title]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Agent sessions</h1>
        <p className="text-sm text-muted-foreground">{sessions.length} total · live and completed runs.</p>
      </header>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions yet. Run an agent from a task page.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="block px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  #{s.id}
                </span>
                <span className="text-sm font-medium">
                  {taskTitles.get(s.taskId) ?? s.taskId}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{s.taskId}</span>
                <SessionStatusPill status={s.status} />
                {s.prUrl && (
                  <a
                    href={s.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline decoration-dotted"
                  >
                    PR ↗
                  </a>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>started {relativeDate(s.startedAt)}</span>
                {s.completedAt && <span>· {formatDateTime(s.completedAt)}</span>}
                {s.model && <span className="font-mono">{s.model}</span>}
                {s.error && <span className="text-state-blocked">{s.error}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
