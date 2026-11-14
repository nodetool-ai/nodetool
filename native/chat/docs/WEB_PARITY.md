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
| Tool grouping and phrasing | differs | Count/list rules, previews, MCP names, durations, individual expansion and the timeline footer ("Worked for", step count, folding) exist, with buttons and surfaces instead of the web rail. |
| Specialized tool results | matched | Web search results render as numbered linked rows with sources, and `generate_batch` calls show live batch progress with per-item status, timing, model, prompt and errors. |
| Code execution | matched | Code, output, copy and running/failure state exist, and code is highlighted with the web One Dark and One Light palettes. |
| Sub-agent transcripts | differs | Live objectives and nested transcripts work in bounded lists, but fresh history lacks server-persisted child transcript tags, as on web. |
| Execution tree | differs | Tasks, steps, results and logs show durations, a plan summary with progress, step counts and the planning log, but the task inspector is not presented. |
| Thinking | differs | Timing, saved markup, retained expansion, the rail and the running shimmer work; history needs server-supplied reasoning. |
| Markdown fences and tables | differs | Copyable fences and header-preserving table pages work, but nested fences and oversized individual table rows lack dedicated conformance coverage. |
| Syntax highlighting and math | differs | Fenced code is highlighted. Inline and display math render as Unicode text (fractions, roots, scripts, Greek, symbols) instead of KaTeX typesetting. |
| HTML and inline Markdown images | matched | Raw HTML is sanitized with the web allowlist before rendering, and Markdown images load through the authenticated media path with alt text and an open action. |
| Markdown links | matched | Allowed external links retain their destinations and use tested light/dark theme colours. |
| Image results | gap | Authenticated previews, a tile grid for consecutive images and a large-image dialog work, but canvas insertion, drag actions and signed external storage URLs are unsupported. |
| Audio and video | matched | An embedded player plays, pauses and seeks downloaded media when Qt Multimedia is present, and the system-viewer action remains as the fallback. |
| Media groups and predictions | differs | Shared metadata, progress, cost, errors and the image grid work, without shimmer. |
| Documents | differs | Named documents expose paged text instead of a document viewer. |
| Resource mentions and navigation | differs | Markdown-link, bare and backticked resource URIs become chips, and asset images preview inline. Legacy mention syntax and timeline resource-opening hooks are missing. |
| Tool approvals | matched | Per-call allow and deny, Allow for this chat, and separate code and argument folds follow ToolApprovalCard. |
| Plan approvals | differs | Run, revise with trimmed feedback and reject work, with single-line feedback and native typography. |
| Plan documents | matched | Object/string parsing, task/step counts, dependencies, instructions and execution notes follow the web parser cases. |
| Secret requests | matched | The key can be entered and saved in chat through the server secret store, with settings and Not now as alternatives. |
| Compaction | differs | Dedicated collapsed summaries omit the history prefix and use an explicit expansion button. |
| Error, stop and resume | differs | Native reconciles replay and shows turn errors, but exact web visual equivalence is unmeasured. |
| Embedded Assistant layout | differs | Shared-theme fixture checks cover dock widths, with horizontal scrolling below 320 px; the running timeline shell remains untested. |

The table contains 11 matched, 13 differs and 1 gap row.

## Remaining decisions

- **D1.** Decide whether the 100 px dock minimum should permit horizontal chat
  scrolling or whether the timeline should enforce a wider Assistant dock.
  Chat currently retains a 320 px content width below that size.
- **D3.** Decide which resource kinds the timeline should open, and whether
  canvas insertion and drag actions belong in this host.

Matthias decided D2, D4 and D5 by asking for parity across all message
content. Embedded playback uses optional Qt Multimedia, chat offers Allow for
this chat and key entry, and math, highlighting, HTML and specialized results
are rendered. Math remains Unicode text rather than typeset output.

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
