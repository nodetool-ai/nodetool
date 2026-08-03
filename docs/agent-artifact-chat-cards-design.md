# Agent Artifact Cards in Chat — Concept

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-03

---

## 1. Summary

When the agent creates or edits an asset, storyboard, script, sketch, timeline,
or mini app through its tools, the chat shows the raw tool result: a collapsed
`ToolCallCard` whose expanded body is pretty-printed JSON. A generated image
arrives as a URL inside a `<pre>` block. Ten timeline edits are ten identical
grey rows. The user cannot follow what the agent is building, and has nothing
to point at when giving feedback.

One primitive fixes both: an **`ArtifactRef`** — a small, well-known object a
tool result carries alongside its payload. The chat renders every `ArtifactRef`
as a **compact artifact card**: a thumbnail or per-kind summary, a label, what
changed, and two actions — *open in editor* and *reference in reply*.
Consecutive edits to the same document coalesce into one live card instead of a
row per call.

Tools opt in by returning the field. Nothing else changes: no new message
roles, no new persistence, no new transport. A tool without an `ArtifactRef`
renders exactly as today.

## 2. Design goals

1. **Progress is legible.** A glance at the thread shows *what* the agent has
   built so far — the artifacts, not the call log.
2. **Feedback has a target.** Every card can be referenced in a reply, so
   "make shot 3 darker" carries a machine-readable pointer to the storyboard
   and shot, not just prose.
3. **Zero migration.** The card is derived from the persisted `role: "tool"`
   message content, so old threads and reloaded threads render cards with no
   backfill. Tools that don't opt in are untouched.
4. **One shape, many kinds.** Assets, storyboards, scripts, sketches,
   timelines, apps, and workflows share one `ArtifactRef` type and one card
   component; only the summary line and preview differ per kind.
5. **Headlessly checkable.** The shape lives in `@nodetool-ai/protocol`, so the
   eval bridges in `packages/agents/src/evals/surfaces/` and the browser tools
   share it, and a tool-loop eval can assert "this case produced an artifact
   ref" without a browser.

## 3. Current state (what the concept builds on)

- **Tool-call UI exists.** `web/src/components/chat/message/MessageView.tsx`
  renders `ToolCallCard` / `ToolCallGroup` per assistant message; results are
  matched to calls via `toolResultsByCallId` in `ChatThreadView.tsx`.
- **The renderer seam is already reserved.**
  `web/src/components/chat/message/toolResults/ToolResult.tsx` selects a
  renderer by result *shape* and accepts a `toolName` prop documented "for
  future per-tool overrides" — currently unused.
- **All frontend tools share one result convention.** The 105 `ui_*` tools in
  `web/src/lib/tools/builtin/` return `{ok: true, ...payload}`; backend media
  tools (`generate_image`, `save_asset`, …) return
  `{type: "image", asset_id, asset_uri, …}` via `persistOutput`.
- **The document vocabulary exists.** `UiSurfaceType` / `UiDocumentRef` in
  `packages/protocol/src/api-types.ts` already name every editor surface, and
  `WorkspaceTabsStore.openTab` already opens any of them —
  `ui_storyboard_assemble_timeline` uses exactly this to open the assembled
  timeline.
- **What's missing** is the connective tissue: no result field the chat
  interprets, no per-kind preview, no coalescing, no reply-with-reference.

## 4. Architecture

```
Tool executes (browser ui_* tool or backend media tool)
  └─ result: { ok: true, ...payload, artifact: ArtifactRef }
       │
       ▼  (unchanged transport: tool_result → server → model + role:"tool" message)
ChatThreadView builds toolResultsByCallId (unchanged)
       │
       ▼
MessageView / ToolCallCard
  ├─ result carries artifact?  → render ArtifactCard in the collapsed row
  │    (JSON payload stays behind the existing expand chevron)
  └─ no artifact               → today's rendering, untouched
       │
       ▼  per-message coalescing
ToolCallGroup groups consecutive calls whose artifact has the same
(kind, id) → one card, "n edits", latest preview, expandable call list
       │
       ▼  card actions
open   → WorkspaceTabsStore.openTab({type: kind, ref: id})
reply  → composer attaches { artifactRef } → sent inside ui_context
```

### 4.1 The `ArtifactRef`

In `@nodetool-ai/protocol` (`api-types.ts`), next to `UiDocumentRef`:

```ts
export type ArtifactKind =
  | "asset"        // image / video / audio / document in the asset library
  | "sketch"
  | "storyboard"
  | "script"
  | "timeline"
  | "app"
  | "workflow"
  | "model3d";

export interface ArtifactRef {
  kind: ArtifactKind;
  id: string;                    // asset id or document id — pairs with UiDocumentRef
  label: string;                 // human name: asset filename, sequence name, script title
  action: "created" | "updated" | "deleted";
  preview?: {                    // optional; card falls back to a kind icon
    url?: string;                // thumbnail (storage_url after normalization)
    aspect?: number;
  };
  summary?: string;              // one line, kind-specific: "3 tracks · 42s", "8 shots"
  detail?: Record<string, string | number>;  // small labeled stats for the card footer
  version?: number;              // monotonic per document; coalescing keeps the highest
}
```

Deliberately **not** in the ref: the document itself, diffs, or nested
structures. The card is a pointer with a face, not a viewer — the editor tab is
the viewer.

### 4.2 Producing refs

Each tool bridge already knows its document; attaching a ref is a few lines at
the return site. The per-surface bridges get one shared helper each
(`makeTimelineArtifact(state)`, `makeStoryboardArtifact(doc)`, …) so the 17
timeline tools don't each hand-roll a summary.

| Kind | Who attaches it | Preview source | Summary |
|---|---|---|---|
| asset | `persistOutput` (backend), `ui_sketch_render_to_asset` | the asset itself — `materializeToolResultImages` already normalizes to a `storage_url` | mime + dimensions |
| sketch | sketch bridge mutating tools | throttled `render_to_asset`-style snapshot from the bridge | layer count |
| storyboard | storyboard bridge | first shot's keyframe; later a 3-frame strip | "8 shots · 2 with clips" |
| timeline | timeline bridge | existing frame-capture path (already used by `materializeToolResultImages`) | "3 tracks · 42s" |
| script | script bridge | none (icon) | "4 scenes · 1,200 words" |
| app | puck bridge | none in v1 | "5 widgets · 2 operations" |
| workflow | graph tools (`ui_add_node`, …) | none in v1 | "12 nodes · 14 edges" |
| model3d | model3d bridge | existing capture path | object count |

Read-only tools (`ui_timeline_get_state`, `ui_get_graph`, selection/seek tools)
attach nothing — a card means *the agent changed something*.

Preview cost rule: a mutation burst must not trigger a render per call. The
bridge throttles snapshot generation (once per coalescing window, see 4.4);
tools between snapshots return the ref with the previous preview and a bumped
`version`.

### 4.3 Rendering

- **`ArtifactCard`** — new component in
  `web/src/components/chat/message/toolResults/`, built from `ui_primitives`
  (`FlexRow`, `Text`, `Caption`), styled with new classNames beside
  `.tool-call-card` in `ChatThreadView.styles.ts`, icon/accent from the
  existing `getToolVisual` map. Compact: one row high with a small preview
  square, like `MediaOutputGroup`'s thumbnails, not a hero image.
- **Hook point 1 — collapsed row.** `ToolCallCard` checks
  `getArtifact(result)`; when present it renders the `ArtifactCard` as the
  row body. The expand chevron still opens Arguments/raw Result.
- **Hook point 2 — expanded result.** `ToolResult.tsx` finally uses its
  `toolName`/shape override: an artifact-bearing result renders the card
  above the JSON.
- **Media stays media.** `generate_image` results that today render as JSON
  become an asset card with the actual thumbnail — reusing `ImageView` sizing
  and the existing "Add to canvas" drag payload (`{type: "chat-media"}`), so
  a chat artifact can be dragged onto the graph like streamed generations
  already can.
- Virtualized rows re-measure via the existing `ResizeObserver` path in
  `ChatThreadView.tsx`, which already handles async image loads — cards need
  no new scroll machinery.

### 4.4 Coalescing

Ten `ui_timeline_*` edits in one assistant turn are one story, not ten cards.

- Scope: **within one assistant message's `ToolCallGroup`** (and within one
  `agent_execution` step group). Consecutive calls whose refs share
  `(kind, id)` collapse into one card showing the latest `version`'s preview
  and summary, badged "n edits". Expanding shows the individual calls —
  today's rows, unchanged.
- Live updates: while the run streams, `tool_call_update` /
  `tool_result_update` already re-render the group; the card simply reflects
  the newest ref. No new store state.
- Across messages there is no coalescing — a card per turn is the progress
  record the user scrolls back through.

### 4.5 Feedback: reference-in-reply

The second half of the request — "allows to give feedback" — is a composer
affordance, not a new protocol:

- Each card has a **reply action**. Clicking it attaches a chip to the
  composer (like a file attachment) holding the `ArtifactRef` — optionally
  narrowed by the editor's current selection (shot id, clip id, layer id),
  since selection tools already exist per surface.
- On send, the refs ride in the existing `ui_context` field (extend
  `UiContext` with `referenced?: UiDocumentRef[]` plus the sub-target), which
  the server already renders into the system prompt via `formatUiContext`.
  The agent sees "the user is talking about storyboard X, shot 3" and its
  tools can act on exactly that.
- *Open in editor* is the other action: `openTab({type, ref})`, the pattern
  `useAssembleTimeline` already established. `ArtifactKind` maps 1:1 onto
  `UiSurfaceType` for every document kind; assets open the asset viewer.

### 4.6 What this is not

- **Not a new message content type.** A `MessageArtifactContent` block was
  considered and rejected for v1: it needs persistence changes, touches the
  `hasContent` filtering in `ChatThreadView`, and duplicates information the
  tool result already carries. If artifacts ever need to appear *without* a
  tool call (e.g. server-side workflow runs pushing results into chat), that
  is the follow-up seam — `ArtifactRef` is designed to be liftable into a
  content block unchanged.
- **Not an inline editor.** Cards never grow edit controls; feedback goes
  through the composer, edits through the editor tab.
- **Not automatic tab-opening.** The agent creating a document does not steal
  focus; the card is the notification, opening is the user's click. The
  existing hard-coded opens (`assemble_timeline`) keep their behavior.

## 5. Server involvement

Almost none, by design:

- `processToolResult` in `packages/websocket/src/unified-websocket-runner.ts`
  already normalizes `{type, uri|data|asset_id}` values to storage URLs; it
  must simply **preserve `artifact`** (and normalize `artifact.preview.url`
  the same way). The model continues to see the JSON string — the ref is
  small and useful context ("you created asset X"), so it is not stripped.
- The persisted `role: "tool"` message keeps carrying the stringified result;
  the frontend parses the ref back out on thread reload. No schema migration.
- The `/ws/agent` bridge (`frontendToolsIpc.ts`) passes results through
  verbatim — nothing to do.

## 6. Phasing

1. **Phase 1 — the primitive and the payoff cases.** `ArtifactRef` in
   protocol; `getArtifact` helper; `ArtifactCard` with collapsed-row and
   expanded-result hook points; refs from `persistOutput` (all backend media
   tools at once) and `ui_sketch_render_to_asset`. Generated images stop
   being JSON.
2. **Phase 2 — document surfaces + coalescing.** Bridge helpers for
   timeline, storyboard, script, sketch, app, workflow, model3d; per-kind
   summaries; `(kind, id)` coalescing in `ToolCallGroup`; preview throttling.
3. **Phase 3 — feedback loop.** Reply-with-reference chips in the composer,
   `UiContext.referenced`, selection narrowing; *open in editor* action.
4. **Phase 4 (optional) — beyond tool calls.** Lift `ArtifactRef` into a
   message content block for server-initiated artifacts; artifact strip in
   the thread header ("everything built in this thread").

## 7. Testing

- Unit: `getArtifact` extraction and coalescing (Jest, next to the existing
  `MessageView.toolCalls.test.tsx`); `ArtifactCard` per kind with RTL.
- Eval bridges: the headless surfaces in
  `packages/agents/src/evals/surfaces/` return the same refs, so
  `tool-loop`-family cases can assert an artifact was produced — keeping the
  browser tools and bridges from drifting on this field.
- Reload: a thread with persisted tool messages renders the same cards as the
  live run (fixture-based Jest test on `ChatThreadView`).

## 8. Open questions

1. Should the workflow graph editor participate in v1, or is its existing
   `workflow_created`/`workflow_updated` handling folded in later? (The dead
   `lastWorkflowGraphUpdate` store field suggests an earlier attempt.)
2. Preview persistence: sketch/timeline snapshots are temp assets today —
   good enough for the live session, but reloaded threads would lose them.
   Acceptable for v1 (fall back to kind icon), or persist thumbnails?
3. Does the model need the ref? Keeping it in model context costs a few
   tokens per call but lets the agent refer to artifacts by id in prose;
   stripping it is a one-line change in `processToolResult` if it proves
   noisy.
