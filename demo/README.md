# NodeTool Demo — Next.js

A full Next.js 15 demo app that runs two NodeTool workflows end-to-end using
`@nodetool/kernel`, `@nodetool/base-nodes`, and `@nodetool/runtime` — **no
external server required**.

![Demo UI](https://github.com/user-attachments/assets/02e81a73-3a27-47af-b04b-f214fe36158f)

## Workflows

| # | Workflow | Node | Description |
|---|---------|------|-------------|
| 1 | **Text Format** | `nodetool.text.FormatText` | Renders a Jinja2-style template with named variables |
| 2 | **Number Compare** | `nodetool.boolean.Compare` | Evaluates a numeric comparison and returns a boolean |

## Architecture

```
demo/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Client-side demo UI (React)
│   │   ├── layout.tsx             # Root layout + global styles
│   │   └── api/run-workflow/
│   │       └── route.ts           # POST /api/run-workflow (server action)
│   ├── lib/
│   │   └── run-workflow.ts        # Workflow runner (uses @nodetool/kernel)
│   └── workflows/
│       ├── format-text.json       # Workflow graph definition
│       └── compare-numbers.json   # Workflow graph definition
└── tests/
    ├── format-text.spec.ts        # Playwright e2e tests
    └── compare-numbers.spec.ts    # Playwright e2e tests
```

The API route (`/api/run-workflow`) runs entirely server-side:

1. Dynamically imports `@nodetool/kernel` (WorkflowRunner) and the specific
   base-node classes needed (`FormatTextNode`, `RerouteNode`, `CompareNode`).
2. Creates a `ProcessingContext` and `WorkflowRunner`.
3. Executes the workflow DAG and returns `{ status, outputs }` as JSON.

## Quick Start

```bash
# 1. From the repo root – build the packages first
npm run build:packages

# 2. Install deps (including the demo workspace)
npm install

# 3. Build and start the demo
cd demo
npm run build
npm run start       # http://localhost:3001
```

## Development

```bash
cd demo
npm run dev         # starts Next.js dev server on port 3001
```

## E2E Tests (Playwright)

```bash
# Build the app first (tests use the production build)
npm run build

# Run all 7 e2e tests
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui
```

The Playwright config starts the Next.js production server automatically and
runs tests against it.
