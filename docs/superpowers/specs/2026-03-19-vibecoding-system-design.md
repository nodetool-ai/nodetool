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
                                │       └── run-workflow.ts   ← static kernel wrapper
                                ├── globals.css               ← theme (CSS custom props)
                                └── package.json
```

**Key invariants:**
- The workspace directory is the source of truth — not NodeTool's database.
- The Next.js dev server is managed by NodeTool (Electron main process) and runs while the VibeCoding panel is open.
- **Publish** = snapshot `workflow.json` into `src/workflows/<slug>.json` + `git commit`.
- **Deploy** = `git push` → Vercel CI builds and serves.
- Deployed apps have zero NodeTool runtime dependency. They run workflows via `@nodetool/kernel` in Vercel serverless functions.

### Workspace Template

On first connection of a workflow to a workspace, NodeTool scaffolds the workspace from a canonical template (fork of `demo/`). The template includes:
- Next.js 15 + Turbopack
- shadcn/ui + Tailwind v4
- `src/lib/run-workflow.ts` (static, never modified)
- `src/components/blocks/` (static block components)
- `.env.example` with `OPENAI_API_KEY`
- `vercel.json` for serverless function config

---

## Section 2: VibeCoding Panel (Replacing Current System)

The existing `VibeCodingPanel`, `VibeCodingChat`, `VibeCodingPreview`, and `VibeCodingModal` components are replaced. The new panel has three modes:

### Modes

**Chat mode** (default, same as today's entry point)
- Left pane: Chat interface. AI receives the full content of `page.tsx` as context on every message.
- AI writes `.tsx` files directly to disk. File writes trigger Next.js HMR.
- Right pane: iframe → `http://localhost:{port}` (live dev server).

**WYSIWYG mode** (activated by toolbar toggle after initial generation)
- Overlays the iframe with a transparent pointer-intercept layer.
- Click → select → property panel or AI-assisted edit (see Section 3).
- Component palette sidebar for drag-insert.

**Theme mode** (toolbar toggle)
- Visual editor for `globals.css` CSS custom properties.
- Changes write directly to `globals.css`, HMR updates preview instantly.

### Panel Header

```
[⚡ VibeCoding]  [Chat | WYSIWYG | Theme]     [Publish]  [Deploy ↗]  [your-app.vercel.app]
```

- **Publish**: snapshot workflow DSL + git commit.
- **Deploy**: POST to Vercel deploy hook. Active only after Vercel is connected.
- **Vercel URL**: shown after first successful deploy.

---

## Section 3: WYSIWYG Mechanism

### Element Identification

A Next.js compiler plugin (Babel transform, dev-only) injects `data-vibe-id="ComponentName:lineNumber"` onto every JSX element during development. Production builds strip these attributes.

### Selection Flow

1. Transparent overlay div intercepts pointer events on the iframe.
2. On click, `postMessage` sends `{ vibeId, boundingRect, currentProps }` to the NodeTool parent frame.
3. NodeTool reads the source file at the identified line to extract current prop values.

### Edit Modes from Selection

**Property panel** (simple edits — text, color, spacing):
- Rendered as a floating panel anchored to the selected element's bounding rect.
- Writes targeted replacements to the source file (no full AST parser — line-targeted string replacement for prop values).
- Covers: text content, Tailwind color classes, padding/margin classes, font size classes.

**AI-assisted edit** (structural changes):
- Selection context (`ComponentName`, surrounding JSX, file path, line range) is prepended automatically to the chat input.
- User types natural language: "make this a two-column grid" — AI writes coherent JSX back to the file.

### Component Palette

- Sidebar listing all `src/components/blocks/` components with previews.
- Drag onto preview overlay fires an AI instruction: "Insert `<ResultCard>` after the `<InputCard>` in `page.tsx`".
- AI handles the insertion and required imports.

### File Watcher → HMR Loop

All file writes (property panel or AI) are picked up by Next.js HMR automatically. No manual refresh needed.

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
  spawn(workspacePath: string): Promise<number>  // returns port
  kill(workspacePath: string): Promise<void>
  isRunning(workspacePath: string): boolean
  getPort(workspacePath: string): number | null
  getLogs(workspacePath: string): string[]        // last N lines of stderr
}
```

### Lifecycle

- **Open VibeCoding panel** → check if server running for workspace path. If not, spawn `next dev --port <available-port>`.
- **First run** → if `node_modules/` absent, run `npm install` first, show "Setting up workspace…" state.
- **Close panel** → server stays alive (avoids cold start). Killed on NodeTool exit or explicit user action.
- **Multiple workspaces** → each gets its own port (3001, 3002, …). Port registry in memory.

### Preview iframe

`http://localhost:{port}` — loaded directly in Electron renderer. No proxy needed (no CORS on localhost in Electron).

### Error Recovery

If the dev server crashes (TypeScript error, port conflict), the preview pane shows the last N lines of stderr. User fixes via chat; `next dev` restarts automatically on valid code.

---

## Section 7: Vercel Deployment

### Setup (One-Time per Workspace)

User pastes a Vercel deploy hook URL into the workspace settings. NodeTool stores it in workspace config. Alternatively, `vercel link` can be run in a terminal in the workspace directory.

### Publish Flow

1. User clicks **Publish** in VibeCoding panel header.
2. NodeTool copies `workflow.json` DSL into `src/workflows/<slug>.json`.
3. Runs `git add . && git commit -m "Publish: <workflow-name> [<timestamp>]"`.
4. Panel shows "Published" confirmation. Workflow version is now in git history.

### Deploy Flow

1. User clicks **Deploy ↗**.
2. NodeTool POSTs to the stored Vercel deploy hook URL.
3. Vercel pulls latest git commit, runs `next build`, deploys serverless functions.
4. NodeTool shows a link to the Vercel deployment URL once available.

### Runtime Requirements (Vercel side)

- `OPENAI_API_KEY` (or equivalent provider key) set in Vercel environment variables.
- No NodeTool server. Workflows run via `@nodetool/kernel` in Next.js API routes.

### Sync Indicator

If the workflow DSL in NodeTool has changed since the last publish, the panel header shows an "Out of sync" badge next to Publish. Clicking Publish resolves it.

---

## Implementation Scope (What Changes)

### Replaced
- `VibeCodingPanel.tsx` — full rewrite
- `VibeCodingChat.tsx` — rewritten (now edits files, not HTML blob)
- `VibeCodingPreview.tsx` — rewritten (iframe → localhost instead of srcDoc)
- `VibeCodingModal.tsx` — kept, wraps new panel

### New
- `VibeCodingWysiwyg.tsx` — overlay + selection + property panel
- `VibeCodingThemePanel.tsx` — CSS var editor
- `VibeCodingComponentPalette.tsx` — block component palette
- `WorkspaceDevServer` (Electron main) — process manager
- Babel/SWC plugin — `data-vibe-id` injection
- Workspace template repo — canonical Next.js scaffold
- `src/components/blocks/` — 8 block components

### Unchanged
- `VibeCodingStore` — state shape stays (session, messages, status); `currentHtml` replaced by `workspacePath + port`
- `utils/extractHtml.ts` — retired (no longer generating HTML blobs)
- `demo/` — becomes the reference implementation / workspace template source

---

## Open Questions

1. **Workspace template distribution**: Ship as a git submodule, an npm package, or a bundled zip in the Electron app?
2. **Multi-page apps**: v1 targets single `page.tsx`. Multi-route apps (e.g. `/spritesheet` route) deferred.
3. **Non-OpenAI providers**: The `run-workflow.ts` kernel wrapper already supports provider-agnostic model injection. Document the env var pattern for Anthropic/Gemini in the template.
