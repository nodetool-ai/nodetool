"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface RunResult {
  status: "completed" | "failed" | "cancelled";
  outputs: Record<string, unknown[]>;
  error?: string;
}

type WorkflowId = "support-triage" | "content-summarizer";

// ── Helper to call the API route ───────────────────────────────────────────

async function runWorkflow(
  workflow: WorkflowId,
  params: Record<string, unknown>
): Promise<RunResult> {
  const res = await fetch("/api/run-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow, params }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? "Unknown error");
  }
  return res.json() as Promise<RunResult>;
}

// ── Priority badge ─────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Critical: { color: "#ef4444", bg: "#1f0a0a", border: "#ef4444" },
  High:     { color: "#f97316", bg: "#1f1200", border: "#f97316" },
  Medium:   { color: "#eab308", bg: "#1a1500", border: "#eab308" },
  Low:      { color: "#22c55e", bg: "#0d2218", border: "#22c55e" },
};

const CATEGORY_ICON: Record<string, string> = {
  Billing: "💳",
  Technical: "🔧",
  "Feature Request": "✨",
  Bug: "🐛",
  "General Inquiry": "💬",
};

// ── Support Triage Demo ────────────────────────────────────────────────────

const TRIAGE_SAMPLES = [
  {
    label: "Billing issue",
    text: "I was charged twice for my subscription this month. Please refund the duplicate payment ASAP — my account shows two charges of $29 on March 3rd.",
  },
  {
    label: "Critical outage",
    text: "Our entire production environment is down. The API is returning 503 errors for all requests. We are losing customers right now. This needs to be fixed immediately!",
  },
  {
    label: "Feature request",
    text: "It would be great if the dashboard had a dark mode. Many of our team members work late and the bright white screen is really uncomfortable.",
  },
  {
    label: "Bug report",
    text: "The export to CSV button doesn't work on Firefox 120. Clicking it does nothing — no download, no error message. Works fine on Chrome.",
  },
];

function SupportTriageDemo() {
  const [text, setText] = useState(TRIAGE_SAMPLES[0].text);
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setCategory(null);
    setPriority(null);
    setError(null);
    try {
      const res = await runWorkflow("support-triage", { text });
      if (res.status === "completed") {
        setCategory(String(res.outputs["category"]?.[0] ?? "Unknown"));
        setPriority(String(res.outputs["priority"]?.[0] ?? "Unknown"));
      } else {
        setError(res.error ?? "Workflow failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const priStyle = priority ? (PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["Low"]) : null;

  return (
    <section className="demo-card" data-testid="support-triage-demo">
      <div className="demo-card-header">
        <span className="demo-icon">🎫</span>
        <div>
          <h2>AI Support Ticket Triage</h2>
          <p className="demo-description">
            Two parallel <code>nodetool.agents.Classifier</code> nodes running on{" "}
            <code>gpt-4o-mini</code> — instantly routes any customer message to the
            right team with the right priority. Worth{" "}
            <strong className="value-highlight">$50–500 / month</strong> per support seat.
          </p>
        </div>
      </div>

      <div className="sample-bar">
        {TRIAGE_SAMPLES.map((s) => (
          <button
            key={s.label}
            className={`sample-chip ${text === s.text ? "active" : ""}`}
            onClick={() => setText(s.text)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="field-group">
        <label className="field-label">Customer message</label>
        <textarea
          className="field-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="triage-text-input"
          rows={4}
          placeholder="Paste a support message…"
        />
      </div>

      <button
        className="run-button"
        onClick={handleRun}
        disabled={loading || !text.trim()}
        data-testid="run-support-triage"
      >
        {loading ? "Analyzing…" : "🤖 Triage with AI"}
      </button>

      {(category !== null || priority !== null) && (
        <div className="triage-result" data-testid="support-triage-result">
          {category !== null && (
            <div className="triage-badge category-badge">
              <span className="badge-icon">{CATEGORY_ICON[category] ?? "��"}</span>
              <div>
                <span className="badge-label">Category</span>
                <span className="badge-value" data-testid="triage-category">{category}</span>
              </div>
            </div>
          )}
          {priority !== null && priStyle && (
            <div
              className="triage-badge priority-badge"
              style={{
                background: priStyle.bg,
                borderColor: priStyle.border,
                color: priStyle.color,
              }}
            >
              <span className="badge-icon">⚡</span>
              <div>
                <span className="badge-label" style={{ color: "#94a3b8" }}>Priority</span>
                <span className="badge-value" data-testid="triage-priority">{priority}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {error !== null && (
        <div className="result-box error" data-testid="triage-error">
          <span className="result-label">Error</span>
          <span className="result-value">{error}</span>
        </div>
      )}

      <div className="workflow-diagram">
        <span className="wf-node input-node">Customer Message</span>
        <span className="wf-arrow">→</span>
        <div className="wf-parallel">
          <div className="wf-branch">
            <span className="wf-node ai-node">Classifier (Category)</span>
            <span className="wf-arrow">→</span>
            <span className="wf-node output-node">category</span>
          </div>
          <div className="wf-branch">
            <span className="wf-node ai-node">Classifier (Priority)</span>
            <span className="wf-arrow">→</span>
            <span className="wf-node output-node">priority</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Content Summarizer Demo ────────────────────────────────────────────────

const SUMMARIZER_SAMPLES = [
  {
    label: "Blog post",
    text: `Artificial intelligence is transforming the way businesses operate, from automating routine tasks to generating insights from massive datasets. In 2024, enterprise AI adoption grew by 35%, with companies reporting an average 22% reduction in operational costs. The technology is no longer limited to tech giants — SMBs are now using AI tools for customer service, marketing, and financial planning. However, experts warn that AI adoption without proper governance can introduce new risks, including bias, data privacy violations, and over-reliance on automated decisions. Successful AI integration requires clear ownership, ongoing model monitoring, and a culture of data literacy across all teams.`,
  },
  {
    label: "Meeting notes",
    text: `Q2 planning meeting — March 12. Attendees: Sarah (CPO), Marco (Eng lead), Priya (Design), Leo (Marketing). Main topics: roadmap prioritization for Q2, hiring plan, and GTM for the new enterprise tier. Sarah confirmed budget for 3 new hires: 2 senior engineers and 1 product designer. Marco flagged that the mobile app rewrite is 3 weeks behind schedule due to dependency issues with the auth library. Priya presented 3 UI concepts for the new dashboard — the team voted to move forward with option 2. Leo shared that the enterprise landing page is ready for review and will go live April 1st. Next sync is scheduled for March 26.`,
  },
  {
    label: "Research abstract",
    text: `This paper presents a novel approach to real-time anomaly detection in distributed systems using transformer-based architectures. Traditional threshold-based methods fail to capture complex temporal dependencies across microservices, leading to both false positives and missed incidents. Our method, AnomalyBERT, pre-trains on 18 months of system telemetry from 12 production services and fine-tunes on labeled incident data. In evaluation on the OpenTelemetry benchmark, AnomalyBERT achieves an F1 score of 0.94, outperforming the previous state-of-the-art by 11 percentage points while reducing mean time to detection by 40%. The model is open-sourced and integrates directly with Prometheus and Grafana.`,
  },
];

function ContentSummarizerDemo() {
  const [text, setText] = useState(SUMMARIZER_SAMPLES[0].text);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setSummary(null);
    setError(null);
    try {
      const res = await runWorkflow("content-summarizer", { text });
      if (res.status === "completed") {
        setSummary(String(res.outputs["result"]?.[0] ?? "(no output)"));
      } else {
        setError(res.error ?? "Workflow failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="demo-card" data-testid="content-summarizer-demo">
      <div className="demo-card-header">
        <span className="demo-icon">📝</span>
        <div>
          <h2>AI Content Summarizer</h2>
          <p className="demo-description">
            A <code>nodetool.agents.Summarizer</code> node powered by{" "}
            <code>gpt-4o-mini</code> condenses any long-form content into a crisp
            summary. The kind of feature teams embed in{" "}
            <strong className="value-highlight">email clients, wikis, and CRMs</strong>.
          </p>
        </div>
      </div>

      <div className="sample-bar">
        {SUMMARIZER_SAMPLES.map((s) => (
          <button
            key={s.label}
            className={`sample-chip ${text === s.text ? "active" : ""}`}
            onClick={() => setText(s.text)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="field-group">
        <label className="field-label">Content to summarize</label>
        <textarea
          className="field-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="summarizer-text-input"
          rows={6}
          placeholder="Paste any text…"
        />
      </div>

      <button
        className="run-button"
        onClick={handleRun}
        disabled={loading || !text.trim()}
        data-testid="run-content-summarizer"
      >
        {loading ? "Summarizing…" : "🤖 Summarize with AI"}
      </button>

      {summary !== null && (
        <div className="result-box success" data-testid="content-summarizer-result">
          <span className="result-label">Summary</span>
          <span className="result-value summary-text">{summary}</span>
        </div>
      )}
      {error !== null && (
        <div className="result-box error" data-testid="summarizer-error">
          <span className="result-label">Error</span>
          <span className="result-value">{error}</span>
        </div>
      )}

      <div className="workflow-diagram">
        <span className="wf-node input-node">Long Text</span>
        <span className="wf-arrow">→</span>
        <span className="wf-node ai-node">Summarizer (GPT-4o Mini)</span>
        <span className="wf-arrow">→</span>
        <span className="wf-node output-node">summary</span>
      </div>
    </section>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main className="main">
      <header className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">
            <span className="brand">NodeTool</span> AI Workflows
          </h1>
          <p className="hero-sub">
            Production-ready AI pipelines running directly in Next.js via{" "}
            <code>@nodetool/kernel</code> — no external server, no Python runtime.
          </p>
          <div className="badge-row">
            <span className="badge">@nodetool/kernel</span>
            <span className="badge">@nodetool/base-nodes</span>
            <span className="badge">@nodetool/runtime</span>
            <span className="badge">GPT-4o Mini</span>
            <span className="badge">Next.js 15</span>
          </div>
        </div>
      </header>

      <div className="demos">
        <SupportTriageDemo />
        <ContentSummarizerDemo />
      </div>

      <footer className="footer">
        <p>
          Source:{" "}
          <a
            href="https://github.com/nodetool-ai/nodetool"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/nodetool-ai/nodetool
          </a>
        </p>
      </footer>

      <style>{`
        .main {
          max-width: 920px;
          margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
        }

        /* Hero */
        .hero {
          text-align: center;
          padding: 3rem 0 2rem;
        }
        .hero-title {
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin-bottom: 0.75rem;
        }
        .brand {
          background: linear-gradient(135deg, #6366f1, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-sub {
          color: #94a3b8;
          font-size: 1.05rem;
          margin-bottom: 1.25rem;
        }
        .hero-sub code {
          background: #1e1e2e;
          border: 1px solid #2d2d3f;
          border-radius: 4px;
          padding: 1px 6px;
          font-size: 0.9em;
          color: #a5b4fc;
        }
        .badge-row {
          display: flex;
          gap: 0.5rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        .badge {
          background: #1e1e2e;
          border: 1px solid #3b3b52;
          border-radius: 999px;
          padding: 3px 12px;
          font-size: 0.8rem;
          color: #a5b4fc;
          font-family: monospace;
        }

        /* Demos layout */
        .demos {
          display: flex;
          flex-direction: column;
          gap: 2rem;
          margin-top: 2rem;
        }

        /* Card */
        .demo-card {
          background: #161622;
          border: 1px solid #2a2a3e;
          border-radius: 16px;
          padding: 1.75rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .demo-card-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }
        .demo-icon {
          font-size: 2rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .demo-card h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 0.3rem;
        }
        .demo-description {
          color: #94a3b8;
          font-size: 0.9rem;
          line-height: 1.6;
        }
        .demo-description code {
          background: #1e1e2e;
          border: 1px solid #2d2d3f;
          border-radius: 4px;
          padding: 1px 5px;
          font-size: 0.85em;
          color: #a5b4fc;
        }
        .value-highlight {
          color: #a78bfa;
          font-weight: 600;
        }

        /* Sample chips */
        .sample-bar {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .sample-chip {
          background: #1e1e2e;
          border: 1px solid #3b3b52;
          border-radius: 999px;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.8rem;
          padding: 4px 12px;
          transition: border-color 0.15s, color 0.15s;
        }
        .sample-chip:hover {
          border-color: #6366f1;
          color: #e2e8f0;
        }
        .sample-chip.active {
          background: #1e1e2e;
          border-color: #6366f1;
          color: #a5b4fc;
        }

        /* Fields */
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          flex: 1;
        }
        .field-label {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
        }
        .field-textarea {
          background: #0f0f18;
          border: 1px solid #2a2a3e;
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 0.9rem;
          line-height: 1.6;
          padding: 0.75rem 0.9rem;
          resize: vertical;
          transition: border-color 0.15s;
          width: 100%;
          font-family: inherit;
        }
        .field-textarea:focus {
          outline: none;
          border-color: #6366f1;
        }

        /* Run button */
        .run-button {
          align-self: flex-start;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none;
          border-radius: 8px;
          color: #fff;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 600;
          padding: 0.6rem 1.5rem;
          transition: opacity 0.15s, transform 0.1s;
        }
        .run-button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .run-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        /* Triage result */
        .triage-result {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .triage-badge {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: #0d2218;
          border: 1px solid #16a34a;
          border-radius: 12px;
          padding: 0.85rem 1.25rem;
          flex: 1;
          min-width: 160px;
        }
        .badge-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }
        .badge-label {
          display: block;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
        }
        .badge-value {
          display: block;
          font-size: 1.1rem;
          font-weight: 700;
          color: #4ade80;
          margin-top: 2px;
        }
        .priority-badge .badge-value {
          color: inherit;
        }

        /* Result box */
        .result-box {
          border-radius: 10px;
          padding: 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .result-box.success {
          background: #0d2218;
          border: 1px solid #16a34a;
        }
        .result-box.error {
          background: #1f0a0a;
          border: 1px solid #dc2626;
        }
        .result-label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: #64748b;
        }
        .result-value {
          font-size: 1rem;
          font-weight: 500;
          word-break: break-word;
          line-height: 1.6;
        }
        .result-box.success .result-value {
          color: #4ade80;
        }
        .result-box.error .result-value {
          color: #f87171;
        }
        .summary-text {
          font-size: 0.95rem;
          color: #86efac;
        }

        /* Workflow diagram */
        .workflow-diagram {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          padding: 0.75rem 1rem;
          background: #0c0c15;
          border: 1px dashed #2a2a3e;
          border-radius: 8px;
          font-size: 0.78rem;
          overflow-x: auto;
        }
        .wf-node {
          border-radius: 6px;
          padding: 4px 10px;
          font-family: monospace;
          white-space: nowrap;
        }
        .input-node {
          background: #1e293b;
          border: 1px solid #334155;
          color: #94a3b8;
        }
        .ai-node {
          background: #1e1b4b;
          border: 1px solid #4338ca;
          color: #a5b4fc;
        }
        .output-node {
          background: #052e16;
          border: 1px solid #16a34a;
          color: #4ade80;
        }
        .wf-arrow {
          color: #475569;
          font-size: 0.9rem;
        }
        .wf-parallel {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .wf-branch {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* Footer */
        .footer {
          text-align: center;
          margin-top: 3rem;
          color: #475569;
          font-size: 0.85rem;
        }
        .footer a {
          color: #6366f1;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        @media (max-width: 600px) {
          .hero-title {
            font-size: 1.8rem;
          }
          .triage-result {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
