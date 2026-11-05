# Web chat parity

Parity remains open. “Matched” means the listed behavior has native fixture
coverage, not pixel equivalence. “Differs” means native offers the behavior
with another presentation or interaction. “Gap” means a web capability is
absent or incomplete.

## Current comparison

The comparison covers web
[message rendering](../../../web/src/components/chat/message/MessageView.tsx),
[execution rendering](../../../web/src/components/chat/message/AgentExecutionView.tsx),
the adjacent approval, plan, secret, compaction, media and Markdown components,
and the [chat reducer](../../../web/src/core/chat/chatProtocol.ts).

| Kind | State | Reason |
| --- | --- | --- |
| Text and mixed-part ordering | matched | Native preserves role text, Harmony cleanup and ordered text/tool/media parts. |
| Unknown content and null | matched | Unknown payloads remain retained and readable through fallback details. |
| Persisted tool results | matched | Full call IDs associate live and reloaded results without replacing arguments or raw history. |
| Tool grouping and phrasing | differs | Count/list rules, previews, MCP names, durations and individual expansion exist, but native uses buttons and surfaces instead of the web rail. |
| Specialized tool results | gap | Native pages result text/JSON without all web search/media result renderers or the aggregate timeline footer. |
| Code execution | differs | Code, output, copy and running/failure state exist, with paged plain code instead of highlighted code. |
| Sub-agent transcripts | differs | Live objectives and nested transcripts work in bounded lists, but fresh history lacks server-persisted child transcript tags, as on web. |
| Execution tree | gap | Tasks, steps, results and logs exist, but task durations, phase summary, earlier planning entries and the task inspector are not presented. |
| Thinking | differs | Timing, saved markup and retained expansion work, without shimmer or a rail; history needs server-supplied reasoning. |
| Markdown fences and tables | differs | Copyable fences and header-preserving table pages work, but nested fences and oversized individual table rows lack dedicated conformance coverage. |
| Syntax highlighting and math | gap | Code is unhighlighted and math remains readable source. |
| HTML and inline Markdown images | gap | Native keeps the plain-text fallback instead of rendering these constructs. |
| Markdown links | matched | Allowed external links retain their destinations and use tested light/dark theme colours. |
| Image results | gap | Authenticated previews and a large-image dialog work, but canvas insertion, drag actions and signed external storage URLs are unsupported. |
| Audio and video | gap | Duration, thumbnails and authenticated system-viewer actions exist, but there is no embedded player. |
| Media groups and predictions | differs | Shared metadata, progress, cost and errors work, with vertical rows instead of a grid or shimmer. |
| Documents | differs | Named documents expose paged text instead of a document viewer. |
| Resource mentions and navigation | gap | Typed Markdown-link chips exist, but bare/backticked/legacy mentions, inline previews and timeline resource-opening hooks are missing. |
| Tool approvals | gap | Per-call allow/deny and folded review work, but Allow for this chat and separate web code/argument folds are missing. |
| Plan approvals | differs | Run, revise with trimmed feedback and reject work, with single-line feedback and native typography. |
| Plan documents | matched | Object/string parsing, task/step counts, dependencies, instructions and execution notes follow the web parser cases. |
| Secret requests | differs | Native exposes settings and decline, deliberately without entering or saving credentials in chat. |
| Compaction | differs | Dedicated collapsed summaries omit the history prefix and use an explicit expansion button. |
| Error, stop and resume | differs | Native reconciles replay and shows turn errors, but exact web visual equivalence is unmeasured. |
| Embedded Assistant layout | differs | Shared-theme fixture checks cover dock widths, with horizontal scrolling below 320 px; the running timeline shell remains untested. |

The table contains 5 matched, 12 differs and 8 gap rows.

## Remaining decisions

- **D1.** Decide whether the 100 px dock minimum should permit horizontal chat
  scrolling or whether the timeline should enforce a wider Assistant dock.
  Chat currently retains a 320 px content width below that size.
- **D2.** Decide whether embedded media playback warrants a new chat dependency.
  The current component intentionally avoids timeline FFmpeg and private QRhi.
- **D3.** Decide which resource kinds the timeline should open, and whether
  canvas insertion and drag actions belong in this host.
- **D4.** Decide whether native should offer chat-wide tool grants and credential
  entry. Current actions remain explicit per-call approvals and settings/decline.
- **D5.** Decide the acceptance scope for math, syntax highlighting, HTML,
  specialized results and exact web visual treatment. These gaps are not waived.

Signed external media needs an authenticated resolution design. Recovering
reasoning and child transcripts after reload needs server persistence, not
native history writes. Platform screen-reader/IME acceptance, installed-app
playback, input-to-paint measurements and running-web visual comparison remain
unverified.

## Embedded width verification

The fallback test uses the same `ChatPanel` as
[TimelineAgentPanel](../../timeline/qml/aiassist/TimelineAgentPanel.qml), with
the shared `NodeTool.UiPrimitives` dark theme. It does not instantiate the
timeline shell or its planning-review footer. The chat QuickTest target links
the chat module rather than the timeline host.

Widths come from [dock presets](../../timeline/qml/dock/DockLayout.js):
320 px for Script, 360 px for Editing and 520 px for Assistant.
[DockLayoutStore](../../timeline/qml/dock/DockLayoutStore.cpp) permits a
100 px minimum. Tests render all four widths. This is fixture-based embedded
geometry coverage, not a running-host acceptance claim.

The initial width assertion failed at 100 px on detail buttons, approval
actions, the new-chat button and the composer. Long labels were elided at
ordinary dock widths. Tool/tree headings now wrap above their controls,
feedback spans the available width, and pagination controls wrap. At less
than 320 px a clipped horizontal viewport makes the full content reachable
instead of losing controls outside the dock. The supplied table, code and
image fixtures fit at 320 px without additional changes to their renderers.

`test_hostWidth` checks nine fixtures at all four widths and expanded tool,
thought, approval and sub-agent content. It enumerates visible descendants
and fails on horizontal geometry outside the content boundary. The deliberate
oversize test injects an item 50 px wider than the panel and expects that same
assertion to fail. Intentional horizontal scrolling is checked against its
content width and both ends remain reachable. The assertion does not establish
glyph-level coverage for arbitrary Markdown tables or every possible payload.

Evidence is under `/home/mg/Projects/nodetool-film/tmp/chat-parity/`:

- `host-{fixture}-{width}.png`, with fixtures `tool-presentation`,
  `execution-tree`, `thinking`, `markdown`, `plans-approvals`,
  `tool-approval`, `secret-request`, `media-resources` and `sub-agents`.
- Expanded captures add `-expanded` for tool groups, thinking, tool approval
  and sub-agents.
- `host-overflow-before.log` records the original width failures.
  `host-build.log` and `host-tests.log` record native verification.

The native build passed. CTest reports three passing entries, including setup.
Qt reports 37 model and 77 QML passes, with no failures or skips. The deliberate
oversize assertion reports XFAIL as expected. Both native design checks pass.

The native tests retain the existing 2,000-message, tool, thought, execution-log
and media coverage. This proves bounded delegates and state retention, not
scrolling frame latency. The strict design and dependency checks apply to the
QML changes. TypeScript tests, typecheck, lint, harness gate and `/verify` are
not run under this task's native-only scope.
