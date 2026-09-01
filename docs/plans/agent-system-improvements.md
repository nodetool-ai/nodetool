# Agent System Improvements

Status: plan v1. Scope: seven work packages (A1, A2, A3, A4, A5, A7, A8) from
the agent-system review, each cut into tasks an autonomous agent can take end
to end. A6 (eval gating in CI) is out of scope by decision.

Every task names its files, its acceptance criteria, and the test that must
fail before the change and pass after it. Read §1 and §2 before any task:
they hold the assumptions every task relies on and the decisions no task may
re-open.

## 0. Where the system is

Three loops run agents today, and only one of them is the one the docs
describe.

| Host | Loop | Constructed at | Gate | Cost cap | Compaction |
|---|---|---|---|---|---|
| Chat turn (web, Telegram, MCP) | one CodeAct session over `provider.generateLoop` | `packages/websocket/src/session/chat-turn.ts:1499`, loop at `:1974` | `gateTools` (`:1364`), mode from `permission_mode` | none | none |
| Chat plan mode | `create_plan` → `TaskPlanner.planMultiTask`, `execute_plan` → `ParallelTaskExecutor` | `packages/agents/src/capabilities/agents.ts:177, 303` | inherited belt | none | none |
| Workflow `AgentNode` | JSON tool calls over `provider.generateLoop`, `max_turns` 100 | `packages/llm-nodes/src/nodes/agents.ts:1195` | none | none | none |
| CLI `nodetool agent run` | `Agent`: `TaskPlanner` → `ParallelTaskExecutor` → `TaskExecutor` → `CodeActExecutor` → `CompilerAgent` | `packages/cli/src/commands/agent.ts:278` | none | none | none |

`new Agent(` has no other production caller. Everything only `Agent` wires is
therefore CLI-only: the plan approval gate (`agent.ts:633-649`), the security
monitor (`agent.ts:377`), `planningModel`/`reasoningModel` (`agent.ts:151-155`,
set by nobody), the plan cache and checkpoint store (`checkpoint-store.ts`,
supplied by nobody, and `FileCheckpointStore.load` returns `undefined` until a
`loadFromDisk()` that `Agent` never awaits), skill auto-select by word overlap
(`agent.ts:396-453`), and the compiler.

`CostCappedTurnBudget` (`packages/runtime/src/turn-budget.ts`) is correct and
is wired only into the supervisor (`supervisor/supervisor-agent.ts:161`),
app-build, and the `runSubAgent`/`authorGraph` options. Nothing user-facing
passes one. `generateLoop` returns silently on a refused turn
(`base-provider.ts:1155-1157`), so a consumer cannot tell a budget stop from
the model ending its turn.

No code in `packages/agents` or the websocket runner compacts or windows a
transcript. Tool results are cut at 25 000 chars (`constants.ts:6`; the docs
say 20 000). The finish nudge in `CodeActExecutor` carries only the last
assistant message forward (`codeact/codeact-executor.ts:962-970`), so the
model asked to call `finish()` cannot see the observations it computed from,
and the iteration budget resets per nudge round (`:900, :956`).

Both DAG executors dispatch in barrier rounds: every ready node starts, the
round waits for the slowest, then the ready set is recomputed
(`parallel-task-executor.ts:255-272`, `task-executor.ts:149-205`). The
concurrency cap is per `mergeAsyncGenerators` call (`utils/merge-generators.ts`),
not one semaphore, so tasks × steps × sub-agents nest to 8 × 8 × 8 provider
conversations. Under `Agent`, `maxSteps` is 10 dispatch rounds per task
(`agent-policy.ts:33`), and a step chain deeper than that fails with "step
budget exhausted" (`task-executor.ts:210-214`).

`CompilerAgent` stores the `finish_step` payload without validating it against
`outputSchema` (`compiler-agent.ts:268-312`); the step executors validate on
the host. On a null compiler result `Agent` substitutes the last task's memory
value with no error (`agent.ts:768-771`).

Dead or duplicated: `TaskPlanner.plan()` and `CreateTaskPlanTool`
(`task-planner.ts:266-380, 748-825`, no caller, passes `{} as
ProcessingContext`); process-mode fan-out (`task-executor.ts:344-520`,
unreachable because `PlanBuilder` never sets `step.mode`); `StepExecutor`
artifact/source/control machinery (`step-executor.ts:634-778, 1201-1214`);
`TaskExecutor.parallelExecution=false` and `finalStepId`; the skill file stubs
(`agent.ts:94-114, 188, 403-405`); `Agent.task = taskPlan.tasks[0]`
(`agent.ts:654-656`); `Agent` creating `~/nodetool_workspace/<ts>` on every
run (`agent.ts:567-570`); `FilePlanCache` and `FileCheckpointStore` as one
class twice; `isChunk`/`isToolCall` and the `uiEvents`/`drainUi` buffer each
written three or four times (`step-executor.ts:1221`, `compiler-agent.ts:488`,
`codeact-executor.ts:1139`, `task-planner.ts:650`).

## 1. Assumptions, invariants, constraints

### Assumptions

- **A-1.** CodeAct is the action space the product has committed to
  (`packages/agents/AGENTS.md` § "Code-shaped orchestration is CodeAct, not a
  mode"; `docs/codeact-design.md`). No task here adds a second one.
- **A-2.** `TaskPlanner` + `ParallelTaskExecutor` + `TaskExecutor` are a
  product path, because chat plan mode runs on them. They stay.
- **A-3.** The workflow `AgentNode` stays a provider-native JSON tool loop.
  Converging it on CodeAct is a product decision outside this plan (§2, D2).
- **A-4.** No model-catalog record carries a context-window size (grep for
  `contextWindow`/`context_length` in `packages/protocol`, `runtime`, `config`
  finds none). A4 must not depend on one.
- **A-5.** `CostCalculator.estimateTokenCostUsd` answers `0` for local
  providers and `null` for a model outside the price catalog
  (`cost-calculator.ts:179-186`). "Unknown" must never read as "free"
  (`turn-budget.ts` commit rule, `nodetool costs` `unpriced` convention).
- **A-6.** Workspace files, secrets, and the permission ladder are already
  correct where they exist. This plan widens where they apply, not what they
  do.

### Invariants (must hold after every task)

- **I-1.** One gate ladder. Every tool call a model makes, on every host, goes
  through `decidePermission` (`tools/tool-permissions.ts`) via
  `CapabilityRun.invoke` or the `gateTools` shim. No second classification
  table, no host that skips it. `tests/capabilities-gate-parity.test.ts`
  keeps the two entrances equivalent.
- **I-2.** One budget object per run, shared downward. A child loop
  (`run_subtask`, `start_subtask`, `run_search`, `execute_plan`, a step, an
  `AgentNode` spawned by `run_node`) reserves against its parent's budget,
  never a fresh one.
- **I-3.** A budget stop is visible. When a budget refuses a turn, the consumer
  receives a distinguishable signal and the user sees a message naming the
  limit. Silent return is a bug.
- **I-4.** Fail closed on the unknown, loud on the refusal. An unpriced model
  is not free; a headless host with nobody to ask does not silently allow a
  gated action.
- **I-5.** Step failure is terminal, not completion
  (`packages/agents/AGENTS.md` § "Step failure is terminal"). Nothing in the
  scheduler rewrite may treat a failed dependency as satisfied.
- **I-6.** Memory contract unchanged: `context.memory` is the only cross-step
  store, the `step:`/`task:`/`input:`/`shared:` namespaces keep their writers
  (`packages/agents/AGENTS.md` § "Who writes what").
- **I-7.** Provider prefix stability. Per-turn volatile text goes into the
  last user message, never into the system message
  (`chat-history.ts:50-60`, `tests/chat-prompt-stability.test.ts`). Compaction
  must not break this.
- **I-8.** Every new check is inverted once and observed failing before it
  ships (`AGENTS.md` § "Claims, Checks, and Measurements"). Each task below
  names the inversion.
- **I-9.** No hand-written `any`, no `enum`, `.js` import suffixes, workspace
  imports only (`AGENTS.md` § TypeScript Rules).

### Constraints

- **C-1.** Post-change verification is exactly `npm run test:affected`,
  `npm run typecheck`, `npm run lint`, plus `npm run dev:nodetool -- harness
  gate --base main` before a PR. Adding or re-declaring a capability also
  requires `npm run capabilities:check`.
- **C-2.** A change to `packages/agents/src/capabilities/*.specs.ts` (a
  description, a schema) moves the capability's contract fingerprint; the
  coverage table in `packages/cli/src/harness/capability-table.ts` must be
  synced (`npm run capabilities:sync`).
- **C-3.** `packages/agents/AGENTS.md` and `docs/AGENTS.md` are updated in the
  same PR as the code they describe. No counts, dates, or "currently".
- **C-4.** PRs target under 400 LOC of non-test change where the task allows;
  the deletion tasks are the exception and say so.
- **C-5.** Nothing here touches `packages/kernel` execution semantics, the
  supervisor's fail-closed rules, or the websocket protocol message set except
  where a task names the message it adds.
- **C-6.** Node 22.22.1, `nvm use`, and the sandboxed-install notes in
  `AGENTS.md` apply to every agent taking a task.

## 2. Decisions

- **D1. CodeAct is the one product loop; `Agent` is retired.** The CLI's
  `agent run` becomes a single CodeAct session over the same belt chat uses,
  with `create_plan`/`execute_plan` reachable the way they are in chat. What
  `Agent` alone wired goes with it: `CompilerAgent` (synthesis is the parent
  loop's next turn, which already reads `task:<id>` from memory), the plan
  approval gate (the permission gate on `execute_plan` is the approval), the
  plan cache and checkpoint store, `planningModel`/`reasoningModel`, and skill
  auto-select (the chat's catalog + `load_skill` is the model). `TaskPlanner`,
  `ParallelTaskExecutor`, `TaskExecutor`, `CodeActExecutor`, `SubAgentTool`
  and the supervisor stay. Rationale: two loops means every fix lands twice or
  in the wrong one, and the repo already made this call once when it deleted
  script mode.
- **D2. `AgentNode` stays a JSON tool loop** but joins the shared gate (A2)
  and the shared budget (A1). A workflow node needs a small deterministic loop
  with provider-native tool calls; giving it the sandbox and the `nodetool.*`
  API is a separate product question.
- **D3. One `RunBudget` per run**: USD cap, wall-clock deadline, a shared
  concurrency semaphore, and a cumulative turn count, created by the host and
  threaded down through `CapabilityRun`/`SubAgentRuntime`. USD admission is
  the existing reserve-then-commit `TurnBudget`; unpriced models fall back to
  a token ceiling and are recorded as unpriced (never admitted as free).
- **D4. Headless hosts gate in `auto` with an explicit no-human approver.** A
  kernel workflow run is consent: the user pressed Run on a graph whose node
  lists its tools. A `run_node` from chat inherits the chat's live mode. The
  CLI asks on a TTY and runs `auto` with a stderr notice when piped.
- **D5. Compaction is a persisted summary message, cut at a user-turn
  boundary, triggered by a token estimate and by the provider's own
  context-exceeded error.** Not a rolling window: a window drops the decisions
  the user made in turn 3.
- **D6. The DAG executors become one event-driven scheduler** over a shared
  semaphore. Round caps go away; plan size, per-step iteration caps, and the
  run budget bound the work.
- **D7. A5 is a conditional patch.** D1 deletes the code A5 fixes. Ship A5
  only if A3's deletion task cannot land in the same milestone as A1.

## 3. Work packages

Task ids are `T-<package>.<n>`. "Size" is S (one PR, under a day of agent
work), M (one PR, one to two days), L (two PRs or more). "Depends" lists tasks
that must be merged first.

---

### A1. Budgets: one `RunBudget` per run, shared downward

**Rationale.** Today the only bounds on a chat turn are iteration counts, and
those nest and reset. A user on a paid provider can lose an unbounded amount
of money to a loop nobody stops. The budget primitive already exists and is
tested; it is not connected.

**Context.** `packages/runtime/src/turn-budget.ts` (`TurnBudget`,
`CostCappedTurnBudget`), `base-provider.ts:1053-1160` (`generateLoop`,
`_admitTurn`), `codeact/codeact-executor.ts:270-273, 900-906, 956`,
`subagent.ts:83, 156, 465-476`, `capabilities/agents.ts:258-364`
(`execute_plan`), `capabilities/types.ts` (`CapabilityRun`,
`SubAgentRuntime`), `chat-turn.ts:1318-1340, 1694, 1974-1985`,
`packages/llm-nodes/src/nodes/agents.ts:964-966, 1195-1201`,
`packages/config/src/setting-catalog.ts`, `utils/merge-generators.ts`,
`docs/workflow-supervisor-design.md` §6 (why reserve-then-commit).

**Target design.**

```ts
// @nodetool-ai/runtime
export interface RunBudget {
  /** USD admission; reserve before a turn, commit after. */
  turns: TurnBudget;
  /** Absolute deadline; every loop checks it before a turn and before a tool call. */
  deadline: Deadline;            // { at: number; remainingMs(): number; expired(): boolean }
  /** Process-wide bound on concurrent provider conversations for this run. */
  concurrency: Semaphore;        // acquire(): Promise<Release>
  /** Cumulative model turns across every loop in the run. */
  turnCount: Counter;            // max, current, increment(): boolean
  /** Why a stop happened, set once. */
  readonly exhausted: BudgetExhaustion | null;   // { kind: "cost"|"deadline"|"turns"; detail: string }
}
export function createRunBudget(opts: {
  capUsd: number | null;          // null = no USD cap (local-only install)
  maxOutputTokens: number;        // the known worst case reserve needs
  unpricedTokenCeiling: number;   // per-turn prompt-token ceiling when the model has no price
  deadlineMs: number;
  maxConcurrency: number;
  maxTurns: number;
}): RunBudget;
```

- `CompositeTurnBudget implements TurnBudget`: when
  `estimateTokenCostUsd` is a number, behave as `CostCappedTurnBudget`; when
  it is `null`, admit iff `inputTokens <= unpricedTokenCeiling`, record
  `unpriced: true` on the reservation, and log once per model.
- `generateLoop` gains an explicit stop signal. Add a `ProviderStreamItem`
  variant `{ type: "stop"; reason: "budget" | "deadline" | "iterations" |
  "aborted"; detail: string }` yielded as the final item when the loop ends
  for any reason other than the model ending its turn. `base-provider.ts:1155`
  yields it instead of `return`. Both overrides (`claude-agent-provider.ts`,
  `openai-provider.ts`) do the same at their admission points. The
  `classifyProviderStream` consumers (`chat-turn.ts`, `codeact-executor.ts`,
  `llm-nodes/agents.ts`) surface it as a user-visible message: chat emits an
  assistant-role notice "Stopped: turn budget of $X reached"; `AgentNode`
  raises a node error; the CodeAct step fails with the reason instead of
  "ended after N action(s) without calling finish()".
- `CodeActExecutor`: `maxIterations` is the total across nudge rounds
  (`turnsThisRound` accumulates into `turnsTotal`; the next round is given
  `maxIterations - turnsTotal`), and `exhaustedIterations` reflects the total.
  Every action start and every bridged tool call checks `budget.deadline`.
- `SubAgentRuntime` carries `budget: RunBudget`; `runSubAgent`,
  `RunSubtaskTool`, `StartSubtaskTool`, `RunSearchTool`, `execute_plan`, and
  `authorGraph` read it from there and pass it to every `CodeActExecutor`
  they build. `Agent`-less after A3, so no other spawn site exists.
- `mergeAsyncGenerators` accepts a `Semaphore` in place of the numeric
  `concurrency`, so nested fan-outs share one bound. `nodetool.batch` and
  `parallelMap` inside the sandbox keep their own local concurrency (guest
  CPU is not a provider conversation), but every `nodetool.agents.run`/
  `start` acquires the run's semaphore.
- Hosts create the budget:
  - Chat turn: from settings `NODETOOL_AGENT_TURN_COST_CAP_USD` (default
    5.00), `NODETOOL_AGENT_TURN_DEADLINE_MS` (default 30 min),
    `NODETOOL_AGENT_MAX_CONCURRENCY` (default 8), `NODETOOL_AGENT_MAX_TURNS`
    (default 200), `NODETOOL_AGENT_UNPRICED_TOKEN_CEILING` (default 400 000),
    all declared in `settingCatalog()` so the settings page and
    `nodetool settings show` list them. A per-thread override is a follow-up.
  - `AgentNode`: new props `cost_cap_usd` (default from the same setting) and
    `timeout_s` (default 20 min); `max_turns` feeds `maxTurns`. When the node
    runs inside a chat `run_node`, it reads the chat's budget off the context
    (see A2's context key) instead of creating its own.
  - CLI `agent run` / `nodetool-chat`: flags `--cost-cap <usd>`,
    `--timeout <s>`; defaults from the same settings.
- Spend lands where it already lands (`attachRunCostLedger`); the budget adds
  no second ledger. `budget.turns.spentUsd` is reported in the run's final
  `log_update` and in the CLI summary line.

**Tasks.**

- **T-A1.1 `RunBudget` primitive + stop signal (runtime).** Size M. Files:
  `packages/runtime/src/turn-budget.ts` (add `CompositeTurnBudget`,
  `RunBudget`, `createRunBudget`, `Deadline`, `Semaphore`, `Counter`),
  `providers/types.ts` (the `stop` item), `providers/base-provider.ts:1150-
  1160` and the two overrides, `packages/runtime/src/index.ts` exports.
  Acceptance: a scripted provider run with `capUsd` below one turn's worst
  case yields exactly one `stop` item with `reason: "budget"` and makes zero
  model calls; an unpriced model under the token ceiling is admitted and the
  reservation carries `unpriced: true`; over the ceiling it is refused. Tests:
  extend `packages/runtime/tests/turn-budget*.test.ts`; inversion: set the
  ceiling to `Infinity` and watch the over-ceiling case wrongly pass, then
  restore. Depends: none.
- **T-A1.2 Thread the budget through `CapabilityRun`/`SubAgentRuntime` and
  every spawn site.** Size M. Files: `capabilities/types.ts`,
  `capabilities/invoke.ts` (`createCapabilityRun` takes `budget`),
  `capabilities/agents.ts` (`subAgentRuntime`, `execute_plan` passes the
  parent budget and the parent `maxStepIterations`), `subagent.ts`,
  `tools/run-subtask-tool.ts`, `tools/start-subtask-tool.ts`,
  `tools/run-search-tool.ts`, `author-graph.ts`, `parallel-task-executor.ts`
  and `task-executor.ts` (forward `budget` into every `CodeActExecutor`),
  `utils/merge-generators.ts` (accept a `Semaphore`). Acceptance: a parent
  with `capUsd` X that spawns three `run_subtask` children spends at most X in
  total across all four loops (scripted provider with a fixed per-turn price);
  a `start_subtask` fan-out of 20 with `maxConcurrency` 2 never has more than
  2 provider turns in flight (assert with a counter in the scripted
  provider). Tests: `tests/run-subtask-tool.test.ts`,
  `tests/background-subtasks.test.ts`, `tests/merge-generators.test.ts`,
  new `tests/run-budget-propagation.test.ts`. Inversion: give the child a
  fresh budget and watch the total exceed X. Depends: T-A1.1.
- **T-A1.3 `CodeActExecutor` cumulative iterations + deadline checks.** Size
  S. Files: `codeact/codeact-executor.ts:885-980`. Acceptance: with
  `maxIterations` 4 and two nudges, the step makes at most 4 model turns in
  total; a deadline expiring mid-action fails the step with `reason:
  "deadline"` and the action is aborted through the sandbox signal. Tests:
  `tests/codeact-executor.test.ts`. Inversion: restore the per-round reset and
  watch the count reach 12. Depends: T-A1.1. (The observation-history fix for
  the nudge is T-A4.4, same file; coordinate so the two PRs do not conflict.)
- **T-A1.4 Chat turn creates the budget; settings entries.** Size M. Files:
  `packages/config/src/setting-catalog.ts` (five entries), `chat-turn.ts`
  (create at `:1318` next to `chatGate`, pass to `createCapabilityRun`, to
  `generateLoop` as `turnBudget`, to `subAgentRuntime`; handle the `stop` item
  at the `classifyProviderStream` consumer with a persisted assistant notice),
  `packages/websocket/tests/chat-turn-test-harness.ts` and a new
  `chat-turn-budget.test.ts`. Acceptance: a turn whose scripted provider
  prices each call above the cap ends after zero calls with a persisted
  assistant message naming the cap; a turn with a local (price 0) model runs
  unbounded by USD and bounded by `maxTurns`. Inversion: set the cap to 0 and
  assert the notice is absent, watch it fail. Depends: T-A1.1, T-A1.2.
- **T-A1.5 `AgentNode` budget props and `stop` handling.** Size S. Files:
  `packages/llm-nodes/src/nodes/agents.ts` (props at `:809-905`, loop at
  `:1195`), `packages/llm-nodes/tests/agent-loop.test.ts`. Acceptance: a node
  with `cost_cap_usd` below one turn fails with an error naming the cap; a
  node run under a chat context with a budget on it uses that budget (assert
  via the shared `spentUsd`). Depends: T-A1.1, T-A2.2 (the context key).
- **T-A1.6 CLI flags.** Size S. Files: `packages/cli/src/commands/agent.ts`,
  `packages/cli/src/chat-codeact.ts`, `packages/cli/src/index.ts` (flags),
  `docs/cli.md`, `AGENTS.md` § CLI. Acceptance: `--cost-cap 0.01` on a priced
  model prints the stop reason and exits non-zero; help text lists both
  flags. Depends: T-A1.1, and lands after T-A3.2 rewrites the command (do not
  add flags to code A3 deletes).

**Out of scope.** Per-thread or per-user budget overrides in the UI; moving
spend reservations into the database for multi-instance deployments (the
credit gate has the same limitation and documents it).

**Risks.** R1: a `stop` item breaks a consumer that switches exhaustively on
item type. Mitigation: `isProviderSessionUpdate`-style narrowers exist; add
`isProviderStop` and grep every `classifyProviderStream` consumer. R2: the
Claude Agent SDK override reports usage only on its terminal message, so a
cap on that provider is coarse. Accept; the reserve rule already charges the
worst case on an aborted session.

---

### A2. One permission gate on every host

**Rationale.** The permission ladder is the user's only control over what a
model may do, and it is applied in one host out of four. Concretely: a chat in
plan mode may call `run_node` on an `AgentNode`, whose tools resolve ungated
(`agent-utils.ts:497-514` → `hydrateBuiltinAgentTool`), so the mode that
promises "no mutations" can mutate. A JS script run from chat builds its
capability run with `ungatedCapabilityRun` (`js-script-sandbox.ts:92`).

**Context.** `tools/tool-permissions.ts:332-353` (category matrix),
`:369-401` (`PermissionGateOptions`), `capabilities/invoke.ts` (the ladder,
`UNGATED`, `createCapabilityRun`), `capabilities/gate-tools.ts:79`,
`execute-agent-graph.ts:130-145` (the precedent: a child context with
`setInjectedTools`), `packages/runtime/src/context.ts:1678-1683`
(`setInjectedTools`/`getInjectedTool`), `:1876-1883` (`get`/`set` context
variables), `agent.ts:787` (`PLAN_APPROVAL_CONTEXT_KEY` as the pattern for a
context-carried callback), `chat-turn.ts:1318-1340`,
`packages/llm-nodes/src/nodes/agent-utils.ts:490-514`,
`agent-tool-hydration.ts:84-112`, `packages/execution/src/service/
workflow-workspace.ts:150-200` (`buildWorkspaceExecutionContext`),
`packages/agents/src/js-script-sandbox.ts`, `packages/cli/src/commands/
agent.ts`, `packages/cli/src/app.tsx:868-905`,
`docs/tool-class-retirement-design.md` § "Where the permission gate lives",
`tests/capabilities-gate-parity.test.ts`.

**Target design.**

- A context key `PERMISSION_GATE_CONTEXT_KEY` (in `@nodetool-ai/agents`
  `types.ts`, beside `PLAN_APPROVAL_CONTEXT_KEY`) holding a
  `PermissionGateOptions`. `gateFromContext(context): PermissionGateOptions`
  returns it, or the **headless gate** when absent:
  `{ mode: "auto", sessionAllow: new Set(), requestApproval: headlessDeny }`
  where `headlessDeny` resolves `"deny"` with a reason naming the host. In
  `auto` the ladder allows read/write/execute/external without asking, so the
  approver is reached only for a request the mode itself escalates; a
  headless host then denies rather than hangs (I-4).
- Hosts set the key:
  - Chat sets `chatGate` on the turn context. `run_node`, `run_js_script`, and
    every `AgentNode` spawned under that context inherit the live mode
    (the getter on `chatGate.mode` already tracks `set_permission_mode`).
  - The kernel job runner sets the headless gate in
    `buildWorkspaceExecutionContext` (D4).
  - CLI sets a TTY gate: `requestApproval` prompts `y / n / a (allow for this
    session)` on stderr via `readline`; when `!process.stdin.isTTY` or
    `--permission-mode auto`, the headless gate with a one-line notice.
    `--permission-mode <default|auto|plan>` on `agent run` and `nodetool-chat`.
- `AgentNode.buildTools` wraps the hydrated tools:
  `gateTools(normalizeTools(...), gateFromContext(context))`. Control tools
  (`buildControlTools`) and the structured `submit_result` tool are not
  gated: they are graph wiring, not capabilities.
- `js-script-sandbox.ts` builds its run with `createCapabilityRun({ context,
  gate: gateFromContext(context), … })` instead of `ungatedCapabilityRun`.
- `ungatedCapabilityRun` keeps exactly two legitimate users: `lazy-tool.ts`
  (the tool is gated from outside by `gateTools`) and `packs.ts` (reads a
  SKILL.md, a read-class call). A test pins that list.
- The security monitor stays an opt-in `PermissionGateOptions.securityMonitor`
  callback with no production host; A3 removes the `Agent`-side construction
  and nothing here adds one.

**Tasks.**

- **T-A2.1 `gateFromContext` + headless gate + pinned `ungatedCapabilityRun`
  users.** Size S. Files: `packages/agents/src/types.ts`,
  `tools/tool-permissions.ts` (export `headlessGate()`), new
  `capabilities/gate-from-context.ts`, `index.ts`, new
  `tests/gate-from-context.test.ts` (also asserts, by grepping `src/`, that
  `ungatedCapabilityRun` is referenced only from `lazy-tool.ts`, `packs.ts`,
  and `invoke.ts`, and asserts the grep found those three so it cannot pass on
  nothing). Inversion: add a fourth reference and watch it fail. Depends:
  none.
- **T-A2.2 Chat and kernel set the key; `AgentNode` and JS scripts read it.**
  Size M. Files: `chat-turn.ts:1318-1340` (one `context.set`),
  `packages/execution/src/service/workflow-workspace.ts`,
  `packages/llm-nodes/src/nodes/agents.ts:916-920`,
  `packages/llm-nodes/src/nodes/agent-utils.ts`, `js-script-sandbox.ts:92`.
  Acceptance (the bug this exists for): a chat turn in `plan` mode calling
  `run_node` on an `AgentNode` whose tool list includes `delete_workflow` gets
  `blocked_in_plan_mode` from inside the node, and the workflow row survives;
  the same node in a kernel job run with the same tool runs it (auto). Tests:
  `packages/websocket/tests/chat-turn-handler-run-node.test.ts`,
  `packages/llm-nodes/tests/agent-tool-hydration.test.ts`, new
  `packages/agents/tests/js-script-gate.test.ts`. Inversion: remove the
  `gateTools` wrap in `buildTools` and watch the plan-mode case delete the
  row. Depends: T-A2.1.
- **T-A2.3 CLI TTY gate and `--permission-mode`.** Size S. Files:
  `packages/cli/src/commands/agent.ts`, `packages/cli/src/chat-codeact.ts`,
  `packages/cli/src/index.ts`, `docs/cli.md`. Acceptance: piped input runs
  `auto` and prints the notice once; a TTY run in `default` mode blocks on a
  `write` tool until answered; `a` persists for the session. Tests:
  `packages/cli/tests/` with a fake stdin. Depends: T-A2.1, and lands after
  T-A3.2.
- **T-A2.4 Docs.** Size S. `packages/agents/AGENTS.md` (a "Where the gate is
  set" table: host → mode → approver), `docs/AGENTS.md` § Tool System,
  `docs/tool-class-retirement-design.md` (one paragraph). Depends: T-A2.2.

**Out of scope.** A new UI for per-node permission modes; changing what any
category allows; wiring the security monitor to a host.

**Risks.** R3: shipped example workflows with an `AgentNode` whose tools the
headless approver would deny. Mitigation: `auto` allows all four categories,
so only a future escalation path hits the approver; `npm run
validate:examples` runs in the gate. R4: `run_node` today may run on a copied
context that drops variables. Check `context.copy` copies `variables`; if
not, that is a one-line fix in `context.ts` and part of T-A2.2.

---

### A3. Retire `Agent`; CodeAct is the one loop

**Rationale.** D1. The planner→compiler pipeline has one production caller,
the CLI, and carries the largest share of the dead code, the unvalidated
output, and the unwired features. Keeping it means A1, A2, A4 and A7 each land
in two places.

**Context.** `agent.ts` (whole file), `compiler-agent.ts`,
`checkpoint-store.ts`, `agent-policy.ts`, `security-monitor.ts:1-40`,
`prompts/security-monitor-prompt.ts`, `workflow-agent.ts`,
`execute-agent-graph.ts`, `index.ts:132-143, 430-431, 480-501, 845-854`,
`packages/cli/src/commands/agent.ts:225-300`,
`packages/cli/src/useExecutionState.ts:50, 86` (reads compiler
`planning_update`s), `packages/cli/src/chat-codeact.ts` (the local CodeAct
turn the CLI already runs), `codeact/chat-codeact.ts`
(`createChatCodeActSession`), `capabilities/agents.ts` (`create_plan`,
`execute_plan`), `packages/agents/AGENTS.md` §§ "Plan Approval Gate",
"Parallel Task Execution", "One policy per run", "Final synthesis:
CompilerAgent", "Skills System", "Tuning Checklist", "Model Selection";
`docs/AGENTS.md` §§ Architecture, Planning, Execution, Configuration
Reference; `docs/agent-cli.md`; `docs/agent-memory.md`. Tests that go with
the code: `tests/agent.test.ts`, `compiler-agent.test.ts`,
`compiler-agent-loop.test.ts`, `checkpoint-store.test.ts`,
`plan-cache-checkpoint.integration.test.ts`, `plan-approval.test.ts`,
`agent-policy.test.ts`, `security-monitor.test.ts` (keep: the gate callback
survives), `memory-propagation.test.ts` (re-target to `execute_plan`).

**Target design.**

- `nodetool agent run` = one `CodeActExecutor` single-step session (or the
  `createChatCodeActSession` adapter the CLI's chat already uses; pick the one
  that gives `execute_plan` and the direct tools the same way chat gets them,
  which is the session adapter) over the full belt, with the objective as the
  user message, `--json` events as today, and the A1/A2 flags. The `planning_
  update`/`task_update` events still stream when the model calls
  `create_plan`/`execute_plan`, so `useExecutionState.ts` keeps rendering
  them; its compiler phase branch is deleted.
- The **graph branch** (`agent.ts` `graph`/`useGraphPlanner`,
  `workflow-agent.ts`, `execute-agent-graph.ts`): keep `executeAgentGraph`
  and `applyRunPolicy` only if something outside `Agent` imports them
  (`subagent.ts` and `app-build/build.ts` import `author-graph.ts`, not these).
  Verify with a grep in the task; delete what has no importer.
- `TaskPlanner` loses `plan()`, `CreateTaskPlanTool`, `maxRetries`,
  `reasoningModel`. `planMultiTask` keeps its signature.
- `ParallelTaskExecutor` loses `checkpointStore`/`runId`; `TaskExecutor`
  loses nothing here (A7/A8 cover it).
- `AgentPolicy`: after this, `execute_plan` is the only consumer of the
  bounds. Fold `maxStepIterations`/`maxConcurrentAgents` into the
  `RunBudget`-bearing runtime (A1) and delete `agent-policy.ts`, or keep it as
  the one constants file the two executors read. Decide in T-A3.3 by whether
  A1 has merged: if yes, delete; if no, keep and delete in A7.
- Memory docs: "Final synthesis: CompilerAgent" is replaced by "the calling
  loop reads `task:<id>` via `read_shared` after `execute_plan` returns",
  which is what `execute_plan`'s description already says.

**Tasks.**

- **T-A3.1 Decision record.** Size S. Add `docs/decisions/` entry or a
  section in `docs/codeact-design.md` stating D1 and D2 with the call graph
  from §0 as evidence. No code. Depends: none.
- **T-A3.2 Rewrite `nodetool agent run` on the CodeAct session.** Size M.
  Files: `packages/cli/src/commands/agent.ts`, `packages/cli/src/chat-codeact.ts`
  (share the session builder), `packages/cli/src/useExecutionState.ts`,
  `docs/agent-cli.md`, `docs/cli.md`. Acceptance: `echo "list my workflows" |
  nodetool agent run -p <p> -m <m> --json` emits `tool_call_update` events for
  an `execute_code` action and exits 0 with the final text; a plan-shaped
  objective can reach `create_plan`/`execute_plan` (scripted provider test
  asserting both appear on the belt). Tests: `packages/cli/tests/agent-command
  .test.ts` with `ScriptedProvider`. Depends: T-A3.1.
- **T-A3.3 Delete `Agent` and what only it wired.** Size L (deletion-heavy,
  exempt from C-4). Files: delete `agent.ts`, `compiler-agent.ts`,
  `checkpoint-store.ts`, `prompts/` files only the compiler used, the
  `Agent`-side monitor construction; prune `index.ts`; prune `task-planner.ts`
  (`plan()`, `CreateTaskPlanTool`, `maxRetries`, `reasoningModel`,
  `planCache`), `parallel-task-executor.ts` (`checkpointStore`, `runId`);
  delete or re-target the tests listed above; grep `web/src` and
  `packages/*/src` for `planning_update` phases `compile`/`awaiting_approval`
  and remove dead render branches only if nothing else emits them (the
  `create_plan` path emits `planning_update`, so the type stays). Acceptance:
  `grep -rn "new Agent(\|CompilerAgent\|CheckpointStore\|PlanCache" packages
  web electron --include=*.ts --include=*.tsx` returns nothing outside git
  history; `npm run check` green; `npm run backend:smoke` green (the bundle
  must not reference a deleted module). Docs: every § named in Context above
  rewritten in the same PR; `docs/AGENTS.md` Configuration Reference table
  replaced by the CodeAct session options. Depends: T-A3.2 merged; A1.T2
  merged or the `AgentPolicy` decision above applied.
- **T-A3.4 Graph branch triage.** Size S. Grep importers of
  `executeAgentGraph`, `applyRunPolicy`, `resolveAgentGraph`,
  `runWorkflowAsAgent`; delete the unimported, keep the rest with a one-line
  note in `packages/agents/AGENTS.md` naming the importer. Depends: T-A3.3.

**Out of scope.** Making `AgentNode` run CodeAct; adding a `model` argument to
`create_plan`/`execute_plan` (the per-phase-model idea survives only as a
follow-up note on those two specs).

**Risks.** R5: a downstream consumer (web, mobile, Telegram) renders a
`planning_update` phase only `Agent` produced. Mitigation: the grep in
T-A3.3; the protocol type is not narrowed. R6: the CLI `agent run` loses the
"plan first, then execute" shape a user relied on. Mitigation: the objective
can say "plan first", and `--permission-mode plan` gives exactly the chat's
plan mode.

---

### A4. Transcript compaction and observation continuity

**Rationale.** A stateless provider is sent the whole thread every turn. A
long creative session (hundreds of tool results at up to 25 000 chars each)
hits the model's context limit and the turn fails with a provider error the
user cannot act on. Inside a step, the finish nudge asks the model to finish
from a transcript that no longer contains what it computed.

**Context.** `chat-turn.ts:1160-1262` (history load, the session probe,
`loadFullHistory`), `:1702-1745` (`messagesToSend`, `appendContextToLastUser`),
`:1974-1985` (`generateLoop` call), `session/chat-history.ts` (role filter at
`:40-50`, `repairOrphanedToolCalls`, the prefix-stability note at `:50-60`),
`packages/models/src/message.ts` (`role`, `content`, `execution_event_type`,
`provider_session`), `base-provider.ts:260` (`estimatePromptTokens`, currently
module-private), `anthropic-provider.ts:1362, 1469`
(`model_context_window_exceeded`), `codeact/codeact-executor.ts:940-980`
(the nudge), `constants.ts:6` (`MAX_TOOL_RESULT_CHARS`),
`tests/chat-prompt-stability.test.ts`, `packages/websocket/tests/session-
chat-history.test.ts`, `packages/websocket/tests/websocket-client-session-
chat-resume.test.ts` (the session-probe resume this must coexist with).

**Target design.**

- **Compaction record.** A persisted `Message` row, `role: "user"`,
  `execution_event_type: "compaction"`, content:
  `"[Conversation so far]\n<summary>"`. History assembly starts at the newest
  compaction row: `Message.paginate` from that row forward, then the same
  `convertDbMessages` path. Older rows stay in the DB for the UI and for
  `nodetool.threads.*`; only the provider view is cut. A compaction row is
  itself ordinary history afterwards, so the cached prefix is stable (I-7).
- **Cut point.** Always a user-message boundary, never between a tool call and
  its result. Keep the last `K` user turns verbatim (`K` = 4, a setting);
  summarize everything before them.
- **Trigger.** Two, both in `chat-turn.ts` before `generateLoop`:
  (1) `estimatePromptTokens(messagesToSend) > NODETOOL_CHAT_COMPACTION_TOKENS`
  (setting, default 120 000; A-4 says no catalog value exists to derive it
  from); (2) reactive: the provider ends with a context-exceeded signal
  (Anthropic stop reason; OpenAI/Gemini error classes the provider maps to a
  `ProviderError` with `code: "context_exceeded"`, add the mapping) → compact,
  then retry the turn once. Providers that hold the transcript server-side
  (`priorSession` set, or the Claude Agent SDK) skip trigger (1); they get
  trigger (2) only.
- **Summarizer.** One `generateMessage` call on the turn's own provider/model
  (or `NODETOOL_COMPACTION_MODEL` when set), with a fixed prompt that must
  preserve, as a bulleted list: the user's standing goals and constraints,
  decisions taken, every artifact reference verbatim (`asset://`, workflow
  and document ids, file paths), open questions, and the last tool results'
  conclusions. The summary is capped at 4 000 tokens. A failed summarizer
  call leaves the thread uncompacted and the turn proceeds (fail open on the
  *summary*, since the alternative is a turn that cannot run), with a
  `log_update` warning.
- **User visibility.** The web renders the compaction row as a collapsed
  "Earlier conversation summarized" card (one component; the row already
  reaches the client as a message). A `log_update` names the token estimate
  that triggered it.
- **Redaction.** The summarizer input goes through the same redaction the
  provider debug dump uses (`base-provider.ts:351` "secrets redacted") before
  it leaves the process.
- **Step-level (CodeAct).** Collect every `ProviderMessageEvent` of a round
  into `history` before pushing the nudge, so the re-prompted model sees its
  own observations. No summarization inside a step: step transcripts are
  bounded by A1's cumulative iteration cap and the 25 000-char observation
  cut. Align `MAX_TOOL_RESULT_CHARS` docs with code.

**Tasks.**

- **T-A4.1 Export the token estimator and add the context-exceeded error
  class.** Size S. Files: `base-provider.ts:260` (export
  `estimatePromptTokens`), `providers/types.ts` (`ProviderError.code`
  `"context_exceeded"`), `anthropic-provider.ts`, `openai-provider.ts`,
  `gemini-provider.ts` (map their signals). Tests: one fixture per provider in
  the contract-probe offline suite pattern
  (`packages/runtime/tests/provider-contract-probes*`), asserting the mapped
  code. Inversion: unmap one and watch it fail. Depends: none.
- **T-A4.2 Compaction record + history assembly from it.** Size M. Files:
  `packages/models/src/message.ts` (no schema change if
  `execution_event_type` suffices; otherwise a Drizzle migration for a
  `compaction` boolean), `session/chat-history.ts` (`historySince
  Compaction(rows)`), `chat-turn.ts:1160-1262` (integrate with the session
  probe: a compaction row newer than the probe session wins). Acceptance: a
  thread with a compaction row at position 40 of 60 sends the system message,
  the compaction row, and rows 41–60; no tool call is orphaned. Tests:
  `session-chat-history.test.ts`, `websocket-client-session-chat-resume.test
  .ts`. Inversion: cut at a tool-result boundary and watch
  `repairOrphanedToolCalls` change the count. Depends: none.
- **T-A4.3 Triggers, summarizer, retry-once, settings.** Size M. Files:
  `chat-turn.ts` (before `:1974`), new `session/chat-compaction.ts`
  (summarizer prompt, cut-point logic, redaction), `setting-catalog.ts`
  (`NODETOOL_CHAT_COMPACTION_TOKENS`, `NODETOOL_CHAT_COMPACTION_KEEP_TURNS`,
  `NODETOOL_COMPACTION_MODEL`). Acceptance: a scripted thread over the
  threshold produces exactly one compaction row whose content contains every
  `asset://` uri from the summarized region, then the turn runs against the
  shortened history; a scripted provider raising `context_exceeded` once
  causes one compaction and one retry, twice causes a surfaced error.
  Tests: new `packages/websocket/tests/chat-compaction.test.ts`;
  `chat-prompt-stability.test.ts` extended to assert the system message hash
  is unchanged across a compaction. Inversion: drop an `asset://` uri from the
  fake summary and watch the assertion fail. Depends: T-A4.1, T-A4.2.
- **T-A4.4 CodeAct nudge keeps observations.** Size S. Files:
  `codeact/codeact-executor.ts:940-980`. Acceptance: with a scripted provider,
  the second round's request contains the first round's tool-result messages.
  Tests: `tests/codeact-executor.test.ts`. Inversion: push only
  `lastAssistant` and watch it fail. Depends: none; coordinate with T-A1.3.
- **T-A4.5 Web card for the compaction row + docs.** Size S. Files: one
  component under `web/src/components/chat/` using `ui_primitives`, wired
  where message rows are rendered by `execution_event_type`;
  `packages/agents/AGENTS.md` § "Tool Result Truncation" rewritten (25 000,
  and the compaction rule); `docs/AGENTS.md`. Depends: T-A4.3.

**Out of scope.** Compacting inside a CodeAct step; deriving the threshold
from a per-model context window (a follow-up once the catalog carries one);
compaction for the `AgentNode` (its `history` input is caller-owned).

**Risks.** R7: the session-probe resume and the compaction row disagree about
where history starts. Mitigation: T-A4.2 defines the precedence (newest
marker wins) and the resume test covers both orders. R8: a summary loses a
constraint the user stated in turn 2. Mitigation: the fixed prompt's required
sections and the `asset://` invariant test; K verbatim turns; the user can
still scroll the full thread.

---

### A5. Validate the compiler's deliverable (conditional, see D7)

**Rationale.** `Agent.getResults()` is the one output a CLI caller reads, and
it is the only place in the pipeline where a schema is declared and not
checked.

**Context.** `compiler-agent.ts:268-312`, `agent.ts:760-771`, the host-side
validator the step executors use (`codeact-executor.ts:681-707`,
`step-executor.ts:954-988`; find the shared helper and reuse it, do not write
a third), `tests/compiler-agent.test.ts`, `tests/agent.test.ts`.

**Target design.** In the `finish_step` closure, run the same schema
validation the step executors run; on failure return the validation errors as
the tool result so the compiler repairs within its 6 rounds; after the rounds,
fail. In `Agent`, a null compiler result under an `outputSchema` throws
`AgentResultError("compiler produced no result")`; without a schema the
memory fallback stays and is logged as a warning.

**Task.**

- **T-A5.1** Size S. Ship only if T-A3.3 has not merged by the time A1 ships
  (D7). Acceptance: a compiler `finish_step` with a wrong-typed field is
  rejected and the second attempt is accepted; a null result under a schema
  throws. Inversion: bypass the validator and watch the wrong-typed payload
  pass. Depends: none. Superseded by T-A3.3.

---

### A7. Event-driven scheduling over one semaphore

**Rationale.** Barrier rounds make a plan as slow as its slowest sibling in
every round, and the round cap turns depth into failure. With A1's budget the
work is bounded without counting rounds.

**Context.** `parallel-task-executor.ts:232-272, 322-340, 491-524`,
`task-executor.ts:149-215, 253-268 (per-step tools), 272-287 (blocked
dependents)`, `utils/merge-generators.ts`, `agent-policy.ts`,
`tools/plan-builder-tools.ts:185-215` (the DAG is already validated on the
way in), `packages/agents/AGENTS.md` §§ "Parallel Task Execution",
"Concurrency Defaults", "Step failure is terminal", `tests/parallel-task-
executor.test.ts`, `task-executor*.test.ts`, `merge-generators.test.ts`.

**Target design.**

```ts
// utils/dag-scheduler.ts
export interface DagNode { id: string; dependsOn: readonly string[] }
export interface DagScheduleOptions<N extends DagNode, E> {
  nodes: readonly N[];
  run: (node: N) => AsyncGenerator<E>;            // the node's event stream
  settle: (node: N, outcome: "ok" | "failed", error?: string) => E[]; // terminal events
  concurrency: Semaphore;                          // A1's shared semaphore
  signal?: AbortSignal;
  onBlocked: (node: N, by: N) => E[];             // dependents of a failure
}
export function scheduleDag<N extends DagNode, E>(opts): AsyncGenerator<E>;
```

- Starts every node whose deps are satisfied, each under the semaphore; on a
  node's completion, marks it, computes the newly ready set, starts them
  immediately; a failed node fails its transitive dependents with the
  blocking id (I-5); ends when every node is settled. Built on a dynamic merge
  (`createDynamicMerge()` with `add(gen)`/`close()`, extracted from
  `mergeAsyncGenerators`, which becomes a thin wrapper over it).
- `ParallelTaskExecutor.execute` = `scheduleDag` over tasks with `run` =
  `executeTask`; `TaskExecutor.execute` = `scheduleDag` over steps with `run`
  = a `CodeActExecutor`. `getExecutableTasks`, `getExecutableSteps`,
  `failBlockedTasks`, `failBlockedSteps`, `allTasksComplete`,
  `allStepsSettled`, `maybeDeferFinishStep` (re-expressed as a dependency of
  the finish step on every other step, added at plan build), and the round
  loops are deleted.
- Caps: `DEFAULT_MAX_TASK_ITERATIONS` (100 rounds) and `maxSteps` (rounds per
  task) are removed; `maxStepIterations` per step stays; the run budget bounds
  the rest. A cycle cannot reach the scheduler (PlanBuilder rejects it), and
  the scheduler still asserts progress: a state with unsettled nodes and
  nothing running or ready fails them with "unsatisfiable dependency".
- Failure semantics unchanged: a real exception from a node generator
  propagates after the other running generators are drained, as today.

**Tasks.**

- **T-A7.1 `createDynamicMerge` + `scheduleDag`, pure and tested.** Size M.
  Files: new `utils/dag-scheduler.ts`, `utils/merge-generators.ts`. Tests:
  new `tests/dag-scheduler.test.ts` with fake generators and a controllable
  clock: (a) a 3-node chain behind a slow sibling starts node 2 before the
  sibling finishes; (b) semaphore of 2 over 10 ready nodes never exceeds 2
  running; (c) a failed node fails exactly its transitive dependents, naming
  it; (d) abort mid-run settles everything and returns the child generators;
  (e) 20 000-node chain finishes in bounded time (the O(n·m) trap in
  `AGENTS.md`). Inversion for (a): reinstate a barrier and watch it fail.
  Depends: T-A1.1 (the `Semaphore`).
- **T-A7.2 Port `TaskExecutor`.** Size M. Files: `task-executor.ts`,
  `tests/task-executor*.test.ts` (keep every assertion about failure and
  blocked dependents; delete the round-count assertions). Acceptance: the
  existing step-failure and coverage suites pass; a step chain of depth 15
  completes (it fails today under `maxSteps` 10). Depends: T-A7.1; A8's
  process-mode deletion (T-A8.2) should land first so the port carries no
  dead branch.
- **T-A7.3 Port `ParallelTaskExecutor`, remove round caps, update
  `execute_plan`.** Size M. Files: `parallel-task-executor.ts`,
  `capabilities/agents.ts:303-317` (pass the budget's semaphore and
  `maxStepIterations`), `agent-policy.ts` (delete if T-A3.3 left it),
  `tests/parallel-task-executor.test.ts`, `packages/agents/AGENTS.md`
  §§ above. Acceptance: two independent tasks of unequal length — the
  dependent of the short one starts before the long one ends (scripted
  provider with per-step delays). Depends: T-A7.1, T-A7.2, T-A3.3.

**Out of scope.** Work stealing across runs; priority; re-planning after a
failure (a design question of its own; the executor exposes the failed set
and `execute_plan` already returns it).

**Risks.** R9: an event-ordering assumption in a UI test (`task_update`
before the first `step_update` of a task). Mitigation: `settle` and the
start events are emitted by the scheduler in the same order the round loop
emitted them; the parity is asserted in T-A7.3 against a recorded stream of
the old executor for one fixture plan.

---

### A8. Delete the dead paths, consolidate the duplicates

**Rationale.** Every dead branch is a place a fix can land without effect and
a reader can mistake for a live contract. Do it before A3 and A7 so those
ports carry nothing they do not need.

**Context.** §0's list; `packages/protocol` for whether `Step.mode` /
`perItemInstructions` are protocol types (if they are, leave the type and
delete the executor branch and the planner prompt text that mentions fan-out
modes); `packages/llm-nodes/src/nodes/agents.ts` already consumes a
`classifyProviderStream` helper (find its module first); that helper or the
narrowers beside `isProviderSessionUpdate` in `runtime/providers/types.ts`
are the target for the `isChunk`/`isToolCall` copies; `subagent.ts:104` (`settleStepResult`) as the
one failure-shape detector.

**Tasks.** Each is one PR; each PR's description lists the deleted symbols and
the grep that proves no importer remains (the grep output is the evidence,
C-1's "I checked means you enumerated").

- **T-A8.1 Planner dead path.** Size S. Delete `TaskPlanner.plan()`,
  `CreateTaskPlanTool`, `maxRetries`, the legacy `plan` prompt strings, and
  their tests; `MAX_RETRIES` doc row in `packages/agents/AGENTS.md`
  § "Concurrency Defaults". Depends: none.
- **T-A8.2 Process-mode fan-out.** Size S. Delete `task-executor.ts:344-520`
  (`handleProcessStep` and helpers), the `discover`/`process`/`aggregate`
  table in `docs/AGENTS.md` § "Fan-Out Execution", the planner prompt's
  mention if any; keep protocol types if shared (state which in the PR).
  Acceptance: `tests/task-executor-coverage.test.ts` cases for process mode
  deleted, everything else green. Depends: none. Lands before T-A7.2.
- **T-A8.3 `StepExecutor` residue.** Size S. Delete the artifact/source/
  control machinery (`step-executor.ts:634-778, 1201-1214`) and the
  `getSources`/`getControlEvents` API; confirm `SupervisorAgent` and app-build
  spec still construct it and run their suites. Depends: none.
- **T-A8.4 `TaskExecutor` flags.** Size S. Delete `parallelExecution` (both
  callers pass `true`) and `finalStepId` (no caller passes it). Depends: none;
  or fold into T-A7.2 if that lands first.
- **T-A8.5 Stream-item and UI-buffer helpers.** Size S. One
  `isChunk`/`isToolCall`/`isProviderStop` set in `@nodetool-ai/runtime`
  `providers/types.ts` (narrowers next to `isProviderSessionUpdate`); one
  `createUiEventBuffer()` in `utils/`; `settleStepResult` replaces
  `isErrorResult` (`parallel-task-executor.ts:599`) and `detectTaskFailure`
  (`:448`). Acceptance: `grep -rn "function isChunk\|function isToolCall"
  packages/agents/src` returns one hit in runtime and none in agents.
  Depends: none.
- **T-A8.6 Docs drift in the same sweep.** Size S. `packages/agents/AGENTS.md`
  § "Interactive Commands" (`/agent — Toggle agent mode` describes a no-op),
  § "Tool Result Truncation" (20 000 vs 25 000), `docs/AGENTS.md`
  Configuration Reference (`maxStepIterations` 15 vs 10 across the two docs;
  after A1 both read from one constant and the docs point at it). Depends:
  none.

The items §0 lists that belong to `Agent` (skill file stubs, `Agent.task`
compat, the unused workspace directory, `FilePlanCache`/`FileCheckpointStore`)
are deleted by T-A3.3, not here.

---

## 4. Sequencing

```
T-A8.1 T-A8.2 T-A8.3 T-A8.4 T-A8.5 T-A8.6   (independent, land first)
T-A2.1 ──► T-A2.2 ──► T-A2.4
T-A1.1 ──► T-A1.2 ──► T-A1.4
       └─► T-A1.3            T-A1.5 (needs T-A2.2)
T-A4.1 ┐
T-A4.2 ┴─► T-A4.3 ──► T-A4.5        T-A4.4 (independent; coordinate with T-A1.3)
T-A3.1 ──► T-A3.2 ──► T-A3.3 ──► T-A3.4
                        │  T-A1.6, T-A2.3 (CLI flags, after the rewrite)
T-A1.1 ──► T-A7.1 ──► T-A7.2 (after T-A8.2) ──► T-A7.3 (after T-A3.3)
T-A5.1 only if T-A3.3 slips past A1's milestone
```

Parallel lanes for four agents: (1) A8 then A7; (2) A1; (3) A2 then the CLI
tasks; (4) A4. A3 sits on lane 3 after A2 or on its own lane; T-A3.3 is the
merge point everything else must not race, so schedule it when lanes 1 and 2
have merged their runtime changes.

## 5. Per-PR verification

Every PR:

```bash
nvm use
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base main
```

Plus, where the task says so: `npm run capabilities:check` (any `*.specs.ts`
change), `npm run backend:smoke` (T-A3.3, T-A8.5, anything touching module
graphs), and the inversion named in the task, with its failing output pasted
into the PR's Verification section per `.github/pull_request_template.md`.

A task is done when its acceptance criteria are covered by a test that was
observed failing before the change, the docs named in its Context are
updated, and the PR's verification section shows the four commands green.
