# E2E Workflow Runner

A browser-based end-to-end test harness that loads a list of workflows, executes
them one by one against the **real** NodeTool backend, and records everything
worth inspecting (logs, outputs, per-node IO, edge counters, artifacts, traces)
into a single self-contained HTML report that drops cleanly into a GitHub
Actions artifact.

It renders the actual nodetool ReactFlow canvas for the workflow under test, so
failures are visible, not just logged.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ web/e2e-runner.html  (Vite entry, served at /e2e-runner.html in dev)       │
│   └─ src/e2e_runner/                                                        │
│        entry.tsx          mounts the app                                    │
│        E2ERunnerApp.tsx   sidebar (per-workflow status) + ReactFlow canvas  │
│        harness.ts         loads manifest, runs each workflow, records IO    │
│        wsClient.ts        JSON text-mode WebSocket client (/ws)             │
│        graphRender.ts     raw graph → renderable ReactFlow graph            │
└──────────────────────────────────────────────────────────────────────────┘
        │ run_job (JSON over /ws, proxied by Vite to :7777)
        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ packages/websocket/src/e2e-server.ts                                       │
│   real backend (in-memory DB) · passthrough unknown nodes · real provider  │
│   when keyed else ScriptedProvider · NODETOOL_TRACE_FILE → JSONL traces     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Run it locally

```bash
# From web/
npm run test:e2e-runner            # boots backend + Vite, runs the suite headless
npm run test:e2e-runner:headed     # watch it run in a browser

# Open the page yourself against a running backend (npm run dev:server on :7777):
npm run e2e-suite:prepare          # build web/public/e2e-suite
npm start                          # Vite on :3000
# → http://localhost:3000/e2e-runner.html          (auto-runs the whole suite)
# → http://localhost:3000/e2e-runner.html?manual=1 (use the Run buttons)
```

## The suite

`web/tests/e2e-runner/suite.config.json` is the curated list. Each entry points
at a workflow graph in the repo, supplies `params`, optional `expect`
assertions, and optional `requiresSecrets`:

```json
{
  "id": "hello_input_output",
  "name": "Hello Input → Output",
  "sourceFile": "examples/workflows/hello_input_output_cli.json",
  "params": { "text": "hello from e2e" },
  "expect": { "status": "completed", "minOutputs": 1, "outputContains": "hello from e2e" }
}
```

`prepareSuite.ts` copies each graph into `web/public/e2e-suite/<id>.json` and
writes `manifest.json` (the file the harness fetches), recording which provider
API keys were present at build time in `secretsAvailable`.

- **Deterministic workflows** run in CI without any keys. Agent/LLM nodes fall
  back to a `ScriptedProvider` on the e2e-server, so they still complete.
- **Workflows that need real external providers** (image/video generation, etc.)
  should set `requiresSecrets`; they are **skipped** when the key is absent.

## Artifacts

Written under `web/test-results/e2e-runner/` (uploaded by CI as
`e2e-workflow-report`):

```
index.html                 self-contained report — open this
results.json               every RunRecord
traces.jsonl               OpenTelemetry spans (llm.chat tokens/cost, node/agent spans)
screenshots/<id>.png       canvas screenshot per workflow
workflows/<id>/record.json per-workflow record
workflows/<id>/outputs.json
workflows/<id>/events.json raw WebSocket message log
```

## Works with agents

The backend is the real runner, so agent workflows actually plan and execute.
Provide `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (locally as env vars, in CI as
repo secrets) to exercise real model calls; without them the suite stays green
via the deterministic scripted provider. Token usage and cost per `llm.chat`
span are captured in `traces.jsonl`.

## Adding a workflow

1. Add (or reference) the workflow graph JSON.
2. Add an entry to `suite.config.json`.
3. Run `npm run test:e2e-runner`.
