# User-journey suite

Drives the app the way a person does and asserts on what they would see.

The other Playwright suites answer narrower questions: the smoke suite asks
whether a route mounts, the visual suite whether it still looks right, the
e2e-runner whether the shipped templates execute, the benchmarks whether it is
fast. All four pass on a build where the Run button does nothing. This suite is
the one that fails.

## Running

```bash
npm run test:journeys          # headless
npm run test:journeys:headed   # watch it drive
npm run test:journeys:ui       # Playwright UI mode
npm run typecheck:journeys
```

Vite and the backend start automatically. A local `npm run dev` on :3000 is
reused.

## How it stays deterministic

`globalSetup.ts` starts the seeded backend
(`packages/websocket/src/screenshot-server.ts`) with
`NODETOOL_FAKE_PROVIDERS=1`. In that mode every LLM provider and every
external/media node resolves to a deterministic fake from
`packages/websocket/src/fake-runtime.ts` — no API keys, no network. Structural
and pure-compute nodes still run for real, so a run that produces the wrong
value fails rather than passing on a placeholder.

To tell "the fake is wrong" apart from "the app is broken", re-run against real
providers:

```bash
NODETOOL_FAKE_PROVIDERS=0 npm run test:journeys
```

## Fixtures

Seeded in `screenshot-server.ts`:

| Id | What it is |
| --- | --- |
| `wf-mini-app` | `StringInput → Output` echo graph plus an app document (input, Run button, Output widget). Used by the mini-app journey. |
| `wf-editor-journey` | The same graph in a separate row, so the editor journey's edits can't disturb the mini-app journey. |
| `thread-story` | Chat thread with existing messages. |

The echo graph is deliberately trivial: both nodes are structural, so the value
the UI shows after a run is genuinely the value that travelled through the
kernel.

## Writing a journey

Put selectors in `pages.ts`, not in specs — specs should read as journeys.
Prefer roles and labels; a raw class name (`.react-flow__node`,
`.search-result-item`) is a last resort for components that expose neither, and
should carry a comment saying so.

Take selectors from the running app rather than from source: several
plausible-looking ones don't exist at runtime, and a few exist but sit inside an
empty state, which will make an assertion pass for the wrong reason.

## State is shared

The suite runs with `workers: 1` against one in-memory backend, and journeys
mutate it — adding nodes, sending messages. Assert against a measured baseline
(`before + 1`) rather than an absolute count, and don't assume a pristine graph.

## Known gaps

- Three subgraph tests are `test.fixme`. Creating a SubgraphNode works;
  double-clicking it never opens its tab. Reproduced against both the hermetic
  backend and real providers, so it is a product bug, not a harness one. The
  spec previously lived at `tests/subgraph-e2e.spec.ts` where no CI workflow ran
  it, which is why it went unnoticed.
- Editing a node's property on the canvas is not covered. Clicks near the left
  icon rail get intercepted, and stray keystrokes land on canvas shortcuts
  (typing `b` bypasses the selected node). The mini-app journey covers
  value-in → result-out instead.
- `/workflows` renders an error boundary. Not covered here, and not in the smoke
  suite's route list either.
