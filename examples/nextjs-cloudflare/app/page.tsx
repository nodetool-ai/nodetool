"use client";

import { useState } from "react";
import { SAMPLE_GRAPHS } from "@/lib/sampleGraphs";

type LogEntry = { kind: "message" | "result" | "error"; text: string };

export default function Home() {
  const [selectedId, setSelectedId] = useState(SAMPLE_GRAPHS[0].id);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);

  const selected =
    SAMPLE_GRAPHS.find((g) => g.id === selectedId) ?? SAMPLE_GRAPHS[0];

  function append(entry: LogEntry) {
    setLog((prev) => [...prev, entry]);
  }

  function handleEvent(raw: string) {
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    const dataStr = dataLines.join("\n");
    if (!dataStr) return;

    let parsed: unknown = dataStr;
    try {
      parsed = JSON.parse(dataStr);
    } catch {
      // Leave as the raw string.
    }

    if (event === "result") {
      const r = parsed as { outputs?: Record<string, unknown> };
      setOutputs(r?.outputs ?? {});
      append({ kind: "result", text: JSON.stringify(parsed, null, 2) });
    } else if (event === "error") {
      append({ kind: "error", text: JSON.stringify(parsed) });
    } else {
      const m = parsed as { type?: string; node_id?: string; status?: string };
      const label = m?.type
        ? `${m.type}${m.node_id ? ` · ${m.node_id}` : ""}${m.status ? ` · ${m.status}` : ""}`
        : dataStr;
      append({ kind: "message", text: label });
    }
  }

  async function run() {
    setRunning(true);
    setLog([]);
    setOutputs(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graph: selected.graph })
      });
      if (!res.ok || !res.body) {
        append({ kind: "error", text: `HTTP ${res.status}: ${await res.text()}` });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          handleEvent(buffer.slice(0, idx));
          buffer = buffer.slice(idx + 2);
        }
      }
    } catch (err) {
      append({ kind: "error", text: String(err) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="wrap">
      <h1>NodeTool · server-side workflow runner</h1>
      <p className="sub">
        The graph below is executed on Cloudflare Workers by{" "}
        <code>createWorkflowHandler</code> and streamed back as Server-Sent
        Events. No backend server required — just this Next.js route on workerd.
      </p>

      <section className="panel">
        <label htmlFor="graph">Sample workflow</label>
        <select
          id="graph"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={running}
        >
          {SAMPLE_GRAPHS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <p className="desc">{selected.description}</p>
        <button onClick={run} disabled={running}>
          {running ? "Running…" : "Run workflow"}
        </button>
      </section>

      <section className="panel">
        <h2>Stream</h2>
        {log.length === 0 ? (
          <p className="muted">Run a workflow to see messages stream in.</p>
        ) : (
          <ul className="log">
            {log.map((entry, i) => (
              <li key={i} className={entry.kind}>
                <pre>{entry.text}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outputs && (
        <section className="panel">
          <h2>Outputs</h2>
          <pre className="outputs">{JSON.stringify(outputs, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
