# Native chat contract

The native client uses the same server as web chat. Provider credentials and
agent execution remain on that server. The native projection never writes its
message model back as conversation history.

## Sources

- [Web protocol reducer](../../../web/src/core/chat/chatProtocol.ts) owns visible streaming behavior.
- [Thread runtime](../../../web/src/core/chat/threadRuntime.ts) separates concurrent turns.
- [Thread router](../../../packages/websocket/src/trpc/routers/threads.ts) owns thread CRUD.
- [Message schema](../../../packages/protocol/src/api-schemas/messages.ts) defines paged history.
- [WebSocket manager](../../../web/src/lib/websocket/GlobalWebSocketManager.ts) owns authenticated web connections.
- [Qt chat tutorial](https://doc.qt.io/qt-6/qtquickcontrols-chattutorial-example.html) supplies the Page, ListView, composer, and C++ model structure. Native chat uses server history instead of the tutorial's SQL database.

## Web surface inventory

| Surface | Native responsibility |
| --- | --- |
| [ChatView](../../../web/src/components/chat/containers/ChatView.tsx) | Thread actions, provider/model choice, context and send/stop |
| [ChatThreadView](../../../web/src/components/chat/thread/ChatThreadView.tsx) | Virtualized history, scroll following, empty/loading/error state |
| [ChatInputSection](../../../web/src/components/chat/containers/ChatInputSection.tsx) | Multiline draft, attachments and submission |
| [MessageContentRenderer](../../../web/src/components/chat/message/MessageContentRenderer.tsx) | Selectable text and explicit media/unknown-content projection |
| [GlobalChatStore](../../../web/src/stores/GlobalChatStore.ts) | Connection lifecycle, server history and per-thread state |
| [ChatDraftStore](../../../web/src/stores/ChatDraftStore.ts) | Thread-specific prompt seeds. Native keeps session drafts without consuming web seeds |
| [FrontendToolRegistry](../../../web/src/lib/tools/frontendTools.ts) | Explicit host manifest, validated editor commands and accurate unsupported results |
| [ToolApprovalCard](../../../web/src/components/chat/message/ToolApprovalCard.tsx) | Authoritative approval IDs and allow/deny responses |
| [PlanApprovalCard](../../../web/src/components/chat/message/PlanApprovalCard.tsx) | Plan approval/rejection and optional feedback |
| [SecretRequestCard](../../../web/src/components/chat/message/SecretRequestCard.tsx) | Native decline path. Secret provisioning remains a separate settings operation |

## HTTP and socket boundaries

Thread and history operations use tRPC `threads.list`, `threads.create`, and
`messages.list`. Message history accepts `thread_id`, `limit`, `cursor`, and
`reverse`. Its response contains `messages` and `next`. Keep full server IDs.
An incoming content value can be text, an array, an object, or null. Unknown
parts remain preserved and receive a readable fallback.

The chat WebSocket defaults to MsgPack. Native chat negotiates the server's
existing text mode, then exchanges JSON frames. The initial negotiation
acknowledgement can still be MsgPack. Commands and server events are different
envelopes. A command carries `command` and `data`. Streamed events carry `type`
and usually `thread_id`. Authentication must be resolved for the configured
server and must not be copied into logs or exported fixtures.

A `chunk` appends its string content verbatim to the owning thread's trailing
assistant message. Equal consecutive chunks are meaningful. `done` settles that
thread. A final assistant `message` replaces the temporary streamed message
rather than showing the same answer twice. A message carrying `tool_calls`
continues the agent turn. Tool results, planning, task, workflow, and media
events retain their original payloads.

`tool_approval_request` and `plan_approval_request` carry authoritative
`approval_id` values. Replies use `tool_approval_response` with `allow` or
`deny`, or `plan_approval_response` with `approve` or `reject` and optional
`feedback`. Secret values never travel in a secret-request response. A
`secret_request_response` reports only `saved` or `declined` after a separate
settings write.

## Reconnect and interruption

The current server can stamp frames with increasing `chat_seq` values. This
extends the earlier plan's assumption about unsequenced text chunks. Track
sequence values per thread. `resume_chat` accepts `thread_id` and `last_seq`.
`chat_resumed` reports `running`, `finished`, or `unknown`, plus
`replay_incomplete`. Unknown or incomplete replay requires history
reconciliation. Unsequenced chunks still cannot be deduplicated by content.
A client must not resend an uncertain prompt automatically.

## Deterministic conformance

[streaming.json](../fixtures/streaming.json) contains sanitized wire events and
normalized visible snapshots after each event. IDs are synthetic full-length
resource IDs. The fixture covers repeated spaces, two concurrent threads,
completion, final-message reconciliation, stop, and errors. The
[TypeScript adapter](../tests/conformance.test.ts) executes the production web
reducer against those snapshots and checks that changing a repeated delta is
detected. The C++ test executes the same fixture. Temporary local message IDs
and wall-clock timestamps are excluded from the normalized comparison.
