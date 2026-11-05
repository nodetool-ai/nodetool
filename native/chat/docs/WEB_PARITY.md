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
| image_url | Resolved image, canvas action | Authenticated asynchronous preview and large-image dialog | No canvas action, external storage origins remain restricted |
| audio | Player | Duration, optional thumbnail, authenticated system-viewer open | No embedded player |
| video | Player | Duration, optional thumbnail, authenticated system-viewer open | No embedded player |
| document | Document text | Named document with paged readable text | No document viewer |
| Unknown content / null | Renderer-dependent fallback | Generic fallback, raw model retained | Needs readable payload details |
| tool_calls / tool_call_update / tool_result_update | Phrased grouped rows with arguments and results | Raw JSON, result replaces arguments | Priority: retain call and render execution |
| execute_code | JavaScript code, title, copy, result, running state | Raw JSON, code lost after result | Priority: code and output presentation |
| run_subtask / run_search | Nested transcript and objective | Generic card | Nested transcripts missing |
| planning_update / task_update / log_update | Agent execution tree by execution ID and step | JSON cards | Execution tree missing |
| Thinking chunks / thought markup | Collapsible thinking with timing | C++ thought projection with timing and retained expansion | Fresh history requires server-supplied markup. Web shimmer and rail differ |
| Markdown fences / tables / math | Highlighted copyable code, GFM tables, KaTeX | Labelled copyable fences and header-preserving table pages | Syntax highlighting and math typesetting remain gaps |
| Media output groups / prediction | Grouped media, progress and generation metadata | Shared media-only header, generation metadata, prediction status/progress/cost | Vertical rows instead of grid, no shimmer |
| Resource mentions | Typed chips, preview and navigation | Typed Markdown-link chips and explicit resource rows, capability-gated host signal | Bare/backticked mentions and inline resource previews missing |
| tool_approval_request | Review arguments, allow/deny | Folded code and arguments, description, allow/deny with authoritative ID | Separate web folds and chat-wide grants are not implemented |
| plan_approval_request | Plan preview, feedback, approve/reject | Parsed preview, feedback, run/revise/reject | Native typography and single-line feedback differ |
| create_plan / plan document | Structured plan document | C++ parser, task and step counts, dependencies, instructions and execution note | Native text document layout differs |
| secret_request | Credential entry with separate settings write and decline | Settings and decline, without credential entry | Native intentionally does not save secrets from chat |
| compaction | Collapsible summary card | Dedicated collapsed summary, header removed | Native expansion button differs |
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
reduction still needs dedicated state and fixtures. Later checkpoints cover agent trees, plan documents and compaction cards.
Resource navigation and media playback remain separate work. Full math needs a
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
| 7. Plans | Structured documents, approval previews, explicit decisions and compaction cards | Visual differences documented in the plans checkpoint |
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

## Execution tree and child transcripts

Execution messages now reduce in C++ into a model per execution ID, with task
and step models below it. Planning text, task/step status, step results and
step tool calls render in the tree. Completed and failed tasks close by
default. Explicit expansion overrides stay in the part model, so delegate
recycling does not discard them. Logs are closed rows with selectable
4,096-character pages when expanded. Nested lists are virtualized and have
bounded viewport heights. A streamed step update changes its owning row,
without resetting the conversation.

The `execution-tree.json` fixture covers planning, task creation, step progress
and logs. Saved `agent_execution` messages accept object or JSON-encoded
content, as the web execution hook does. Loading older execution history
refolds the loaded execution events in chronological order. This history load
resets presentation expansion, as an explicit reload does.

The `sub-agents.json` fixture replays the cases in
[MessageView.subAgent.test.tsx](../../../web/src/components/chat/message/__tests__/MessageView.subAgent.test.tsx).
`run_subtask` and `run_search` use description/title/query labels and
prompt/instructions objectives. Child chunks, final messages and results stay
under the spawning call, with a folded message count excluding tool results.
The card starts closed and an empty child stays a plain row. Nested tool calls
reuse the existing grouping, phrasing, result and expansion implementation.
The native model retains original event payloads and full IDs.

Reload has the same server-data limit as web. The
[message model](../../../packages/models/src/message.ts) stores execution IDs
and event types, and the
[history router](../../../packages/websocket/src/trpc/routers/messages.ts)
returns them. Child transcript tags are absent from that persisted schema.
The server's
[synthetic child cards](../../../packages/websocket/src/session/chat-turn.ts)
are socket messages, and web keeps their transcripts in `subAgentMessages`.
A fresh reload therefore keeps the persisted parent call/objective/result,
but cannot recover the live child transcript. Native does not invent or save
that missing history. Bare planning/task/log events also require persisted
execution messages to survive reload.

Native uses nested scrollable surfaces and explicit detail buttons instead of
web's connecting rail, task inspector and inline log layout. Planning currently
shows the latest planning entry, with earlier payloads retained in the model
snapshot. Wall-clock task durations and the web execution phase summary are
not rendered. These are presentation differences, not persisted additions.

Native coverage includes live versus encoded-history replay, owning-row
notifications, the existing long message history tests, a long execution run,
and expansion after log delegate recycling. Offscreen evidence is in
`/home/mg/Projects/nodetool-film/tmp/chat-parity/execution-tree.png` and
`/home/mg/Projects/nodetool-film/tmp/chat-parity/sub-agents.png`.
Build and CTest logs use the `execution-` prefix in the same directory.
The strict native design and dependency checks apply to the changed QML.

TypeScript tests, TypeScript fixture conformance, typecheck, lint, harness gate
and `/verify` were not run, per the task's native-only verification scope.
Platform accessibility, measured input-to-paint latency and a running web
screenshot comparison were not performed.

## Markdown link colour correction

Markdown links now use `Theme.statusInfo` in light and dark themes. Qt's
Markdown importer assigns an explicit blue foreground to anchors, so changing
only the control palette does not change their rendered colour. C++ applies
the theme colour to the displayed document's anchor spans after text or theme
changes. It preserves link destinations and text. Server payloads and message
models are unchanged. Body text, selection and code surfaces already use theme
roles in `Ui.TextArea`. No other hardcoded text colours were found in the chat
Markdown projection or delegate.

The `link-colours.json` fixture covers prose and table links, emphasis, inline
code, a quotation and a fenced block. Model tests check both colours, retained
URLs and text, and the original payload. QML tests switch themes on the same
rendered message, check 4.5:1 link contrast against the panel and sample rendered
pixels. The original control-palette test failed with `#0000ff`. Screenshot
inspection exposed that a palette-only fix was insufficient.

The native build passed. CTest reported all three selected tests passing,
including setup. Qt reported 32 model and 32 QML passes, with no failures or
skips, including the existing 2,000-message coverage. Both strict design and
dependency checks passed. No dependencies were added.

Inspected offscreen screenshots:

- `/home/mg/Projects/nodetool-film/tmp/chat-parity/link-colours-dark.png`
- `/home/mg/Projects/nodetool-film/tmp/chat-parity/link-colours-light.png`

Build and test logs are `link-build.log` and `link-tests.log` in the same
directory. TypeScript tests, typecheck, lint, harness gate and `/verify` were
not run under the requested native-only scope.

This checkpoint completes only the link colour correction. Structured plans,
approval review and reconnect acceptance tests, compaction cards, grouped
media and typed resources, embedded timeline screenshots and overflow tests,
and a final row-by-row parity classification remain open. Parity is not closed.


## Plans, approvals and compaction

The C++ plan parser follows `parsePlanDocument`: object and JSON-string inputs,
snake-case and camel-case dependencies, trimmed titles, default task and step
IDs, invalid-entry filtering, nullable execution state and independent-task
counts. `plans-approvals.json` ports the web parser cases. Plan documents show
the title, task and step counts, numbered tasks, dependency titles, instructions,
parallel-task count and the dry-run note. The same projection serves
`create_plan` results, plan content and approval previews.

Plan actions match run, revise with trimmed feedback, and reject without
feedback. Tool requests show the description or status message, folded code and
arguments, and explicit allow/deny actions. Malformed previews retain a decline
path. Missing approval IDs produce a visible cannot-answer notice. Secret
requests show the key, reason, description, an HTTPS-only help link, settings
and decline. Native deliberately has no credential input or saved response.

C++ owns reduction, expansion and feedback drafts. Updates notify affected rows.
Raw payloads and complete resource IDs remain retained. Responses use only the
server approval ID. Pending requests survive reconnect and history reload,
as web's separate pending-approval store does. Stop cancels pending requests.
Answered or cancelled IDs remain inactive during replay until account state is
cleared. This is stricter than web's current pending-store insertion, which can
reinsert an answered request if the server delivers it again. No action is
automatically accepted or automatically resent.

Compaction records retain their original user-role payload for history, but
render as a dedicated closed card. Expansion reveals text blocks without the
`[Conversation so far]` prefix. Empty summaries have an explicit fallback.
Expansion does not modify saved history.

Native uses paged selectable text and labelled expansion buttons. It does not
match web's exact typography, separate code/argument folds, multiline feedback,
or Allow for this chat action. The requested per-call allow/deny behavior is
implemented. No running-web pixel comparison or timeline-host check was made.

Verification uses the requested `ntbuild` targets and `citest` selection.
CTest reports three passing tests including prerequisite setup. Qt reports
35 model and 36 QML passes including initialization and cleanup, without skips.
Existing 2,000-message coverage passes. Safety coverage exercises no automatic
response, unknown and missing IDs, malformed previews and arguments, approve,
reject, trimmed feedback, deny, secret decline without a value, duplicate
responses, answered replay, reconnect, history replacement and stop cancellation.
QML checks cover decision IDs, feedback, settings/decline and keyboard expansion.
Both native design and dependency checks pass.

Offscreen screenshots and logs are under
`/home/mg/Projects/nodetool-film/tmp/chat-parity/`:
`plan-approval.png`, `tool-approval.png`, `secret-request.png`,
`compaction-collapsed.png`, `compaction-expanded.png`, `plans-build.log` and
`plans-tests.log`.

TypeScript tests, TypeScript fixture conformance, typecheck, lint, harness gate
and `/verify` were not run, as requested. Platform accessibility and installed
application checks were not run.


## Media and resources checkpoint

C++ recognizes media-only arrays using the cases in the web helper tests.
A shared generation header precedes the media rows. It shows model, resolution,
aspect ratio, variations, duration, strength, inference steps, voice and speed
when supplied. Pending requests show a generation label. Prediction rows show
status, progress, provider/output/attachment status, cost and errors. Updates
with the same prediction ID notify the original owning row even after later
messages arrive. Raw content and unknown fields remain retained.

Images use the authenticated client and asynchronous QML decoding, bounded to
800-pixel previews and 1,600-pixel dialog images. Downloads retain the existing
16 MiB and 16-megapixel limits. Inline PNG/JPEG sources are limited to 2 MiB.
The session preview budget is 32 MiB of UTF-16 source strings. Failures show
an error instead of silently disappearing. The large-image dialog supports
Escape and returns focus. Account changes clear protected projections and
client-owned temporary media files.

Chat has no playback stack in its CMake dependencies. Its plan excludes the
timeline's FFmpeg and private QRhi dependencies. Audio and video therefore show
duration, an available thumbnail and an explicit system-viewer action. That
action resolves assets through `assets.get`, downloads with authentication,
then opens a temporary local file. It accepts a bounded set of audio/video MIME
types up to 32 MiB. Same-origin enforcement and manual redirect policy prevent
credentials from reaching another origin. Signed external storage URLs remain
a gap. No dependency was added. System-player availability was not manually
tested on this machine.

Documents show their name and paged text. Markdown resource links become typed
chips outside fenced code. Full URIs reach `ChatSession.resourceRequested` only
for kinds advertised in `resourceKinds`. The timeline assistant panel exposes
no resource-opening hook, so it retains noninteractive chips. No timeline
navigation or inline sketch, timeline, model or game renderer was invented.
Bare URIs, URI-only code spans, legacy `nodetool://` links and exact Markdown
AST handling remain gaps.
Native uses vertical media rows rather than the web grid, and has no canvas
insertion, drag action or pending shimmer.

`media-resources.json` covers mixed media, generation metadata, prediction,
document and resource presentation. Model tests port the media-only helper
cases, check row-specific prediction updates across 2,000 media messages,
reject unsupported URLs, retain full navigation IDs, resolve inline images and
clear protected state. QML tests cover virtualization with 2,000 media messages,
document text, inactive resource navigation and the large-image dialog.

Offscreen evidence lives in `/home/mg/Projects/nodetool-film/tmp/chat-parity/`:
`media-group.png`, `media-large.png`, and `media-resources.png`.
The build and test logs are `media-build.log` and `media-tests.log`.

TypeScript tests, typecheck, lint, harness gate and `/verify` were not run, as
requested. Running-web comparisons, timeline-host rendering, platform
accessibility and system-player playback were not run.

The requested `ntbuild` completed successfully. `citest` reported all three
CTest entries passing, including fixture setup. Qt reported 37 model passes
and 39 QML passes, including initialization and cleanup, without failures or
skips. Existing 2,000-message coverage and the new media-heavy case passed.
Both `check_design.py --strict` and `check_dependencies.py` passed. The three
screenshots were inspected after the final changes. This does not establish
scrolling frame latency or web pixel parity.
