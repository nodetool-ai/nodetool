import { useState } from "react";

import type {
  PlanApprovalRequestEvent,
  SecretRequestEvent,
  ToolApprovalDecision,
  ToolApprovalRequestEvent
} from "../../lib/chat-socket.js";

interface ToolApprovalCardProps {
  request: ToolApprovalRequestEvent;
  onResolve: (decision: ToolApprovalDecision) => boolean;
}

const APPROVAL_QUESTIONS: Record<ToolApprovalRequestEvent["category"], string> =
  {
    execute: "Run this action?",
    write: "Make this change?",
    external: "Allow this action?"
  };

export function ToolApprovalCard({
  request,
  onResolve
}: ToolApprovalCardProps) {
  const [resolving, setResolving] = useState(false);
  const summary = request.description?.trim() || request.message;
  const codeValue = request.args["code"];
  const code =
    typeof codeValue === "string" && codeValue.trim() ? codeValue : null;
  const args = formatJson(
    Object.fromEntries(
      Object.entries(request.args).filter(([key]) => key !== "code")
    )
  );

  function resolve(decision: ToolApprovalDecision) {
    if (resolving) return;
    setResolving(true);
    if (!onResolve(decision)) setResolving(false);
  }

  return (
    <section
      className="approval-card"
      aria-label={APPROVAL_QUESTIONS[request.category]}
    >
      <div className="approval-card__eyebrow">Permission required</div>
      <h3 className="approval-card__title">
        {APPROVAL_QUESTIONS[request.category]}
      </h3>
      {summary && <p className="approval-card__summary">{summary}</p>}
      <div className="approval-card__tool">{request.tool_name}</div>
      {code && (
        <details className="approval-card__details">
          <summary>Show code</summary>
          <pre>{code}</pre>
        </details>
      )}
      {args && (
        <details className="approval-card__details">
          <summary>Show arguments</summary>
          <pre>{args}</pre>
        </details>
      )}
      <div className="approval-card__actions">
        <button
          className="action-button action-button--primary"
          type="button"
          autoFocus
          disabled={resolving}
          onClick={() => resolve("allow")}
        >
          Allow
        </button>
        <button
          className="action-button"
          type="button"
          disabled={resolving}
          onClick={() => resolve("allow_for_chat")}
        >
          Allow for chat
        </button>
        <button
          className="action-button action-button--danger"
          type="button"
          disabled={resolving}
          onClick={() => resolve("deny")}
        >
          Deny
        </button>
      </div>
    </section>
  );
}

interface PlanApprovalCardProps {
  request: PlanApprovalRequestEvent;
  onResolve: (decision: "approve" | "reject", feedback?: string) => boolean;
}

export function PlanApprovalCard({
  request,
  onResolve
}: PlanApprovalCardProps) {
  const [feedback, setFeedback] = useState("");
  const [resolving, setResolving] = useState(false);
  const note = feedback.trim();

  function resolve(decision: "approve" | "reject", nextFeedback?: string) {
    if (resolving) return;
    setResolving(true);
    if (!onResolve(decision, nextFeedback)) setResolving(false);
  }

  return (
    <section
      className="approval-card approval-card--plan"
      aria-label="Run this plan?"
    >
      <div className="approval-card__eyebrow">Plan ready</div>
      <h3 className="approval-card__title">{request.plan.title}</h3>
      {request.plan.tasks.length > 0 && (
        <ol className="approval-card__plan">
          {request.plan.tasks.map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              {task.steps.map((step) => (
                <p key={step.id}>{step.instructions}</p>
              ))}
            </li>
          ))}
        </ol>
      )}
      <textarea
        className="approval-card__feedback"
        rows={2}
        value={feedback}
        aria-label="Plan feedback"
        placeholder="What should change?"
        onChange={(event) => setFeedback(event.target.value)}
      />
      <div className="approval-card__actions">
        <button
          className="action-button action-button--primary"
          type="button"
          autoFocus
          disabled={resolving}
          onClick={() => resolve("approve")}
        >
          Run plan
        </button>
        <button
          className="action-button"
          type="button"
          disabled={!note || resolving}
          onClick={() => resolve("reject", note)}
        >
          Revise
        </button>
        <button
          className="action-button action-button--danger"
          type="button"
          disabled={resolving}
          onClick={() => resolve("reject")}
        >
          Don&apos;t run
        </button>
      </div>
    </section>
  );
}

interface SecretRequestCardProps {
  request: SecretRequestEvent;
  onSave: (value: string) => Promise<void>;
  onDecline: () => void;
}

export function SecretRequestCard({
  request,
  onSave,
  onDecline
}: SecretRequestCardProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const helpUrl = safeHelpUrl(request.help_url);

  async function save() {
    const nextValue = value.trim();
    if (!nextValue || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(nextValue);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
      setSaving(false);
    }
  }

  return (
    <section
      className="approval-card approval-card--secret"
      aria-label="Enter a credential"
    >
      <div className="approval-card__eyebrow">Credential required</div>
      <h3 className="approval-card__title">Enter {request.key}</h3>
      {request.reason && (
        <p className="approval-card__summary">{request.reason}</p>
      )}
      {request.description && (
        <p className="approval-card__description">{request.description}</p>
      )}
      {helpUrl && (
        <a href={helpUrl} target="_blank" rel="noreferrer noopener">
          Where to get this key
        </a>
      )}
      <input
        className="approval-card__secret-input"
        type="password"
        autoComplete="off"
        autoFocus
        value={value}
        aria-label={request.key}
        placeholder="Paste the key"
        disabled={saving}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
      {error && (
        <p className="approval-card__error" role="alert">
          {error}
        </p>
      )}
      <div className="approval-card__actions">
        <button
          className="action-button"
          type="button"
          disabled={saving}
          onClick={onDecline}
        >
          Not now
        </button>
        <button
          className="action-button action-button--primary"
          type="button"
          disabled={!value.trim() || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save key"}
        </button>
      </div>
    </section>
  );
}

function formatJson(value: Record<string, unknown>): string | null {
  if (Object.keys(value).length === 0) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Arguments could not be displayed.";
  }
}

function safeHelpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
