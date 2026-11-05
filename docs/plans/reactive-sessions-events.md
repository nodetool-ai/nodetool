# Reactive sessions and workflow events

## Recommendation and scope

Start with a small host adapter for invoking an existing operation and observing its result. Reuse Mini App operation dispatch, invocation identity, message folding, and cleanup. Prove that a non-React caller can use the same coordination before extracting a broader reactive-session module.

A reactive session names the caller's interaction lifetime. It is not a new workflow executor, job scheduler, state store, event broker, or background service. The initial delivery handles one declared operation and finite workflow results. Persistent streaming and durable triggers remain their existing execution paths, with separate adapters only when needed.

Assistants and running games are initial consumers. Common code must not depend on conversation models or rendering clocks. The [assistant plan](realtime-virtual-agents.md) owns agent integration and conversation behavior. The [shared variables plan](shared-variables-input-bindings.md) owns new typed bindings and revision-checked publication. The [control-flow regions plan](control-flow-regions.md) owns branching and iteration within a workflow.

This review inspected the sources below and existing test cases. It did not execute them or measure realtime performance. Proposed contracts are distinguished from current implementation.

## What already exists

| Finding | Inspected behavior | Consequence |
| --- | --- | --- |
| F1. The web app host already coordinates reactive work | [useAppRuntime](../../web/src/components/appbuilder/runtime/useAppRuntime.ts) feeds an input binding into an owned active runner with `streamInput`. Its reactive path starts a full run first, then uses eligible browser subgraphs or falls back to a full run. During a reactive subgraph run it retains one latest pending trigger | Extract or adapt the smallest reusable host coordination. Do not rebuild a reactive runner. The pending-trigger behavior is specific to this path, not a universal queue guarantee |
| F2. App run policy and input capture already exist | [decideRun](../../packages/app-runtime/src/policy.ts) returns start, queue, or replace decisions. The web host performs cancellation/waiting and captures operation parameters before its queue wait | Reuse the pure decision and host behavior together. The decision function alone is not a scheduler. Preserve admitted input snapshots |
| F3. App result folding already correlates messages | [fold.ts](../../packages/app-runtime/src/fold.ts) resolves messages to owned invocations by job ID and produces state events. [state.ts](../../packages/app-runtime/src/state.ts) applies invocation/output ownership rules | Reuse folding and the authoritative app state. Add consumer request/world revision checks around delivery where needed. Existing ownership does not prove a game target is still valid |
| F4. Streaming workflow execution is available | [ExecutionSession](../../packages/execution/src/session.ts) exposes input push, input completion, captured messages, result, and cancellation. [Runner input dispatch](../../packages/execution-core/src/runner.ts) transforms incoming values through the input executor, then enqueues downstream values | A successful push means input processing/enqueue completed, not that downstream computation or a response completed. The session result ends the whole run. Per-request replies need explicit correlation in graph outputs |
| F5. Input buffering already has mechanisms, with configuration limits | [NodeInbox](../../packages/execution-core/src/inbox.ts) can await capacity when a per-handle buffer limit is configured and has correlation-related limits | Do not assume every stream is bounded or every producer honors backpressure. Inspect actual configuration and await behavior before using a high-rate source. Keep this out of the first finite-operation adapter |
| F6. Durable triggers are an existing subsystem | [Boot wiring](../../packages/websocket/src/triggers/boot.ts) injects database-backed stores. [Wakeup delivery](../../packages/execution-core/src/trigger-wakeup.ts) stores/deduplicates inputs. [Dispatcher](../../packages/websocket/src/triggers/dispatcher.ts) starts headless jobs, separates acceptance from completion, and implements parallel/queue/skip | Keep durable input ingestion and dispatch here. The wakeup class's name does not establish general live-run resumption. Its default stores are in memory, while the normal enabled server boot supplies persistent stores. Accepted-run replay has a documented at-least-once crash window |
| F7. Invocation surfaces have different result contracts | [Workflow service](../../packages/execution/src/service/workflow-run.ts) returns a background job receipt and supports result lookup through existing job tools. [App-operation execution](../../packages/execution/src/service/app-operation.ts) reserves by invocation identity and returns an operation outcome. A reused reservation can return without terminal completion | Preserve each service's authority. Reservation/acceptance is not completion. Do not promise a common completion stream until its adapter is verified |

The [inline graph runner](../../web/src/lib/workflow/runInlineGraphJob.ts) already routes eligible graphs to the browser and others to the existing WebSocket path, returning a result promise and supporting message observation. Use that through the existing app host where it already participates. Bypassing app reservation and accounting to call it directly would not be equivalent app execution.

The [app-runtime package](../../packages/app-runtime/README.md) is shared across hosts and intentionally dependency-free. Its pure state, policy, and fold functions stay there. Browser transport, React lifecycle, credentials, and server execution must not be imported into that package as part of extraction.

## Ownership and integration

| Responsibility | Authority |
| --- | --- |
| Current inputs, variables, and revisions | Existing app state or the caller's game/session state. The adapter samples that owner and does not keep another mutable copy |
| Which event requests work | Declared host binding or specialized behavior. Editing a value alone does not implicitly request execution |
| Invocation policy and authorized dispatch | Existing app/operation host, capability gate, or trigger dispatcher, according to the entry path |
| Graph computation, job status, usage, artifacts | Existing execution owner and run records |
| Request correlation and consumer lifetime | A small caller adapter mapping request identity to existing invocation/job identity and the consumer's reset generation |
| Whether a result is still relevant | Consumer policy, using target identity and source revision where needed |

Reuse the same mechanics for an assistant tool request and a game's semantic event. The assistant interprets conversation through the existing agent. A game continues ticking and applies an eligible workflow result at its own update point. Neither calls model inference synchronously inside audio or rendering callbacks.

A sequential caller may await a workflow's terminal result before its next logical step. An interactive caller can observe that same completion asynchronously while continuing unrelated updates. This does not require separate execution modes or a second job.

Values, events, and media streams retain different semantics. Shared input-binding work is not a prerequisite for the first adapter. Use current resolved operation inputs and consumer-owned revision tokens. Audio and texture buffers remain in their dedicated paths, not in an app variable or a general event queue.

## Smallest first implementation

The first deliverable is one finite operation invoked from an existing Mini App host and from a minimal non-React caller fixture. Use a delayed deterministic workflow, not a paid provider or a new event source. Do not build a general session API first. Action IDs are local to this plan and are independent of the assistant plan's IDs.

| Step | Concrete work | Acceptance |
| --- | --- | --- |
| A1. Pin existing host behavior | Extend the relevant [app host tests](../../web/src/components/appbuilder/runtime/__tests__/useAppRuntime.test.tsx) and [instance tests](../../web/src/components/appbuilder/runtime/__tests__/useAppRuntime.instances.test.tsx) with one declared finite operation, delayed result, and reset during execution. Trace the host-owned dispatch and completion callbacks before extracting code | The fixture exercises current reservation, input capture, invocation identity, folding, and terminal status. Existing queue/replace behavior remains covered. No provider call is needed |
| A2. Expose one caller adapter | First use an existing imperative entry point if sufficient. Otherwise extract only operation admission/observation and owned cleanup from the app host into a non-React helper, with execution and state access injected | An event submits the declared operation with a captured input snapshot and consumer generation. The caller receives its existing invocation identity and a terminal result or explicit observation-ended outcome. It may await completion or receive a callback |
| A3. Prove a second consumer | Drive the same adapter with a small agent-free game/event-loop fixture. Use A1's Mini App fixture as the other consumer and share it with assistant work | The loop keeps advancing while work runs. A result carries the original request identity. Reset or target change prevents stale application. A result does not implicitly request another run |
| A4. Integrate without parallel ownership | Have the original app path use the extracted helper if extraction was necessary. Add consumer close/unsubscribe and explicit task-cancellation handling | There is one implementation of the extracted behavior, one authoritative app/run state, and one counted operation. Failure, duplicate observation, reset, and late completion have defined outcomes |

For the new non-React fixture, allow at most one outstanding request per caller and report busy explicitly for a second request. This limits the first integration, not the existing app's behavior or all assistant tools globally. Do not add a queue or new replacement policy. Existing app operations keep their declared policies. A local consumer admission limit is not a replacement for server budgets or authorization.

The adapter needs only a declared operation reference, captured inputs, request identity, consumer generation, and optional target revision. A target revision tracks relevant input or object changes, not every render tick. Obtain the effective user/instance authority from the existing host, never from an untrusted event payload. Reuse invocation IDs when their scope is sufficient. A new consumer request ID is correlation, not a claim of durable deduplication.

Keep local admission, persisted reservation, and terminal execution distinct. An observer must attach to a reused active invocation's existing completion/status path instead of treating its reservation as a finished result. Do not automatically retry an effectful request after an uncertain acceptance.

Closing observation invalidates delivery, removes subscriptions, and settles any pending observer wait with an explicit observation-ended outcome. A wait timeout does the same unless the caller explicitly requests job cancellation. Neither outcome claims that execution stopped. Explicit cancellation calls the existing execution owner. Choose and document whether closing this particular caller also requests job cancellation. Reset must invalidate old observers before new work is admitted. An error or late result can remain in existing run history without being applied to the new consumer.

Detaching or resetting does not free execution capacity for work still running. Preserve the host's in-flight accounting until settlement, including after a cancellation request. The initial caller limit must not be bypassed by repeatedly resetting its observer.

Use existing promises and messages for finite completion. If the chosen host exposes no safe completion handle, add a narrow handle at that host interface. Do not introduce a global registry, new database table, generic transport, or replacement message fold merely to provide one. Settle the caller once, even if terminal status is observed through more than one existing path.

## Subsequent adapters, only when needed

| Follow-up | Reuse | Additional proof before enabling |
| --- | --- | --- |
| A5. Persistent streaming input | Existing app `streamInput`, `ExecutionSession.pushInput`, stream completion, and captured messages | Confirm the graph/input supports repeated data and is ready. Serialize ingress where ordering is required. Distinguish input enqueue from response completion. Correlate repeated outputs, propagate ingress errors, and verify bounded buffering, end-of-stream, cancellation, and cleanup |
| A6. Durable trigger source | Existing registration, wakeup stores, dispatcher, scheduler, and headless jobs | Route completion to an authorized consumer only when needed. Test acceptance versus completion and redelivery without claiming exactly-once side effects. Do not insert a second dispatcher between stored events and execution |
| A7. Higher-rate interaction | Existing app reactive routing and source-appropriate policies | Define queue bounds or observation coalescing, stale-result handling, and overflow reporting. Preserve full-run fallback and effect restrictions. Prove that expensive work cannot starve the host loop |

A5–A7 do not block the first finite-operation adapter. They are independent integration needs, not a mandatory new runtime platform. The game fixture proves reuse without adding a game event editor or full assistant-directed scene actions.

App operations use parallel/queue/replace, trigger registrations use parallel/queue/skip, and the web reactive-subgraph path has its own latest-pending behavior. Keep those meanings explicit. Do not normalize them into a single enum that silently changes cancellation, snapshots, or event loss. Latest-value coalescing is appropriate for replaceable observations, not arbitrary semantic commands.

Trigger scheduling and recovery polling are not render clocks. Same-process dispatcher notification can start accepted work promptly, but that is not a hard realtime guarantee. Streaming `pushInput` does not establish crash recovery, per-event acknowledgments, or a global total order. State each adapter's actual delivery and lifetime guarantees.

## Verification and plan coordination

Use existing execution, app, and game harnesses. Test unknown/foreign invocation messages, out-of-order completion, input changes after admission, reset, duplicate terminal events, workflow failure, observer disposal, and explicit cancellation. Assert that the fixture inspected a real invocation and that invalid ownership/revision cases fail. Measure timing on target hardware separately from deterministic correctness tests.

The assistant plan may proceed with existing agent and Mini App paths while this adapter is being proven. This plan's Mini App/game fixtures can likewise proceed without an assistant implementation. Share the finite-operation fixture and host integration. The assistant's send-message, interrupt-response, transcript, and conversation state remain its own session binding, not new verbs on the finite-operation adapter. General variables, regions, voice, and durable personal tasks are not prerequisites.

For code changes, follow [repository verification requirements](../../AGENTS.md#mandatory-post-change-verification), including dependency builds before affected tests and the harness gate. This documentation-only review requires link and text checks, not application test execution.
