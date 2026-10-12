# @nodetool-ai/app-export

Exports a NodeTool mini app as a standalone JavaScript project. The project
runs the app without a NodeTool server: `npm install && npm run dev`.

The CLI (`nodetool apps export-project`), the server
(`GET /api/applications/:id/export-project`) and the web command menu
("Export App as Standalone Project") all build the project here.

## What the project contains

| Path | Role |
| --- | --- |
| `app.bundle.json` | The app's `ApplicationBundle`: the UI document and every workflow graph it runs |
| `src/` | A Vite + React UI that renders the document. Bindings, run policies, conditions and the message fold come from `@nodetool-ai/app-runtime`, so the app behaves as it does in NodeTool |
| `server/index.mjs` | One Node process: the UI (Vite middleware with `--dev`, `dist/` otherwise) plus `POST /api/run`, `POST /api/upload`, `GET /api/storage/*`, `GET /api/models` and `GET /api/package-assets/*` |
| `server/runner.mjs` | Runs a bundled graph by its key through `ExecutionSession` from `@nodetool-ai/execution`. The browser cannot send a graph of its own |
| `server/models.mjs` | The catalog behind `ModelSelect`: the models of every provider with a key in `.env` |
| `server/media.mjs` | Turns run outputs into URLs the browser loads, and uploaded files back into URIs a node reads |
| `assets/` | Copies of the `package://` sample files the app references |
| `.env.example` | The credentials the graphs need, read by the server and never sent to the browser |

The project depends on the published `@nodetool-ai/*` packages at the
exporter's own version.

## What it does not do

`exportWarnings` names each of these for the app being exported, and the
project's README repeats them.

- Operations that run a JS script fail with a message. Scripts run in
  NodeTool's sandbox only.
- Resource bindings, `ResourcePicker`, `ResourceGallery` and the storyboard
  editors need NodeTool documents and render a note.
- `Sketch`, `Timeline` and `Storyboard` widgets render a note instead of the
  editor.
- Nodes that need a NodeTool database, the Python bridge or a local workspace
  fail at run time.

## The template

`template/` is the project the exporter writes, kept as real files so it can
be typechecked (`npm run lint` checks it with `template/tsconfig.json`). The
exporter reads it from `src/template-files.generated.ts`. After editing a
template file, run:

```bash
npm run embed-template --workspace=packages/app-export
```

A test fails when the generated module is stale.
