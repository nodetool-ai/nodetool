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

import { toolRowView } from "../toolRow.js";
import { CopyButton } from "./CopyButton.js";
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

/** One-click openers for an empty panel, phrased for the tab beside it. */
const STARTER_PROMPTS = [
  "Summarize this page",
  "Pull the key facts out of this page into a list",
  "What can I do with this page?"
];

interface MessageListProps {
  rows: ChatRow[];
  streaming: boolean;
  pendingContent?: ReactNode;
  /** Fills and sends a starter prompt from the empty state. */
  onStarter?: (text: string) => void;
}

export function MessageList({
  rows,
  streaming,
  pendingContent,
  onStarter
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
    return <EmptyState onStarter={onStarter} />;
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
    const view = toolRowView(row);
    // A call with no result yet, at the tail of a live turn, is still running.
    const running = streaming && isLast && row.result === undefined;
    const hasDetails =
      view.code !== null || view.args !== undefined || row.result !== undefined;
    return (
      <details className="tool-call" data-error={row.isError || undefined}>
        <summary className="tool-call-chip">
          <span className="tool-call__arrow" aria-hidden="true">▸</span>
          <WrenchIcon size={12} />
          <span className="tool-call-chip__name">{view.label}</span>
          <span className={running ? "tool-call__status shimmer" : "tool-call__status"}>
            {row.isError
              ? "Failed"
              : row.result !== undefined
                ? "Finished"
                : running
                  ? "Running…"
                  : "Called"}
          </span>
        </summary>
        <div className="tool-call__body">
          {row.message && view.label !== row.message && <p>{row.message}</p>}
          {view.code !== null && (
            <section className="tool-call__section" aria-label="Code">
              <div className="tool-call__section-header">
                <h3>Code</h3>
                <CopyButton value={view.code} label="Copy code" />
              </div>
              <pre className="tool-call__code" tabIndex={0}>
                <code className="language-javascript">{view.code}</code>
              </pre>
            </section>
          )}
          <ToolDetail label="Arguments" value={view.args} />
          <ToolDetail label={row.isError ? "Error" : "Result"} value={row.result} />
          {!hasDetails && <p>No details received for this call.</p>}
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
      {row.role === "assistant" && row.text && !showCaret && (
        <div className="message-actions">
          <CopyButton value={row.text} label="Copy message" />
        </div>
      )}
    </div>
  );
}

function ToolDetail({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <section className="tool-call__section" aria-label={label}>
      <div className="tool-call__section-header">
        <h3>{label}</h3>
        <CopyButton value={text} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <pre tabIndex={0}>{text}</pre>
    </section>
  );
}

function EmptyState({ onStarter }: { onStarter?: (text: string) => void }) {
  return (
    <div className="empty-state">
      <div>
        <h2 className="empty-state__title">Ask NodeTool</h2>
        <p className="empty-state__body">
          Pick a model and start a conversation. The agent runs on your NodeTool
          server with the same tools as the desktop app, and can read the tab
          beside this panel.
        </p>
        {onStarter && (
          <div className="starter-list">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="starter-chip"
                onClick={() => onStarter(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
