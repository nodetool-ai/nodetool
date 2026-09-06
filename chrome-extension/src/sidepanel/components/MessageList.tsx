/**
 * Transcript rendering.
 *
 * Ported from `examples/chat_app/src/components/message-list.tsx` with the web
 * chat's message layout: the user's turn is a right-aligned tinted bubble, the
 * assistant's is plain text on the surface, and a mid-turn tool call is a
 * chip (see `web/src/components/chat/thread/ChatThreadView.styles.ts`).
 */

import { useEffect, useRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { WrenchIcon } from "./Icons.js";

export type ChatRow =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      text: string;
      /** Reasoning tokens streamed ahead of the answer, rendered apart. */
      thinking?: string;
    }
  | {
      kind: "tool_call";
      id: string;
      name: string;
      args?: unknown;
      result?: unknown;
      isError?: boolean;
      message?: string;
    };

/** How close to the bottom still counts as "following along" (px). */
const STICK_THRESHOLD_PX = 80;

interface MessageListProps {
  rows: ChatRow[];
  streaming: boolean;
  pendingContent?: ReactNode;
}

export function MessageList({
  rows,
  streaming,
  pendingContent
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  }

  // Keep streaming output in view only while the user is already near the
  // bottom, so scrolling back through a long answer is not yanked forward.
  const lastRow = rows[rows.length - 1];
  const showThinkingIndicator =
    streaming &&
    !pendingContent &&
    (lastRow?.kind !== "message" ||
      lastRow.role !== "assistant" ||
      !lastRow.text);
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({
      behavior: streaming ? "auto" : "smooth",
      block: "end"
    });
  }, [rows.length, lastRow, streaming]);

  if (rows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="message-list" ref={scrollRef} onScroll={handleScroll}>
      <div className="message-list__inner">
        {rows.map((row, index) => (
          <MessageRow
            key={row.id}
            row={row}
            isLast={index === rows.length - 1}
            streaming={streaming}
          />
        ))}
        {showThinkingIndicator && (
          <div className="thinking-indicator" role="status" aria-live="polite">
            <span>Thinking</span>
            <span className="thinking-indicator__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        {pendingContent}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageRow({
  row,
  isLast,
  streaming
}: {
  row: ChatRow;
  isLast: boolean;
  streaming: boolean;
}) {
  if (row.kind === "tool_call") {
    return (
      <details className="tool-call" data-error={row.isError || undefined}>
        <summary className="tool-call-chip">
          <span className="tool-call__arrow" aria-hidden="true">▸</span>
          <WrenchIcon size={12} />
          <span className="tool-call-chip__name">{row.name}</span>
          <span>{row.isError ? "Failed" : row.result !== undefined ? "Finished" : "Called"}</span>
        </summary>
        <div className="tool-call__body">
          {row.message && <p>{row.message}</p>}
          <ToolDetail label="Arguments" value={row.args} />
          <ToolDetail label={row.isError ? "Error" : "Result"} value={row.result} />
          {row.args === undefined && row.result === undefined && (
            <p>No details received for this call.</p>
          )}
        </div>
      </details>
    );
  }

  const showCaret = row.role === "assistant" && isLast && streaming;

  return (
    <div className={`chat-message ${row.role}`}>
      {row.thinking && <div className="thinking-block">{row.thinking}</div>}
      <div className="message-content">
        {row.text ? (
          <div className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: (props) => <a {...props} target="_blank" rel="noreferrer" />
              }}
            >
              {row.text}
            </ReactMarkdown>
          </div>
        ) : null}
        {showCaret && <span className="caret" aria-label="Generating" />}
      </div>
    </div>
  );
}

function ToolDetail({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <section className="tool-call__section" aria-label={label}>
      <h3>{label}</h3>
      <pre tabIndex={0}>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div>
        <h2 className="empty-state__title">Ask NodeTool</h2>
        <p className="empty-state__body">
          Pick a model and start a conversation. The agent runs on your NodeTool
          server with the same tools as the desktop app.
        </p>
      </div>
    </div>
  );
}
