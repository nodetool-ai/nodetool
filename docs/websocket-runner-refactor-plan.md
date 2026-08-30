# WebSocket Runner Refactor Plan

Split `packages/websocket/src/unified-websocket-runner.ts` (10,115 lines, one
class) into a small connection host plus four domain classes behind one seam
interface, without changing wire behavior.

## Problem

`UnifiedWebSocketRunner` is one class doing six jobs. Measured layout of the
file:

| Region | Lines | Content |
|---|---|---|
| Module-level helpers | 1–2,150 | Error/text sanitization, `autoSaveAssets`, audio chunk encoding, chat system prompt, tool-name plumbing, `serverModelInterfaces` — no `this` dependency at all |
| Job execution | 3,135–4,860 | Admission gates, cost estimation, `refuseRun`, concurrency queue, `startJob`, `streamJobMessages`, reconnect, cancel, terminal-status persistence |
| Chat | 4,937–8,327 | `dbMessageToProviderMessage`, `handleChatMessage` (1,300 lines), history/skill/plan assembly, cost handlers, `createWorkflowResponseContent` |
| Direct inference | 8,327–8,640 | `handleInference` media/text generation |
| RPC and commands | 8,640–9,760 | `entityRefResolver`, `getTrpcCaller`, the 540-line `handleCommand` switch |
| Socket plumbing | rest | connect/disconnect/send/receive, heartbeat, stats broadcast, renderer bridge, `ToolBridge` |

Costs of this shape:

- Every private member is reachable from all 10k lines, so nothing documents
  what belongs to what. `activeJobs` is mutated from three regions.
- A change to chat and a change to job admission conflict in the same file.
- The regions cannot be tested apart. The existing suites
  (`unified-websocket-runner*.test.ts`) drive everything through the socket.
- The file is too large to review or navigate as a unit.

The `this.*` usage per region was counted before designing the split. The
overlap is narrow: every region uses send, identity (`userId`, `appSession`),
`logError`, and the resolver factories from `UnifiedWebSocketRunnerOptions`.
Region-specific state (`chatRequestSeq`, `jobQueue`, `rpcAborts`) never
crosses regions, with one exception: chat and RPC read `activeJobs` directly.
That shared subset is the seam.

## Solution overview

- One interface, `ClientSession`, carries the shared subset. It is the only
  thing extracted classes know about the connection.
- Four classes own the four domains: `JobExecutionManager`,
  `ChatTurnHandler`, `DirectInferenceHandler`, `CommandRouter`.
- The remaining class — renamed `WebSocketClientSession` — implements
  `ClientSession`, owns the socket lifecycle, constructs the four classes,
  and routes inbound frames to them. Target size: 600–800 lines.
- The ~1,900 lines of `this`-free helpers become plain-function modules.
- Everything stays in `packages/websocket/src/`; no new npm package. New
  files live in `packages/websocket/src/session/`.
- Old names (`UnifiedWebSocketRunner`, `UnifiedWebSocketRunnerOptions`) and
  old export paths survive as aliases until callers and tests migrate, so no
  step forces a repo-wide rename.

Behavior is unchanged throughout: same frames in, same messages out, same
queue and abort semantics. The existing test suites keep passing at every
step because they test through the public surface.

## Architecture

```
WebSocketClientSession  (implements ClientSession; composition root)
  ├─ owns: socket, send lock, outbound validation, heartbeat, stats,
  │        renderer registry/bridge, ToolBridge instances, frame router
  ├─ JobExecutionManager      run_job / reconnect / cancel / status / queue
  ├─ ChatTurnHandler          handleChatMessage, turn lifecycle, permissions
  ├─ DirectInferenceHandler   handleInference
  └─ CommandRouter            handleCommand dispatch, tRPC glue, RPC aborts

session/sanitize.ts          pure: error + large-text sanitization
session/asset-autosave.ts    pure: autoSaveAssets + image/audio helpers
session/chat-prompt.ts       pure: system prompt, permission prompts,
                             tool-name plumbing, formatUiContext
session/chat-history.ts      pure: db→provider message conversion,
                             context/skill sections, response content
session/model-interfaces.ts  serverModelInterfaces, createRuntimeContext
```

Frame routing: `run_job`/`reconnect_job`/`cancel_job` → jobs; chat messages
and `tool_result` → chat; inference frames → inference; everything else →
`CommandRouter.handle`, which also composes the other three for commands
that touch them (`stop`, `get_status`, `set_permission_mode`).

## Design

### `ClientSession` (interface — the seam)

```ts
// session/client-session.ts
export interface ClientSession {
  readonly userId: string | null;
  readonly appSession: AppSessionScope | null;
  readonly mode: WebSocketMode;

  /** Serialized, validated, seq-stamped send. The host keeps the lock. */
  send(message: Record<string, unknown>): Promise<void>;
  /** Fire-and-forget send for messages that must not await the lock. */
  sendDetached(message: Record<string, unknown>): void;

  logError(context: string, error: unknown): void;

  readonly resolveExecutor: ResolveExecutor;
  readonly resolveProvider?: ResolveProvider;
  readonly resolveNodeType?: ResolveNodeType;
  readonly getNodeMetadata?: GetNodeMetadata;
  readonly validateNode?: ValidateNode;
  readonly workspaceResolver?: WorkspaceResolver;
  readonly nodeRegistry?: NodeRegistry;
  readonly pythonBridge?: PythonBridge;
}
```

Facts a caller must know beyond the types: `send` resolves after the frame is
on the socket or the socket is gone (it never throws for a dropped socket —
that is the current `sendMessage` contract); `userId` is the app owner when
`appSession` is set, so authorization decisions must consult both. Tests get
a `FakeClientSession` that records sent messages — the assertion surface the
existing suites already use, one level up.

### `JobExecutionManager`

Owns everything between "run_job arrived" and "terminal status persisted".

```ts
// session/job-execution.ts
export class JobExecutionManager {
  constructor(session: ClientSession, deps: {
    beforeRunJob?: BeforeRunJob;
    getMaxConcurrentJobs: () => Promise<number>;
  });

  runJob(req: RunJobRequest): Promise<void>;
  reconnectJob(jobId: string, lastSeq: number): Promise<void>;
  cancelJob(jobId: string): Promise<Record<string, unknown>>;
  getStatus(jobId?: string): Record<string, unknown>;

  resolveJobControl(jobId: unknown): JobControl | null;
  getSdkExecutionCapacitySnapshot(input: SdkCapacityInput): SdkExecutionCapacitySnapshot;
  cancelAll(): Promise<void>;                     // disconnect path
  get slotCounters(): { activeJobs: number; startingJobs: number };
}
```

Private, and after the move reachable from nowhere else: `activeJobs`,
`startingJobs`, `jobQueue`, `dequeuedJobs`, `drainQueue`,
`broadcastQueuePositions`, `startJob`/`startJobInner`, `streamJobMessages`,
`persistTerminalJobStatus`, `settleApplicationInvocation`,
`settleRunAgainstLostConnection`, `refuseRun`, admission gates
(`confineAppSessionRun`, `admitApplicationRun`, `admitCreditRun`), cost
estimation (`estimateRunCost`, `estimateGraphCost`, `estimateNodetoolSpend`),
cost handlers (`_handleNodeProviderCost`, `_handlePredictionCost`,
`runMeasuredCost`), graph hydration (`getRawGraph`, `normalizeGraph`).

Invariants it owns (currently documented on the runner's fields, moved with
them): the synchronous slot reservation that keeps two back-to-back
`run_job` commands from both passing the concurrency gate, and the
`slotCounters` leak accounting the reliability harness reads.

### `ChatTurnHandler`

Owns the turn lifecycle and all chat-only state: `chatRequestSeq`,
`chatAbort`, `chatSessionAllow`, `chatTurnPermissionMode`,
`chatCapabilityRun`.

```ts
// session/chat-turn.ts
export class ChatTurnHandler {
  constructor(session: ClientSession, deps: {
    jobs: JobExecutionManager;          // chat runs workflows as tools
    toolBridge: ToolBridge;             // created by the host — frames land there
    approvalBridge: ToolBridge;
    clientTools: () => Record<string, Record<string, unknown>>;
    beforeRunJob?: BeforeRunJob;
    defaults: { provider: string; model: string };
  });

  handleChatMessage(data: Record<string, unknown>, requestSeq?: number,
                    signal?: AbortSignal): Promise<void>;
  cancel(): void;                                      // stop + disconnect
  resolveToolResult(toolCallId: string, payload: Record<string, unknown>): void;
  setPermissionMode(threadId: string, mode: PermissionMode): void;
  getCapabilityRun(): CapabilityRun | null;
}
```

`handleChatMessage` (1,300 lines) is itself split along its sequential
phases: thread setup, history conversion, toolbelt assembly, the provider
stream loop, output persistence. History conversion and response-content
building are near-pure and move to `session/chat-history.ts` as functions
(`dbMessageToProviderMessage`, `appendContextToLastUser`,
`invokedSkillsSection`, `attachPlanApproval`, `toolResultDisplayText`,
`createWorkflowResponseContent` — the last is 1,300 lines of value→content
mapping that touches no connection state).

### `DirectInferenceHandler`

```ts
// session/inference.ts
export class DirectInferenceHandler {
  constructor(session: ClientSession, deps: {
    defaults: { provider: string; model: string };
    /** Registers an abort controller; returns the deregistration. Backed by
        the host's rpcAborts set so `stop` and disconnect reach it. */
    registerAbort: (c: AbortController) => () => void;
  });
  handleInference(data: Record<string, unknown>, requestSeq?: number): Promise<void>;
}
```

Private: `runDirectMediaGenerationInner`, `runDirectTextGenerationInner`,
the direct-generation request types, `estimateDirectTextSpend` (already a
module-level export; stays one).

### `CommandRouter`

The 540-line `handleCommand` switch becomes a dispatch table. It is the one
place that composes the other classes.

```ts
// session/commands.ts
export class CommandRouter {
  constructor(deps: {
    session: ClientSession;
    jobs: JobExecutionManager;
    chat: ChatTurnHandler;
    inference: DirectInferenceHandler;
    trpc: () => TrpcCaller;             // lazy, as getTrpcCaller is today
    apiOptions?: HttpApiOptions;
    registerAbort: (c: AbortController) => () => void;
  });
  handle(command: string, data: Record<string, unknown>,
         requestSeq?: number): Promise<Record<string, unknown> | null>;
}
```

Private: the per-command handlers, `runRpc`, `entityRefResolver`,
`retrieveSourceAssetBytes`, tRPC caller construction.

### `WebSocketClientSession` (the host; renamed from `UnifiedWebSocketRunner`)

Keeps: `connect`/`disconnect`/`run`/`receiveMessages`, the send lock and
`sendToSocket` with outbound validation (the implementation behind
`ClientSession.send`), MsgPack/JSON mode handling, heartbeat, stats
broadcast, observer registration, renderer registry and
`rendererToolBridge`, `clientToolsManifest` intake, the `rpcAborts` set, and
the frame router. Constructor builds the four domain classes and the
bridges. Aliases for the transition:

```ts
export { WebSocketClientSession as UnifiedWebSocketRunner };
export type { WebSocketClientSessionOptions as UnifiedWebSocketRunnerOptions };
```

## Design decisions

- **D1 — one seam, not five.** The measured overlap (send, identity, log,
  resolvers in every region) justifies one shared `ClientSession`;
  region-specific needs go in each constructor's `deps` so the interface
  stays small. Handlers taking their exact dependencies individually was
  considered and rejected: nine-parameter constructors restate
  `UnifiedWebSocketRunnerOptions` four times.
- **D2 — `activeJobs` gets one owner.** Chat and RPC currently reach into
  the map; afterwards they go through `resolveJobControl`/`getStatus`. This
  is the only call-shape change in the refactor; everything else is a move.
- **D3 — no new package.** `packages/websocket/src/session/` next to the
  existing `job-queue.ts`, `job-control.ts`, `chat-turn-registry.ts`. A
  package split can come later if another server ever hosts these classes;
  today one adapter means a hypothetical seam.
- **D4 — bridges stay with the socket.** `ToolBridge` instances are created
  by the host (frames arrive there) and injected into `ChatTurnHandler`, so
  a dropped socket can `cancelAll()` without asking the chat handler.
- **D5 — rename via alias, delete later.** The rename ships with re-exports;
  the ~10 test files and `index.ts` migrate in a follow-up mechanical PR,
  and the aliases are removed once nothing imports them.

## Task plan

One PR per task, in order. After each: `npm run test:affected`,
`npm run typecheck`, `npm run lint`. The existing
`unified-websocket-runner*.test.ts` suites must pass unmodified through T1–T7
(T8 may move them).

- **T1 — extract pure modules.** Move the `this`-free helpers to
  `session/sanitize.ts`, `session/asset-autosave.ts`,
  `session/chat-prompt.ts`, `session/model-interfaces.ts`; re-export current
  names from the runner file. ~1,900 lines out, zero behavior risk.
- **T2 — introduce `ClientSession`.** Define the interface, have the runner
  implement it (`send` delegating to `sendMessage`), add
  `FakeClientSession` to the test utilities. No extraction yet.
- **T3 — extract `JobExecutionManager`.** Largest and riskiest step; includes
  the D2 call-shape change for chat/RPC access to jobs. Verify with the
  Ring 0 reliability journeys (`nodetool harness gate --base main` selects
  them for this diff) in addition to the standard three checks — the
  `slotCounters` leak invariant is theirs.
- **T4 — extract chat.** `session/chat-history.ts` (pure functions) first,
  then `ChatTurnHandler`. Split `handleChatMessage` into phase methods in
  the same PR only if the diff stays reviewable; otherwise a follow-up.
- **T5 — extract `DirectInferenceHandler`.** Small; also introduces
  `registerAbort` over the host's `rpcAborts`.
- **T6 — extract `CommandRouter`.** Switch → dispatch table; move RPC glue.
- **T7 — rename.** `UnifiedWebSocketRunner` → `WebSocketClientSession`, file
  → `websocket-client-session.ts`, aliases per D5.
- **T8 — migrate callers and tests to the new names; delete aliases.**

Rollback story: every task is a move with re-exports, so reverting any
single PR restores the previous shape without touching the others.
