import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getAllTasks,
  getPlanBySlug,
  getTaskBySlug,
  getAllPlans,
} from "@/lib/tasks";
import { StateBadge } from "@/components/state-badge";
import { StateIcon } from "@/components/state-icon";
import { MarkdownBody } from "@/components/markdown-body";
import { formatDate, relativeDate } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllTasks().map((t) => ({ slug: t.slug }));
}

export default async function TaskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const task = getTaskBySlug(slug);
  if (!task) notFound();

  const plan = getAllPlans().find((p) => p.id === task.plan);
  const planSlug = plan?.slug;
  const deps = task.dependencies
    .map((id) => getAllTasks().find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        href="/tasks/"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="size-3.5" /> Tasks
      </Link>

      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <StateIcon state={task.state} className="size-4" />
        <span className="tabular-nums">{task.id}</span>
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight leading-tight">{task.title}</h1>

      <dl className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-xs">
        <Meta label="State">
          <StateBadge state={task.state} />
        </Meta>
        <Meta label="Assignee">{task.assignee ? `@${task.assignee}` : "—"}</Meta>
        <Meta label="Plan">
          {plan && planSlug ? (
            <Link href={`/plans/${planSlug}/`} className="text-foreground hover:underline">
              {plan.title}
            </Link>
          ) : (
            <span className="text-muted-foreground">{task.plan}</span>
          )}
        </Meta>
        <Meta label="Updated" hint={relativeDate(task.updated)}>
          {formatDate(task.updated)}
        </Meta>
        {task.estimate && <Meta label="Estimate">{task.estimate}</Meta>}
        {task.tags?.length ? (
          <Meta label="Tags">
            <div className="flex flex-wrap gap-1">
              {task.tags.map((t) => (
                <span key={t} className="rounded border border-border/60 px-1.5 py-px text-[10px] uppercase tracking-wide">
                  {t}
                </span>
              ))}
            </div>
          </Meta>
        ) : null}
        {deps.length > 0 && (
          <Meta label="Depends on" className="col-span-2 md:col-span-4">
            <div className="flex flex-wrap gap-2">
              {deps.map((d) => (
                <Link
                  key={d.id}
                  href={`/tasks/${d.slug}/`}
                  className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-secondary/40 px-2 py-1 hover:bg-secondary"
                >
                  <StateIcon state={d.state} />
                  <span className="font-mono tabular-nums">{d.id}</span>
                  <span className="text-muted-foreground">{d.title}</span>
                </Link>
              ))}
            </div>
          </Meta>
        )}
      </dl>

      <div className="my-8 h-px bg-border/60" />

      <MarkdownBody html={task.bodyHtml} />
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
