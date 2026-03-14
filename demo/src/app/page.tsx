"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface RunResult {
  status: "completed" | "failed" | "cancelled";
  outputs: Record<string, unknown[]>;
  error?: string;
}

type WorkflowId = "format-text" | "compare-numbers";

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

// ── Format-Text Demo ───────────────────────────────────────────────────────

function FormatTextDemo() {
  const [template, setTemplate] = useState("Hello {{ name }} from {{ city }}!");
  const [name, setName] = useState("Alice");
  const [city, setCity] = useState("Wonderland");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await runWorkflow("format-text", { template, name, city });
      if (res.status === "completed") {
        const output = res.outputs["result"]?.[0];
        setResult(String(output ?? "(no output)"));
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
    <section className="demo-card" data-testid="format-text-demo">
      <div className="demo-card-header">
        <span className="demo-icon">✏️</span>
        <div>
          <h2>Text Format Workflow</h2>
          <p className="demo-description">
            Uses <code>nodetool.text.FormatText</code> to render a Jinja2-style
            template with named variables.
          </p>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Template</label>
        <input
          className="field-input"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          data-testid="template-input"
          placeholder="Hello {{ name }} from {{ city }}!"
        />
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Name</label>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="name-input"
            placeholder="Alice"
          />
        </div>
        <div className="field-group">
          <label className="field-label">City</label>
          <input
            className="field-input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            data-testid="city-input"
            placeholder="Wonderland"
          />
        </div>
      </div>

      <button
        className="run-button"
        onClick={handleRun}
        disabled={loading}
        data-testid="run-format-text"
      >
        {loading ? "Running…" : "▶ Run Workflow"}
      </button>

      {result !== null && (
        <div className="result-box success" data-testid="format-text-result">
          <span className="result-label">Output</span>
          <span className="result-value">{result}</span>
        </div>
      )}
      {error !== null && (
        <div className="result-box error" data-testid="format-text-error">
          <span className="result-label">Error</span>
          <span className="result-value">{error}</span>
        </div>
      )}
    </section>
  );
}

// ── Compare-Numbers Demo ───────────────────────────────────────────────────

const OPERATORS = [">", "<", ">=", "<=", "==", "!="] as const;
type Operator = (typeof OPERATORS)[number];

function CompareNumbersDemo() {
  const [a, setA] = useState("10");
  const [b, setB] = useState("5");
  const [comparison, setComparison] = useState<Operator>(">");
  const [result, setResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await runWorkflow("compare-numbers", {
        a: Number(a),
        b: Number(b),
        comparison,
      });
      if (res.status === "completed") {
        const output = res.outputs["result"]?.[0];
        setResult(Boolean(output));
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
    <section className="demo-card" data-testid="compare-numbers-demo">
      <div className="demo-card-header">
        <span className="demo-icon">🔢</span>
        <div>
          <h2>Number Compare Workflow</h2>
          <p className="demo-description">
            Uses <code>nodetool.boolean.Compare</code> to evaluate a numeric
            comparison and return a boolean result.
          </p>
        </div>
      </div>

      <div className="field-row">
        <div className="field-group">
          <label className="field-label">Value A</label>
          <input
            className="field-input"
            type="number"
            value={a}
            onChange={(e) => setA(e.target.value)}
            data-testid="compare-a-input"
          />
        </div>

        <div className="field-group operator-group">
          <label className="field-label">Operator</label>
          <select
            className="field-select"
            value={comparison}
            onChange={(e) => setComparison(e.target.value as Operator)}
            data-testid="compare-op-select"
          >
            {OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label">Value B</label>
          <input
            className="field-input"
            type="number"
            value={b}
            onChange={(e) => setB(e.target.value)}
            data-testid="compare-b-input"
          />
        </div>
      </div>

      <button
        className="run-button"
        onClick={handleRun}
        disabled={loading}
        data-testid="run-compare-numbers"
      >
        {loading ? "Running…" : "▶ Run Workflow"}
      </button>

      {result !== null && (
        <div
          className={`result-box ${result ? "success" : "neutral"}`}
          data-testid="compare-numbers-result"
        >
          <span className="result-label">Result</span>
          <span className="result-value result-bool">
            {result ? "✅ true" : "❌ false"}
          </span>
          <span className="result-expression">
            {a} {comparison} {b}
          </span>
        </div>
      )}
      {error !== null && (
        <div className="result-box error" data-testid="compare-numbers-error">
          <span className="result-label">Error</span>
          <span className="result-value">{error}</span>
        </div>
      )}
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
            <span className="brand">NodeTool</span> Demo
          </h1>
          <p className="hero-sub">
            Two end-to-end workflows running directly via{" "}
            <code>@nodetool/kernel</code> — no external server required.
          </p>
          <div className="badge-row">
            <span className="badge">@nodetool/kernel</span>
            <span className="badge">@nodetool/base-nodes</span>
            <span className="badge">@nodetool/runtime</span>
            <span className="badge">Next.js 15</span>
          </div>
        </div>
      </header>

      <div className="demos">
        <FormatTextDemo />
        <CompareNumbersDemo />
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
          max-width: 900px;
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
          line-height: 1.5;
        }
        .demo-description code {
          background: #1e1e2e;
          border: 1px solid #2d2d3f;
          border-radius: 4px;
          padding: 1px 5px;
          font-size: 0.85em;
          color: #a5b4fc;
        }

        /* Fields */
        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          flex: 1;
        }
        .field-row {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
        }
        .operator-group {
          flex: 0 0 auto;
          min-width: 90px;
        }
        .field-label {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
        }
        .field-input,
        .field-select {
          background: #0f0f18;
          border: 1px solid #2a2a3e;
          border-radius: 8px;
          color: #e2e8f0;
          font-size: 0.95rem;
          padding: 0.6rem 0.85rem;
          width: 100%;
          transition: border-color 0.15s;
          appearance: none;
        }
        .field-input:focus,
        .field-select:focus {
          outline: none;
          border-color: #6366f1;
        }
        .field-select {
          cursor: pointer;
          padding-right: 0.85rem;
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
        .result-box.neutral {
          background: #1a1a2e;
          border: 1px solid #4b5563;
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
          font-size: 1.1rem;
          font-weight: 600;
          word-break: break-word;
        }
        .result-box.success .result-value {
          color: #4ade80;
        }
        .result-box.neutral .result-value {
          color: #f87171;
        }
        .result-box.error .result-value {
          color: #f87171;
        }
        .result-bool {
          font-size: 1.3rem;
        }
        .result-expression {
          font-size: 0.85rem;
          color: #64748b;
          font-family: monospace;
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
          .field-row {
            flex-direction: column;
          }
          .hero-title {
            font-size: 1.8rem;
          }
        }
      `}</style>
    </main>
  );
}
