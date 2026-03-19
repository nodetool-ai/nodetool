# VibeCoding System Design

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Replace the current HTML-blob vibecoding system with a Next.js-first app builder with WYSIWYG editing, standardized components, theming, and one-click Vercel deployment.

---

## Overview

The VibeCoding system in `nodetool/web/src/components/vibecoding/` currently generates raw HTML blobs via AI chat and previews them in a sandboxed iframe. This design replaces that with a system where the output is a real Next.js project on disk — the same shape as `demo/` — which runs locally via a managed dev server, is visually edited via a click-overlay WYSIWYG layer, and deploys to Vercel as a self-contained app requiring no NodeTool server at runtime.

---

## Section 1: Overall Architecture

A NodeTool **Workspace** is an existing concept: one workflow can be connected to one workspace. The workspace is now a Next.js project directory on disk (matching the structure of `demo/`).

```
NodeTool (Electron)
└── Workflow ──connected to──► Workspace (Next.js project on disk)
                                ├── src/
                                │   ├── app/
                                │   │   └── page.tsx          ← AI generates/edits this
                                │   ├── components/
                                │   │   ├── ui/               ← shadcn/ui (never AI-modified)
                                │   │   └── blocks/           ← standardized AI-aware blocks
                                │   ├── workflows/
                                │   │   └── <slug>.json       ← snapshotted DSL on publish
                                │   └── lib/
                                │       └── run-workflow.ts   ← generated on publish (see below)
                                ├── globals.css               ← theme (CSS custom props)
                                └── package.json
```

**Key invariants:**
- The workspace directory is the source of truth — not NodeTool's database.
- The Next.js dev server is managed by NodeTool (Electron main process) and runs while the VibeCoding panel is open.
- **Publish** = snapshot `workflow.json` + generate `run-workflow.ts` with correct node registrations + `git commit`.
- **Deploy** = `git push origin <branch>` + POST to Vercel deploy hook.
- Deployed apps have zero NodeTool runtime dependency. They run workflows via `@nodetool/kernel` in Vercel serverless functions.

### Workspace Template

On first connection of a workflow to a workspace, NodeTool scaffolds the workspace from a canonical template bundled as a zip inside the Electron app package. This is the resolved answer to the distribution question: bundling as a zip keeps scaffolding offline-capable and deterministic. Template updates ship with new Electron releases.

The template includes:
- Next.js 15 + Turbopack
- shadcn/ui + Tailwind v4
- `src/components/blocks/` (static block components, never AI-modified)
- `.env.example` with `OPENAI_API_KEY` and notes for Anthropic/Gemini alternatives
- `vercel.json` for serverless function config
- Pre-initialized git repo (`git init` + initial commit) so Publish works immediately

`src/lib/run-workflow.ts` is **not** in the template — it is **generated** by the Publish step (see Section 7).

### v1 Node Type Scope

The Publish step generates `run-workflow.ts` by inspecting the workflow DSL and importing only the node types present in that workflow. v1 supports all node types available in `@nodetool/base-nodes`. Node types from other packages (e.g. `@nodetool/huggingface`) are out of scope for v1 Vercel deployment.

---

## Section 2: VibeCoding Panel (Replacing Current System)

The existing `VibeCodingPanel`, `VibeCodingChat`, `VibeCodingPreview`, and `VibeCodingModal` components are replaced. The new panel has three modes:

### Modes

**Chat mode** (default, same as today's entry point)
- Left pane: Chat interface. AI receives the full content of `page.tsx` as context on every message.
- AI writes `.tsx` files directly to disk. File writes trigger Next.js HMR.
- Right pane: iframe → `http://localhost:{port}` (live dev server).

**WYSIWYG mode** (activated by toolbar toggle after initial generation)
- A cosmetic highlight overlay renders selection boxes on the iframe.
- Click events are detected *inside* the iframe via injected listeners (see Section 3).
- Component palette sidebar for drag-insert.

**Theme mode** (toolbar toggle)
- Visual editor for `globals.css` CSS custom properties.
- Changes write directly to `globals.css`, HMR updates preview instantly.

### Panel Header

```
[⚡ VibeCoding]  [Chat | WYSIWYG | Theme]     [Publish]  [Deploy ↗]  [your-app.vercel.app]  [↺ Restart]
```

- **Publish**: snapshot workflow DSL + generate `run-workflow.ts` + git commit.
- **Deploy**: `git push` then POST to Vercel deploy hook. Active only after Vercel is connected.
- **Vercel URL**: shown after first successful deploy.
- **↺ Restart**: kills and respawns the dev server (shown when server is in error state).

### VibeCodingStore: New Session Shape

The existing store's `currentHtml` / `savedHtml` / `isDirty` are retired. The new session shape:

```typescript
interface VibeCodingSession {
  workspaceId: string;        // NodeTool workspace ID
  workspacePath: string;      // absolute path on disk
  port: number | null;        // dev server port (null = not yet running)
  serverStatus: "starting" | "running" | "error" | "stopped";
  serverLogs: string[];       // last 100 lines of stderr
  isPublished: boolean;       // true if last git commit matches current workflow DSL hash
  messages: Message[];        // chat history
  chatStatus: "idle" | "streaming" | "error";
}
```

`isDirty` is replaced by `isPublished: false` — set when NodeTool detects the workflow DSL has changed since the last publish (by comparing a hash of the current DSL against the hash stored at publish time). No git diff call needed at runtime.

The `persist` middleware is **removed** for this store — `workspacePath` and `port` are runtime state that should be rehydrated from disk on app restart, not from localStorage.

---

## Section 3: WYSIWYG Mechanism

### Element Identification

A Next.js compiler plugin (Babel/SWC transform, dev-only) does two things to every JSX element:
1. Injects `data-vibe-id="ComponentName:lineNumber"` attribute.
2. Injects an `onClick` listener that calls `window.parent.postMessage({ type: 'vibe-select', vibeId, boundingRect, outerHTML }, '*')`.

Production builds strip both injections entirely.

### Selection Flow

1. User enters WYSIWYG mode (toolbar toggle).
2. User clicks anywhere inside the preview iframe — the injected `onClick` fires and posts `{ type: 'vibe-select', vibeId, boundingRect, outerHTML }` to the NodeTool parent frame.
3. NodeTool receives the `message` event, draws a selection highlight overlay (absolutely positioned div matching `boundingRect`, rendered in the parent frame over the iframe).
4. NodeTool reads the source file at the line number from `vibeId` to extract current prop values.
5. Property panel opens anchored to the selection highlight.

The overlay div's only job is to render the selection highlight and the property panel. It does **not** intercept pointer events — user clicks pass through to the iframe normally.

### Property Panel: Scoped Edit Surface

The property panel supports **only** these edit cases in v1 (intentionally narrow to avoid unreliable regex replacement):
- **Static string children**: single-line JSX text like `<CardTitle>Hello</CardTitle>` — replaces the string literal.
- **Single-line `className` Tailwind tokens**: replaces individual tokens (e.g. swap `bg-blue-500` → `bg-red-500`) using token-aware splitting, not raw regex.
- **String prop values**: single-line string literals like `title="My App"` — replaces the quoted string.

Multi-line props, template literals, and JSX expressions (`{variable}`) are **not** editable via the property panel — the panel shows a "Use chat to edit" fallback for these cases.

Implementation uses `ts-morph` (already available in the Node.js environment) for reliable AST-based prop replacement. The "no full AST parser" constraint is dropped; `ts-morph` is lightweight enough for targeted single-node edits.

### AI-Assisted Edit (Structural Changes)

- Selection context (`ComponentName`, file path, line range, surrounding 20 lines of JSX) is prepended automatically to the chat input as a quoted block.
- User types natural language: "make this a two-column grid" — AI writes coherent JSX back to the file.
- Covers everything the property panel cannot.

### Component Palette

- Sidebar listing all `src/components/blocks/` components with prop signatures.
- Drag onto the preview area fires an AI instruction: "Insert `<ResultCard title="Result" />` after the `<InputCard>` in `page.tsx`". AI handles the insertion and required imports.

### File Watcher → HMR Loop

All file writes (property panel via `ts-morph` or AI) are picked up by Next.js HMR automatically. No manual refresh needed.

---

## Section 4: Component Library

### Layer 1: shadcn/ui (`src/components/ui/`)

The raw shadcn/ui primitives: `Button`, `Card`, `Textarea`, `Badge`, `Alert`, etc. These are **never modified by the AI** — they are the stable primitive layer.

### Layer 2: Block Components (`src/components/blocks/`)

Higher-level, AI-aware building blocks. The AI's system prompt includes the full TypeScript prop signature for each block. The AI generates pages by composing these blocks, not by inventing bespoke JSX.

| Component | Purpose |
|---|---|
| `AppHeader` | Title, subtitle, icon, optional badge |
| `StepIndicator` | Multi-step progress (N steps, current/done/pending states) |
| `InputCard` | Card with Textarea + sample chip selectors |
| `ResultCard` | Result display with accent color variants (success/warning/error) |
| `LoadingCard` | Spinner + optional workflow node visualization |
| `SampleChips` | Clickable example prompts |
| `MediaOutput` | Image, audio, or video result display |
| `ErrorAlert` | Formatted error state |

Block components accept a `theme` prop for per-instance accent color overrides, falling back to CSS custom properties.

---

## Section 5: Theming

### Mechanism

`globals.css` is the theme file — already CSS custom properties in the `demo/` template. The Theme panel in VibeCoding exposes visual controls that write directly to `globals.css`.

### Theme Panel Controls

| Control | CSS variable(s) |
|---|---|
| Accent color picker | `--primary`, gradient classes on buttons |
| Background mood | `--background`, body gradient |
| Border radius | `--radius` (all radii scale from this) |
| Font picker | Google Fonts `<link>` in `layout.tsx` + `--font-sans` |

### AI Theming

Chat commands like "make it green" or "use a warm dark theme" instruct the AI to edit `globals.css` CSS variable values. The AI does not touch component files for theming — only `globals.css`.

### Theme Presets

The workspace template ships with 3-4 named presets (e.g. `dark-indigo` matching `demo/`, `dark-emerald`, `light-neutral`). Presets are applied by overwriting the `:root` and `.dark` blocks in `globals.css`.

---

## Section 6: Dev Server Management

### Electron Main Process: `WorkspaceDevServer`

```typescript
interface WorkspaceDevServer {
  spawn(workspacePath: string): Promise<number>   // returns port; runs npm install first if needed
  kill(workspacePath: string): Promise<void>
  respawn(workspacePath: string): Promise<number> // kill + spawn
  isRunning(workspacePath: string): boolean
  getPort(workspacePath: string): number | null
  getLogs(workspacePath: string): string[]         // last 100 lines of combined stdout/stderr
}
```

### Lifecycle

- **Open VibeCoding panel** → check if server running for workspace path. If not, spawn `next dev --port <available-port>`.
- **First run** → if `node_modules/` absent, run `npm install` first, show "Setting up workspace…" state in panel.
- **Close panel** → server stays alive (avoids cold start). Killed on NodeTool exit.
- **Multiple workspaces** → each gets its own port (3001, 3002, …). Port registry in memory.

### Preview iframe

`http://localhost:{port}` — loaded directly in Electron renderer. No proxy needed (no CORS on localhost in Electron).

### Error Recovery: Two Cases

**Case A — TypeScript/JSX compile error (server stays up):**
- Next.js HMR shows an error overlay inside the iframe automatically.
- The panel shows the last 10 lines of stderr in a collapsible log section below the preview.
- User fixes via chat; HMR recovers without restart.

**Case B — Process crash (server exits):**
- `WorkspaceDevServer` auto-respawns the process with 2s backoff, up to 3 attempts.
- After 3 failed attempts, panel enters error state: preview goes blank, shows last N log lines, **↺ Restart** button becomes prominent.
- User can fix the underlying issue (e.g. via chat editing the offending file) then click ↺ Restart.

---

## Section 7: Vercel Deployment

### Setup (One-Time per Workspace)

**Prerequisites:**
1. A git remote must be configured for the workspace (`git remote add origin <url>`). NodeTool prompts for this in workspace settings if absent.
2. User pastes a Vercel deploy hook URL into workspace settings. NodeTool stores it alongside the workspace record.

### Publish Flow

1. User clicks **Publish** in VibeCoding panel header.
2. NodeTool inspects the workflow DSL, generates `src/lib/run-workflow.ts` with imports for every node type present in the workflow (from `@nodetool/base-nodes`).
3. Copies `workflow.json` DSL into `src/workflows/<slug>.json`.
4. Records a hash of the workflow DSL in workspace config (used to drive the sync indicator).
5. Runs `git add . && git commit -m "Publish: <workflow-name> [<timestamp>]"`.
6. Panel shows "Published ✓" confirmation.

### Deploy Flow

1. User clicks **Deploy ↗**.
2. NodeTool runs `git push origin <branch>`.
3. NodeTool POSTs to the stored Vercel deploy hook URL.
4. Vercel pulls the pushed commit, runs `next build`, deploys serverless functions.
5. NodeTool shows a link to the Vercel deployment URL once available.

### Runtime Requirements (Vercel side)

- `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` depending on the workflow's model provider) set in Vercel environment variables.
- No NodeTool server. Workflows run via `@nodetool/kernel` in Next.js API routes.

### Sync Indicator

If the workflow DSL hash in NodeTool differs from the hash recorded at last publish, the panel header shows an "Out of sync" badge next to Publish. Clicking Publish resolves it.

---

## Implementation Scope (What Changes)

### Replaced
- `VibeCodingPanel.tsx` — full rewrite
- `VibeCodingChat.tsx` — rewritten (now triggers file edits, not HTML blob updates)
- `VibeCodingPreview.tsx` — rewritten (iframe → `http://localhost:{port}` instead of `srcDoc`)
- `VibeCodingModal.tsx` — kept, wraps new panel
- `VibeCodingStore` — new session shape (see Section 2); `persist` middleware removed

### New
- `VibeCodingWysiwyg.tsx` — selection highlight overlay + property panel
- `VibeCodingThemePanel.tsx` — CSS var editor
- `VibeCodingComponentPalette.tsx` — block component palette
- `WorkspaceDevServer` (Electron main) — process manager with auto-respawn
- Babel/SWC plugin — dev-only `data-vibe-id` + `postMessage` injection
- Workspace template (bundled zip in Electron app) — canonical Next.js scaffold
- `src/components/blocks/` — 8 block components (shipped in template)
- Publish-time `run-workflow.ts` generator — inspects DSL, emits correct node imports

### Retired
- `utils/extractHtml.ts` — no longer generating HTML blobs
- HTML blob storage in `workflow.html_app` — superseded by workspace files

### Unchanged
- `VibeCodingModal.tsx` — wrapper only, no logic changes
- `demo/` — becomes the reference implementation and source for the workspace template
- NodeTool workspace data model — workspace-to-workflow connection is an existing concept

---

## Out of Scope for v1

- Multi-page Next.js apps (multiple routes). v1 targets single `page.tsx` per workspace.
- Node types outside `@nodetool/base-nodes` in deployed Vercel apps.
- GitHub OAuth integration. Git remote setup is manual.
- Per-app git repo isolation (Approach 1 from design exploration). All workflows share one repo per workspace.
