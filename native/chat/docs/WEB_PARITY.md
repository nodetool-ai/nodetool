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
| String / text blocks (all roles) | Markdown, Harmony cleanup, thought sections | Selectable paged Markdown | Harmony and mixed-content ordering missing |
| image_url | Resolved image, canvas action | Authenticated image preview | No canvas action |
| audio | Player | Fallback | Playback missing |
| video | Player | Fallback | Playback missing |
| document | Document text | Fallback | Document presentation missing |
| Unknown content / null | Renderer-dependent fallback | Generic fallback, raw model retained | Needs readable payload details |
| tool_calls / tool_call_update / tool_result_update | Phrased grouped rows with arguments and results | Raw JSON, result replaces arguments | Priority: retain call and render execution |
| execute_code | JavaScript code, title, copy, result, running state | Raw JSON, code lost after result | Priority: code and output presentation |
| run_subtask / run_search | Nested transcript and objective | Generic card | Nested transcripts missing |
| planning_update / task_update / log_update | Agent execution tree by execution ID and step | JSON cards | Execution tree missing |
| Thinking chunks / thought markup | Collapsible thinking with timing | Thinking chunks dropped | Thinking stream missing |
| Markdown fences / tables / math | Highlighted copyable code, GFM tables, KaTeX | Qt Markdown and unlabelled fences | No syntax highlighting or math engine, pagination loses Markdown structure |
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

The other gaps in the baseline table remain open. Thinking and sub-agent reduction
need dedicated state and fixtures. Agent trees, plan documents, compaction cards,
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
