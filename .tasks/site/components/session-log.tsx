"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Wrench, MessageSquare, Terminal, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { AgentEventRow, SessionStatus } from "@/lib/types";
import {
  assistantText,
  toolResults,
  toolUses,
  type SdkContentBlock,
  type SdkMessageEnvelope,
} from "@/lib/sdk-message";

interface Props {
  sessionId: number;
  initialEvents: AgentEventRow[];
  initialStatus: SessionStatus;
  live: boolean;
}

export function SessionLog({ sessionId, initialEvents, initialStatus, live }: Props) {
  const [events, setEvents] = useState<AgentEventRow[]>(initialEvents);
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [streaming, setStreaming] = useState(live);
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  // Track the highest event id we've seen so reconnects don't replay events
  // we already have. Initialized from the SSR'd batch, then advanced in the
  // onmessage handler — using a ref so we don't reopen the EventSource on
  // every new event.
  const lastIdRef = useRef<number>(initialEvents[initialEvents.length - 1]?.id ?? 0);

  useEffect(() => {
    if (!live) return;
    const es = new EventSource(`/api/sessions/${sessionId}/events?since=${lastIdRef.current}`);
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === "_eos") {
        es.close();
        setStreaming(false);
        router.refresh();
        return;
      }
      if (typeof event.id === "number" && event.id > lastIdRef.current) {
        lastIdRef.current = event.id;
      }
      setEvents((prev) => [...prev, event]);
      if (event.type === "status") {
        const s = event.payload?.status as SessionStatus | undefined;
        if (s) setStatus(s);
      }
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
    };
    return () => es.close();
  }, [sessionId, live, router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{events.length} events</span>
        {streaming && <span className="text-state-progress">live</span>}
      </div>
      <div className="rounded-lg border border-border/60 bg-card/30 divide-y divide-border/60 max-h-[60vh] overflow-y-auto">
        {events.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted-foreground">
            Waiting for the agent…
          </div>
        ) : (
          events.map((e) => <EventRow key={e.id} event={e} />)
        )}
        <div ref={endRef} />
      </div>
      {!streaming && (
        <p className="text-[11px] text-muted-foreground">
          Stream closed — session is {status}.
        </p>
      )}
    </div>
  );
}

function EventRow({ event }: { event: AgentEventRow }) {
  const payload = event.payload as Record<string, unknown> | undefined;
  switch (event.type) {
    case "status":
      return (
        <Row icon={<CheckCircle2 className="size-3.5 text-state-progress" />} when={event.createdAt}>
          <code className="text-foreground">{String(payload?.status)}</code>
          {typeof payload?.error === "string" && (
            <span className="text-state-blocked"> — {payload.error}</span>
          )}
        </Row>
      );
    case "shell":
      return (
        <Row icon={<Terminal className="size-3.5 text-muted-foreground" />} when={event.createdAt}>
          <code className="text-foreground/90">$ {String(payload?.cmd)}</code>
        </Row>
      );
    case "shell_out":
      return (
        <Row icon={<ChevronRight className="size-3.5 text-muted-foreground" />} when={event.createdAt} dense>
          <pre className="text-[11px] leading-5 font-mono whitespace-pre-wrap text-muted-foreground">
            {String(payload?.data ?? "").trim()}
          </pre>
        </Row>
      );
    case "stderr":
      return (
        <Row icon={<AlertCircle className="size-3.5 text-state-blocked" />} when={event.createdAt} dense>
          <pre className="text-[11px] leading-5 font-mono whitespace-pre-wrap text-state-blocked/80">
            {String(payload?.data ?? "").trim()}
          </pre>
        </Row>
      );
    case "warning":
      return (
        <Row icon={<AlertCircle className="size-3.5 text-state-progress" />} when={event.createdAt}>
          <span className="text-state-progress">{String(payload?.message)}</span>
        </Row>
      );
    case "agent":
      return <AgentEventRow when={event.createdAt} message={payload} />;
    case "prompt":
      return (
        <Row icon={<MessageSquare className="size-3.5 text-muted-foreground" />} when={event.createdAt}>
          <details className="text-xs">
            <summary className="cursor-pointer text-foreground">Prompt</summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-muted-foreground text-[11px] leading-5">
              {String(payload?.prompt ?? "")}
            </pre>
          </details>
        </Row>
      );
    case "worktree":
      return (
        <Row icon={<Wrench className="size-3.5 text-muted-foreground" />} when={event.createdAt}>
          <span className="text-muted-foreground">worktree</span>{" "}
          <code className="text-foreground">{String(payload?.branch)}</code>
        </Row>
      );
    case "pr":
      return (
        <Row icon={<CheckCircle2 className="size-3.5 text-state-done" />} when={event.createdAt}>
          <span>PR opened: </span>
          <a
            className="text-foreground underline decoration-muted-foreground hover:decoration-foreground"
            href={String(payload?.url)}
            target="_blank"
            rel="noreferrer"
          >
            {String(payload?.url)}
          </a>
        </Row>
      );
    default:
      return (
        <Row icon={<ChevronRight className="size-3.5 text-muted-foreground" />} when={event.createdAt}>
          <code className="text-muted-foreground">{event.type}</code>
        </Row>
      );
  }
}

function Row({
  icon,
  when,
  children,
  dense,
}: {
  icon: React.ReactNode;
  when: Date;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-2 px-3 py-2 text-xs", dense && "py-1")}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {formatDateTime(when)}
      </span>
    </div>
  );
}

function AgentEventRow({ when, message }: { when: Date; message?: SdkMessageEnvelope }) {
  if (!message) return null;
  if (message.type === "assistant") {
    const blocks = message.message?.content;
    const text = assistantText(blocks);
    const tools = toolUses(blocks);
    return (
      <Row icon={<MessageSquare className="size-3.5 text-state-review" />} when={when}>
        <div className="space-y-1.5">
          {text && <div className="whitespace-pre-wrap text-foreground/90">{text}</div>}
          {tools.map((t: SdkContentBlock, i: number) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] mr-1"
            >
              <Wrench className="size-3" />
              <code className="font-mono">{t.name}</code>
            </div>
          ))}
        </div>
      </Row>
    );
  }
  if (message.type === "user") {
    const results = toolResults(message.message?.content);
    if (results.length === 0) return null;
    return (
      <Row icon={<ChevronRight className="size-3.5 text-muted-foreground" />} when={when} dense>
        <details>
          <summary className="cursor-pointer text-[11px] text-muted-foreground">
            tool result{results.length > 1 ? `s (${results.length})` : ""}
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5 text-muted-foreground">
            {results
              .map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content)))
              .join("\n---\n")
              .slice(0, 2000)}
          </pre>
        </details>
      </Row>
    );
  }
  if (message.type === "result") {
    const subtype = message.subtype ?? "";
    return (
      <Row icon={<CheckCircle2 className="size-3.5 text-state-done" />} when={when}>
        <span className="text-foreground">Agent finished</span>
        {subtype && <span className="text-muted-foreground"> ({subtype})</span>}
      </Row>
    );
  }
  if (message.type === "system") {
    return (
      <Row icon={<ChevronRight className="size-3.5 text-muted-foreground" />} when={when} dense>
        <span className="text-[11px] text-muted-foreground">system event</span>
      </Row>
    );
  }
  return null;
}
