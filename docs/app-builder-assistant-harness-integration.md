# Design: Mini-App Harness in the App Builder Assistant

**Status:** Draft — for review
**Related:** [mini-app-build-harness-prd.md](mini-app-build-harness-prd.md) ·
[mini-app-build-harness-design.md](mini-app-build-harness-design.md) ·
[app-builder.md](app-builder.md) · `nodetool app debug` (AGENTS.md)

The best way to give the in-editor App Builder assistant the harness's
feedback loop, and the ways that look right but aren't.

---

## 1. The gap

The build-harness PRD closed the loop for batch builds: `buildApp` runs
spec → plan → author → check → run → judge, and `nodetool app debug` gives any
agent the oracle on demand. The **interactive** assistant — the *Ask Agent*
panel in the App Builder — got none of it. Today it:

- edits the document through the 19 `ui_app_*` tools
  (`web/src/lib/tools/builtin/puck.ts` → `PuckAgentBinder` → the shared
  doc-ops in `@nodetool-ai/app-runtime`);
- reads its own work back only via `ui_app_get_snapshot` and
  `ui_app_get_binding_targets`;
- can verify the *workflow* (`validate_workflow` / `debug_workflow` are
  resident tools) but not the *app*: no tool tells it whether a binding
  resolves, whether a click starts a run, or what a widget ends up showing.

The PRD named this in §2.1: "an agent in editor chat improvises this loop turn
by turn." The oracle exists (`simulateApp` in
`@nodetool-ai/execution/app-debug`); the editor assistant just can't reach it.
There is no `/api/applications/:id/debug` route and no app-level tool on
either the server or the frontend surface.

## 2. The fact that decides the design

**The assistant edits an unsaved draft.** The document lives in React state
(`AppBuilderShell`) plus Puck's own state; the `applications` row updates only
when the user saves (tRPC `applications.update`). Any verification keyed on
`application_id` reads the *row*, so it would grade a stale document while the
assistant keeps editing the live one — a verdict that lies exactly when the
assistant most needs it (mid-edit).

So the primary integration must carry the **live document inline** to the
server, the way `validate_workflow` accepts an inline `graph`. Everything
below follows from that.

## 3. Design

Three pieces, smallest first. Each reuses a seam the harness already cut.

### 3.1 Server route: `POST /api/applications/debug`

A sibling of `POST /api/applications/build`, in a new
`packages/websocket/src/lib/app-debug-service.ts`:

```
POST /api/applications/debug {
  application_id?: string,      // saved app — read the row
  document?: unknown,           // OR the live draft, verbatim
  params?: Record<string, unknown>,
  interact?: InteractionStep[], // the app-debug script language
  run?: boolean,                // false = static wiring check only (ms, free)
  timeout_ms?: number
}  →  compacted AppDebugReport (§3.4)
```

Implementation is assembly, not new machinery:

- **Runner:** extract `buildRunner` from `app-build-service.ts` (one
  `ExecutionSession` per run over an in-memory graph, nothing persisted) into
  a shared helper both services use. It already satisfies
  `AppServerRunInput → AppServerRunOutcome`, the only contract `simulateApp`
  has with any kernel runner.
- **Target resolution:** the `document` path builds a `ResolvedAppTarget`
  from the inline document with graphs loaded per operation via
  `Workflow.find(userId, id).getGraph()`. The `application_id` path needs the
  application-row resolution that today lives in
  `packages/cli/src/app-debug/app-target.ts` (`resolveApplication`,
  `hostGraphFor`). Move that piece into `@nodetool-ai/execution/app-debug`
  with its loaders injected — the same relocation the build-harness design
  did for the simulator itself, for the same reason: CLI and server surfaces
  must not drift. The CLI keeps file/DSL targets and re-exports.
- **Long runs:** register with `debugSessions` the way a build does, honoring
  `poll` for multi-minute runs. `interactive: true` (agent-answered
  escalations) composes later for free — the session machinery is shared.

### 3.2 Server tool: `debug_app`

Next to `debug_workflow` in `packages/agents/src/tools/mcp-tools.ts`: a thin
`apiPost` to the route, permission class `execute` (`run: false` requests are
read-shaped, but the tool can execute workflows, so it takes the conservative
class). Make it **resident** in `RESIDENT_TOOL_NAMES`
(`unified-websocket-runner.ts`) and teach it in `CHAT_AGENT_SYSTEM_PROMPT` as
the app half of the existing plan → validate → create → debug loop. This
serves every chat surface — global chat debugging a saved app included — not
just the builder panel.

### 3.3 Frontend tool: `ui_app_debug`

The piece that closes the loop on the *draft*. One new tool in
`web/src/lib/tools/builtin/puck.ts`:

1. `getPuckAgentHandler(application_id)` — add a `document()` accessor to
   `PuckAgentHandler` that assembles the current working document (Puck data +
   meta), mirroring the headless bridge's existing `document()`.
2. POST it as the route's inline `document`.
3. Return the compacted report.

Args: `{ application_id, run?, params?, interact? }`. With `run: false` it is
the free static check (`app debug --no-run`); with `run: true` and no
`interact` the simulator's `defaultInteractions` click the app's natural
trigger. The assistant can script multi-step flows (`set`, `click`, `run`,
`seedResource`, …) in the same `InteractionStep` vocabulary the CLI and the
build harness use — no new language.

### 3.4 One compacted report shape

`AppDebugReport` is bundle-sized; a chat turn needs the verdict. Add a
`summarizeAppReport(report)` reducer in `@nodetool-ai/execution/app-debug`
returning: `verdict` (ok, headline, issues, warnings), per-widget end state
(`id`, `type`, `binding`, `hasValue`, `visible`, `disabled`, `display`
preview), invocation outcomes (status, decision, error), value previews, and
`notSimulated`. Both `debug_app` and `ui_app_debug` return this one shape —
the "summary reducer lives in `execution` so surfaces cannot drift" rule
`debug_workflow` already follows.

### 3.5 Prompt: teach the loop, retire the folklore

`APP_BUILDER_SYSTEM_PROMPT` (`AppBuilderAgentPanel.tsx`) predates operations,
variables, resources, and `ui_app_get_binding_targets`; its bare-name binding
advice survives only through the legacy fallback that resolves against
`operations[0]` — silently wrong on any multi-operation app. Rewrite it around
the harness loop:

- wire through `ui_app_get_binding_targets`, never guessed names;
- after any wiring change: `ui_app_debug { run: false }` — free, instant;
- before declaring the app done: `ui_app_debug { run: true }` once, read the
  verdict, fix what it names. A run executes real workflows and spends real
  money — check often, run once.
- for "build me an app" with nothing open: the same sequence from an empty
  document — author the workflow, declare the operation, place the widgets,
  grade it with `ui_app_debug`. There is no one-shot build tool on the belt;
  the batch harness stays a CLI and HTTP surface.

## 4. Rejected alternatives

- **Run `buildApp`'s repair loop inside the assistant.** The conversation *is*
  the repair loop — the user plays judge and complaint-writer. What the
  assistant lacks is the oracle, not the orchestration. Wiring `buildApp` in
  would put two repair loops in one session, fighting over the document.
- **Save-then-debug as the primary path** (tool reads the row, user must save
  first). Simple, but grades a stale document mid-edit; verdicts that
  sometimes describe an older draft are worse than none. The `application_id`
  path stays for saved apps; it just isn't what the builder panel uses.
- **Client-side simulation.** The simulator's fold is shared code
  (`@nodetool-ai/app-runtime`), but its runs need the kernel; shipping kernel
  execution to the browser buys nothing over one HTTP round-trip to the same
  server that already runs builds.
- **A judge stage in the interactive loop.** The judge exists because batch
  builds have no human; here the human is present. The structural verdict is
  the right ceiling for a tool call.

## 5. Milestones

1. **M1 — Route + service.** Shared runner extraction, application-target
   relocation into `execution/app-debug`, `POST /api/applications/debug` with
   inline-document support, `summarizeAppReport`. Tests mirror
   `app-build-route.test.ts`.
2. **M2 — `debug_app`.** Tool + resident registration + chat system-prompt
   paragraph. Serves all chat surfaces immediately.
3. **M3 — `ui_app_debug`.** `PuckAgentHandler.document()`, the frontend tool,
   headless-bridge mirror (so the `app-tools` eval can score the
   check-before-done behavior), `APP_BUILDER_SYSTEM_PROMPT` rewrite.
4. **M4 — Composition.** `poll` for long runs, `interactive: true`
   escalations, and an eval case that fails an assistant which declares an app
   done without a green run.

## 6. Failure modes

| Failure | Resolution |
| --- | --- |
| Inline document references a workflow the user can't read | Per-operation `unavailable`, reported in the verdict — the simulator already models this |
| Run exceeds `timeout_ms` | Invocation reports `timedOutMs`; verdict issue; no parked session |
| Draft diverges mid-request (user edits while the tool runs) | The report names the document version it graded; the tool result says "as of this snapshot" |
| Cost runaway from repeated `run: true` | Prompt discipline plus the same per-run timeout; runs land in the prediction ledger like every kernel run |
