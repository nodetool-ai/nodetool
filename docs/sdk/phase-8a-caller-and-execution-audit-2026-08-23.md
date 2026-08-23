# Phase 8A caller and execution-wire audit

Date: 2026-08-23  
NodeTool base: `origin/main` at `7729d6691a`  
SDK audit checkout: `nodetool-sdk` at `2c57c93`

This audit replaces the Phase 0 compatibility inventory. It defines what the
first public SDK contract keeps and what Phase 8A removes.

## SDK-only tRPC procedures

The four procedures exist only as wrappers around `SdkV1ImplementationBoundary`:

| Procedure | Definition | Product callers |
| --- | --- | --- |
| `nodes.sdkTypeInventory` | `packages/websocket/src/trpc/routers/nodes.ts` | none |
| `workflows.sdkSummaries` | `packages/websocket/src/trpc/routers/workflows.ts` | none |
| `workflows.interface` | `packages/websocket/src/trpc/routers/workflows.ts` | none |
| `workflows.interfaces` | `packages/websocket/src/trpc/routers/workflows.ts` | none |

The search covered `packages/`, `web/src/`, `electron/src/`, and `mobile/src/`,
excluding tests, generated schemas, fixtures, and build output. The remaining
references are the definitions, the shared SDK handler map, tests, and the
sandbox coverage inventory. No TypeScript product caller uses these procedures.

Phase 8A can delete all four procedures, `sdk-v1-trpc-error.ts`, their sandbox
coverage entries, and their wrapper-only tests after the HTTP boundary remains
covered.

## Discovery and lifecycle WebSocket commands

The unified runner still dispatches these compatibility commands:

- `list_workflow_summaries`
- `get_workflow_interface`
- `get_workflow_interfaces`
- `get_node_type_inventory`
- `get_capabilities`
- `preflight_workflow`

No NodeTool web, mobile, or Electron caller uses them. The C# execution client
still implements the four discovery commands as an optional compatibility path.
Capabilities and preflight have HTTP clients. Phase 8C removes the C# command
path after it pins the replacement NodeTool bundle. Phase 8A removes the server
dispatchers after the execution contract below is declared and frozen.

## C# execution commands sent to `/ws`

`NodeToolExecutionClient` sends these MessagePack command envelopes:

| Command | Payload type | Purpose |
| --- | --- | --- |
| `run_job` | `RunJobRequest` | Start a workflow, inline graph, or single-node graph. |
| `cancel_job` | `CancelJobData` | Cancel one active job. |
| `reconnect_job` | `ReconnectJobData` | Reattach and request retained frames or a persisted terminal snapshot. |
| `stream_input` | `StreamInputData` | Send one value to a live input. |
| `end_input_stream` | `EndInputStreamData` | Close one live input. |
| `update_node_properties` | `UpdateNodePropertiesData` | Change one active node executor. |

The client does not use `submit_job`, `get_job_snapshot`, or `subscribe_job`.
Those planned lifecycle commands must not appear in the public v1 manifest.

## Server frames used by C# execution

The SDK routes these frames into an `ExecutionSession`:

| Frame | SDK behavior |
| --- | --- |
| `sdk_execution_target` | Records the runner identity used for reconnect diagnostics. |
| `job_update` | Tracks queued, running, failed, cancelled, suspended, and completed states. |
| `node_update` | Raises node status and result events. |
| `node_progress` | Updates session progress. |
| `output_update` | Updates named outputs and append/replace streams. |
| `chunk` | Delivers standalone streamed content. |

`reconnect_job` can first produce `job_resumed`, followed by retained copies of
the same execution frames. If no retained runner exists, it produces a persisted
`job_update`. The SDK currently ignores the `job_resumed` header but depends on
the replay or persisted update that follows it, so the header remains part of
the declared wire.

A completed SDK run is not terminal until `job_update.status` is `completed`
and `job_update.result.outputs` exists. The SDK requests this with
`require_terminal_result: true`.

Malformed frames and command failures use the untyped protocol-rejection
envelope with `error` equal to `invalid_frame`, `invalid_message`, or
`invalid_command`. The SDK converts an uncorrelated rejection into a failed
execution session. This error envelope is part of the execution contract until
Phase 8A replaces it with the release error shape.

## Recognized but unused C# message types

The C# MessagePack decoder recognizes `preview_update`, `progress_update`,
`connection_status`, and typed `error` messages. `NodeToolExecutionClient` does
not route them into an execution session, and the current unified runner does
not publish `preview_update` or `progress_update` on the SDK execution path.
They are not part of the first public SDK execution contract.

## Phase 8A deletion boundary

Keep:

- the six execution commands;
- job correlation, cancellation, reconnect, replay, live input, and node updates;
- `sdk_execution_target`, `job_resumed`, the six consumed execution/error frame
  shapes above, and the authoritative terminal result;
- the HTTP SDK service boundary and multipart temporary upload.

Remove after the replacement execution declarations and goldens pass:

- the four SDK-only tRPC procedures;
- the six discovery/lifecycle WebSocket commands;
- planned lifecycle job declarations;
- discovery RPC fixtures, handlers, tRPC error mapping, and compatibility-only
  inventories.
