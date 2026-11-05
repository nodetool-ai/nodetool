# Web chat parity

## Audit scope

Inspected [MessageView](../../../web/src/components/chat/message/MessageView.tsx),
[content renderer](../../../web/src/components/chat/message/MessageContentRenderer.tsx),
[tool grouping](../../../web/src/components/chat/message/groupToolCalls.ts),
[tool phrasing](../../../web/src/components/chat/message/toolCallPhrase.ts),
[execution view](../../../web/src/components/chat/message/AgentExecutionView.tsx),
the adjacent approval, plan, secret, compaction, media, resource and Markdown components,
and [chat reducer](../../../web/src/core/chat/chatProtocol.ts).
The message schema accepts arbitrary role strings and string, array, object or null content.
This is a source inventory, not a claim that every row has visual acceptance coverage.

| Kind | Web | Native baseline | Gap |
| --- | --- | --- | --- |
| String / text blocks (all roles) | Markdown, Harmony cleanup, thought sections | Selectable paged Markdown, Harmony cleanup and ordered mixed parts | Native HTML and resource-link presentation differ |
| image_url | Resolved image, canvas action | Authenticated image preview | No canvas action |
| audio | Player | Fallback | Playback missing |
| video | Player | Fallback | Playback missing |
| document | Document text | Fallback | Document presentation missing |
| Unknown content / null | Renderer-dependent fallback | Generic fallback, raw model retained | Needs readable payload details |
| tool_calls / tool_call_update / tool_result_update | Phrased grouped rows with arguments and results | Raw JSON, result replaces arguments | Priority: retain call and render execution |
| execute_code | JavaScript code, title, copy, result, running state | Raw JSON, code lost after result | Priority: code and output presentation |
| run_subtask / run_search | Nested transcript and objective | Generic card | Nested transcripts missing |
| planning_update / task_update / log_update | Agent execution tree by execution ID and step | JSON cards | Execution tree missing |
| Thinking chunks / thought markup | Collapsible thinking with timing | C++ thought projection with timing and retained expansion | Fresh history requires server-supplied markup. Web shimmer and rail differ |
| Markdown fences / tables / math | Highlighted copyable code, GFM tables, KaTeX | Labelled copyable fences and header-preserving table pages | Syntax highlighting and math typesetting remain gaps |
| Media output groups / prediction | Grouped media, progress and generation metadata | Individual fallback cards | Grouping and metadata missing |
| Resource mentions | Typed chips, preview and navigation | Plain text | Native resource navigation integration missing |
| tool_approval_request | Review arguments, allow/deny | Approve/decline with authoritative ID | Detailed matching layout missing |
| plan_approval_request | Plan preview, feedback, approve/reject | Generic text and feedback actions | Structured plan preview missing |
| create_plan / plan document | Structured plan document | Generic tool card | Plan renderer missing |
| secret_request | Settings and decline | Decline | Provisioning stays in settings |
| compaction | Collapsible summary card | User message | Dedicated summary card missing |
| Error / stopped / resumed | Turn status and errors | Status and replay reconciliation | Visual parity not measured |

## Event inventory

The [processing union](../../../packages/protocol/src/messages.ts) declares:

`job_update`, `node_update`, `generation_complete`, `node_progress`, `edge_update`, `output_update`, `save_update`, `binary_update`, `log_update`, `notification`, `error`, `tool_call_update`, `tool_result_update`, `task_update`, `step_result`, `planning_update`, `chunk`, `todo_update`, `prediction`, `llm_call`, `provider_call_failed`.

The chat reducer also accepts `message`, `tool_call`, `tool_approval_request`, `plan_approval_request`, `secret_request`, `generation_stopped`, `workflow_created`, `workflow_updated`, `chat_turn_active`, and `chat_resumed`. `tool_result` is a client response.

The [socket schemas](../../../packages/protocol/src/ws-commands.ts) additionally declare connection and RPC frames:

`image`, `video`, `ping`, `pong`, `client_tools_manifest`, `tool_result`, `renderer_tool_result`, `tool_approval_response`, `plan_approval_response`, `secret_request_response`, `rpc_response`, `system_stats`, `run_trace`, `model_load_progress`, `resource_change`, `renderer_registered`, `renderer_tool_call`, `chat_resumed`, `chat_turn_active`, `job_resumed`, `resource_resync`.

These are transport/control events, not all message cards. Native routes threadless control separately, reduces text/message/error/resume/host tools, and preserves other thread events in generic parts.

## Reproduction

The fixtures `tool-calls.json` and `code-execution.json` use protocol-shaped sanitized events. They are deterministic examples, not captured private conversations. Replaying them before changes shows only the result JSON. The original arguments and code disappear. Screenshots and state dumps are under `/home/mg/Projects/nodetool-film/tmp/chat-parity/`, named `tool-calls-before` and `code-execution-before`.

## Implemented increment

Tool result updates retain the call arguments and update the owning row, including
when later messages have arrived. The projection supplies plain tool phrases,
running/done/failed state, arguments, result text, and JavaScript code separately.
QML uses monospaced bounded sections and copies the full code or result. Unknown
array parts expose their payload as readable details. Consecutive same-name parts
within one message fold into a group, excluding the web's ungroupable names.
The original parts remain in the model.

This increment does not close web parity. Remaining tool work includes persisted
role-tool result association, cross-message grouping, exact group preview/list
rules, MCP formatting, duration and prediction presentation, and expandable
individual call details within groups. Output is paged JSON rather than the web's
specialized search/media result renderers. Code has no syntax highlighting.

Later checkpoints below supersede the thinking and Markdown baseline. Sub-agent
reduction still needs dedicated state and fixtures. Agent trees, plan documents, compaction cards,
resource navigation and media playback need native renderers. Full math needs a
native typesetting capability. Approval actions remain explicit and retain the
existing decline path. Malformed requests without an authoritative approval ID
still cannot be answered safely.

The timeline panel was inspected: `TimelineAgentPanel.qml` embeds the same
`ChatPanel` and supplies its session. A running timeline-host visual check has
not been completed. No new QML file was added, so the migration ledger needs no
new entry.

## Verification of this increment

`ntbuild fix-win-4 nodetool-chat chat-model-tests chat-quick-tests` succeeded.
`citest fix-win-4 '^chat-(model|quick)-tests$' reports 100% passing, including
the prerequisite fixture setup. Model coverage includes retained arguments,
delayed results targeting one row, grouping, errors and 2,000 tool messages.
QML coverage includes code/result copy and bounded delegate count for 2,000
tool-call messages. This establishes virtualization, not measured scrolling
frame latency. Both native design and dependency checks passed.

After screenshots are `tool-calls-after.png` and `code-execution-after.png` in
the same evidence directory. Code/result text was visually inspected after
fixing an invalidated QJsonValueRef found in the first screenshot review.

TypeScript tests, fixture conformance in TypeScript, typecheck, lint, harness
gate and `/verify` were not run, as requested. Platform accessibility, full
timeline-host rendering and full web-content visual coverage were not run.

## Collapsed tool details checkpoint

Item 1 is partially implemented. Tool and code calls now start as a single
header row with their phrase, status and an explicit expand button. Arguments,
code and results are hidden until expanded. Failed calls keep a red `Failed`
label while collapsed. This matches `ToolCallRow`'s default closed details,
though native uses a labelled button and a bordered surface instead of the
web's clickable header, chevron and connecting rail.

Expansion belongs to the C++ `PartModel`, keyed by the full call ID with a
separate group key. Updates notify only the affected part row. Expansion
survives result updates and QML delegate recycling. It is presentation state,
never written into server history. Clearing or unloading history releases it.
Collapsed output supplies no text to the QML text layout. Expanded output
retains the existing selectable 4,096-character pages and full copy action.

The `compact-tools.json` fixture covers a completed read and failed code call.
Model tests check collapsed failure, retained code, expansion after a result,
unchanged raw snapshots and row-level notifications. QML tests check toggling,
code/result copy and expansion after scrolling through 2,000 tool messages.
The existing 2,000-message owning-row and virtualization checks still pass.
These checks do not establish frame latency.

Offscreen screenshots were inspected against the `ToolCallRow` source behavior:

- `/home/mg/Projects/nodetool-film/tmp/chat-parity/compact-tools-collapsed.png`
  shows two compact rows, no argument/result blocks and a visible failure.
- `/home/mg/Projects/nodetool-film/tmp/chat-parity/compact-tools-expanded.png`
  shows the failed call's code and result while the other call stays closed.

Set `CHAT_SCREENSHOT_DIR` when running `chat-quick-tests` to capture these states.
No running web screenshot comparison was performed. The migration ledger now
records interaction coverage for `MessageDelegate.qml`.

The requested sequence remains open:

| Item | Matched in this checkpoint | Still open |
| --- | --- | --- |
| 1. Tool presentation | Closed details, external expansion state, compact header, visible failure | Cross-message grouping, exact count/list/preview rules, complete phrasing, per-call expansion inside groups and web timeline footer |
| 2. Persisted history | No change | Role-tool results associated with persisted calls and live/reloaded equivalence |
| 3. Thinking | Chunk reduction, markup, timing and collapsible presentation | Server persistence of reasoning, web shimmer and rail |
| 4. Execution | No change | Execution ID/step tree and nested transcripts |
| 5. Markdown | Labelled fences, tables, Harmony cleanup and mixed ordering | Syntax highlighting and math typesetting. Math remains readable source |
| 6. Media/resources | No change | Grouping, progress, prediction metadata, playback/link metadata and typed resource navigation |
| 7. Plans | No change | Structured documents, approval preview and compaction card |
| 8. Timeline host | No change | Narrow embedded rendering and screenshot |

`ntbuild fix-win-4 nodetool-chat chat-model-tests chat-quick-tests` passed.
CTest reported all three selected tests passing, including fixture setup.
Qt reported 24 model and 20 QML passes, including initialization and cleanup,
with no failures or skips. Evidence is in `compact-tools-tests.log` beside the
screenshots. The shell wrapper encountered zsh's read-only `status` variable
after CTest finished, so acceptance uses the recorded CTest summary.
Both `check_design.py --strict` and `check_dependencies.py` passed.
No new dependencies or TypeScript changes were introduced. TypeScript tests,
typecheck, lint, harness gate, `/verify`, platform accessibility and timeline
host verification were not run.

## Tool grouping and phrasing

Tool-only assistant messages with one groupable name now retain the first row
identity while accumulating consecutive calls. The six web exclusions remain
individual calls. Runs of up to four location-bearing read, write or page calls
remain listed. Other runs show the shared message or counted headline, a unique
three-value preview and completion progress. Individual calls expand independently
inside counted groups. C++ owns the phrase classification, MCP name formatting,
URL details, grouping and expansion state. Timestamp-backed durations use the
web's formatting.

`tool-presentation.json` ports phrase and grouping examples from the web tests.
The model test verifies stable row identity and a single-row result notification.
QML tests exercise nested expansion and scroll stability as a trailing group
forms. The offscreen screenshot is
`/home/mg/Projects/nodetool-film/tmp/chat-parity/tool-presentation.png`.
Native still uses bordered surfaces and labelled expansion buttons. The web's
connecting rail, aggregate timeline footer and specialized result renderers are
not implemented. This is behavioral coverage, not a pixel comparison with web.


## Persisted tool history

Role-tool messages now supply a result overlay keyed by the full tool-call ID.
Their original payloads remain retained, including unknown fields. Calls and
server message content are not replaced by their presentation. No history-write
operation was added. Results arriving before their calls are retained until the
call is available. The same overlay handles live result updates, errors and
result timestamps, with notifications restricted to the owning row.

`persisted-tools.json` supplies equivalent live events and server messages.
The model test compares message identities, roles, text, timestamps, status and
rendered tool rows, including a grouped failure and code execution. It also
checks preserved server payloads, repeated-result stability and results arriving
before calls. The QML test checks failure, duration, expanded code and copy.
The inspected offscreen screenshot is
`/home/mg/Projects/nodetool-film/tmp/chat-parity/persisted-tools.png`.

The requested native build and CTest selection pass. Qt reports 26 model passes
and 23 QML passes, including setup and cleanup, without failures or skips.
CTest reports three passing tests including its prerequisite setup. The existing
2,000-message model and QML coverage passes. Both native design and dependency
checks pass. TypeScript tests, typecheck, lint, harness gate and `/verify` were
not run, as requested. No running-web pixel comparison, platform accessibility
check or timeline-host screenshot was performed.

## Thinking parity

`thinking.json` covers streamed reasoning and the equivalent saved markup.
C++ wraps thinking chunks in `<think>` blocks, closes them when an answer or
completion arrives, and retains them when the final message replaces the
placeholder. Saved `<think>` and `</redacted_thinking>` markup uses the same
projection. Sections open while thinking and fold on completion unless the
reader has overridden expansion. Timing and expansion live outside delegates.
An interrupted thought stops reading “Thinking”.

As on web, fresh history without timing reads “Thought”. Locally observed
completion reads “Thought for Ns”, rounded to whole seconds with a minimum of
one. The server does not persist reasoning chunks, so a fresh reload can only
show reasoning that exists in history. Native does not write its projection
back to the server. The web shimmer and timeline rail remain visual differences.

The native build passed. CTest passed all three selected tests, including setup.
Qt reported 27 model and 25 QML passes, with no failures or skips. Coverage
includes expansion after scrolling through 2,000 thought messages. Both native
design checks passed. The inspected offscreen screenshot is
`/home/mg/Projects/nodetool-film/tmp/chat-parity/thinking.png`.
TypeScript tests, typecheck, lint, harness gate and `/verify` were not run.
No dependencies were added.

## Markdown parity

`markdown.json` exercises labelled code with full-block copy, a table, an HTTPS
link, Harmony markers, math source and ordered text/tool/image/text content.
C++ prepares Markdown pages. Top-level backtick and tilde fences retain their
language and code identity across pages, including unfinished streaming fences.
Long tables repeat the header and split between rows. Ordinary prose remains
Markdown on later pages. Qt renders tables and standard links. HTTP, HTTPS and
mailto links use the existing external-link boundary. Unsupported schemes are
rejected. Resource chips and inline media-link previews remain separate gaps.

Array content keeps its order. Streamed native parts retain their insertion
position outside the raw payload, and resolved image previews replace the
corresponding image position. Unknown payloads and complete resource IDs remain
in the raw snapshot. Prose now participates in the ordered part model when a
message has mixed content. Both models use row-level notifications.

No existing syntax highlighter was found in chat, shared primitives or timeline
sources. Syntax highlighting remains a gap. Math typesetting remains a gap and
math source stays visible. HTML and inline Markdown images retain the existing
plain-text fallback. This is not full CommonMark/GFM conformance: nested
container fences and oversized individual table rows have no dedicated coverage.
A table row stays intact even when it exceeds the nominal page size.

The requested native build passed. CTest reported all three selected tests
passing, including setup. Qt reported 29 model and 28 QML passes, with no
failures or skips. Existing 2,000-message checks pass. New checks cover long
code/table pagination, ordered streaming, and 60 updates growing a document
past 100,000 characters while retaining the composer draft. The GUI timer test
requires every observed interval to stay below 500 ms. This is a responsiveness
regression check, not a claim of display-rate rendering.

Both native design checks passed. Inspected offscreen screenshots are in
`/home/mg/Projects/nodetool-film/tmp/chat-parity/`:

- `markdown.png` shows code, copy, table, link and math source.
- `markdown-mixed.png` shows the tool, following text, unresolved image fallback
  and final text in order. The fixture's asset is synthetic.
- `markdown-long-stream.png` shows the long document and retained draft.

Build and test output is in `markdown-build.log` and `markdown-tests.log` in
that directory. No dependencies were added. TypeScript tests, TypeScript fixture
conformance, typecheck, lint, harness gate and `/verify` were not run, as requested.
Platform accessibility, a running web comparison and timeline-host rendering
were not run.
