import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import * as agent from "@/lib/agent";
import * as repo from "@/lib/repo";
import { SessionStatusPill } from "@/components/session-status-pill";
import { SessionLog } from "@/components/session-log";
import { CancelSessionButton } from "@/components/cancel-session-button";
import { formatDateTime, relativeDate } from "@/lib/utils";
import { isTerminalStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const session = agent.getSession(sessionId);
  if (!session) notFound();
  const task = repo.getTask(session.taskId);
  const events = agent.getSessionEvents(sessionId);
  const live = agent.isLive(sessionId);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Sessions
      </Link>

      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className="tabular-nums">session #{session.id}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {task?.title ?? session.taskId}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <SessionStatusPill status={session.status} />
          {task && (
            <Link
              href={`/tasks/${task.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 text-xs hover:bg-secondary"
            >
              <span className="font-mono text-muted-foreground">{task.id}</span>
            </Link>
          )}
          {session.prUrl && (
            <a
              className="text-xs text-foreground underline decoration-muted-foreground hover:decoration-foreground"
              href={session.prUrl}
              target="_blank"
              rel="noreferrer"
            >
              PR ↗
            </a>
          )}
          {!isTerminalStatus(session.status) && <CancelSessionButton sessionId={session.id} />}
        </div>
      </header>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-xs">
        <Meta label="Model">{session.model ?? "—"}</Meta>
        <Meta label="Branch">
          {session.branch ? (
            <code className="font-mono text-foreground">{session.branch}</code>
          ) : (
            "—"
          )}
        </Meta>
        <Meta label="Started" hint={relativeDate(session.startedAt)}>
          {formatDateTime(session.startedAt)}
        </Meta>
        <Meta label="Completed">
          {session.completedAt ? formatDateTime(session.completedAt) : "—"}
        </Meta>
        {session.worktreePath && (
          <Meta label="Worktree" className="col-span-2 md:col-span-4">
            <code className="font-mono text-[11px] text-foreground/80">
              {session.worktreePath}
            </code>
          </Meta>
        )}
        {session.error && (
          <Meta label="Error" className="col-span-2 md:col-span-4">
            <span className="text-state-blocked">{session.error}</span>
          </Meta>
        )}
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Activity</h2>
        <SessionLog
          sessionId={session.id}
          initialEvents={events}
          initialStatus={session.status}
          live={live}
        />
      </section>
    </article>
  );
}

function Meta({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">
        {children}
        {hint && <span className="ml-1.5 text-muted-foreground">({hint})</span>}
      </dd>
    </div>
  );
}
