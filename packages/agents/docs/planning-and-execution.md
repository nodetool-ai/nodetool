# Planning, execution and sub-agents

**Navigation**: [Agents package rules](../AGENTS.md) → **Planning, execution and sub-agents**

Paths are relative to `packages/agents/` unless they name another package.

## Parallel Task Execution

`create_plan` decomposes an objective into parallel tasks via
`TaskPlanner.planMultiTask()`, and `execute_plan` runs them. Tasks form a DAG —
independent tasks run concurrently.

### How It Works

1. **Planning**: LLM generates a `TaskPlan` with multiple `Task` objects, each with `dependsOn` arrays
2. **Scheduling**: `ParallelTaskExecutor` hands the tasks to `scheduleDag`
   (`utils/dag-scheduler.ts`), which starts a task the moment its last
   dependency settles. `TaskExecutor` schedules its steps the same way.
3. **Merging**: `createDynamicMerge()` interleaves the streams and admits a
   newly-started node into the running merge (`utils/merge-generators.ts`)
4. **Completion**: A task's result reaches shared memory and its terminal
   `task_update` is emitted before its dependents are released; the stream ends
   when every task has settled

Scheduling is event-driven, not round-based. The executors used to dispatch in
barrier rounds — start every ready node, wait for the slowest, recompute — so a
plan ran as slow as its slowest sibling in every round, and the cap on rounds
per plan and per task turned depth into failure. Both caps are gone: what
bounds the work is the run budget, `maxStepIterations` per step, and the permit
pool. A cycle never reaches the scheduler (`PlanBuilder` rejects it), and a node
nothing could ever run settles failed with `unsatisfiable dependency` rather
than hanging.

The aggregation step is the finish step's dependency on every other step in the
task, not a deferral rule: it runs last because it waits for its siblings, and a
sibling that fails blocks it (I-5) instead of aggregating over a hole.

### Task Plan Structure

```typescript
interface TaskPlan {
  title: string;
  tasks: Task[];           // Multiple tasks forming a DAG
}

interface Task {
  id: string;
  title: string;
  steps: Step[];
  dependsOn?: string[];    // Task IDs this depends on ([] = independent)
}

interface Step {
  id: string;
  instructions: string;
  dependsOn: string[];     // Step IDs within this task
  tools?: string[];        // Restrict available tools
  outputSchema?: string;   // JSON schema for step result
}
```

### Skipping Planning

`execute_plan` takes the tasks as its argument, so a caller that already knows
the decomposition passes it straight in and never calls `create_plan`. The
shape is the `TaskPlan` above with snake_case keys (`depends_on`), validated by
`buildPlanFromTasks` (`tools/plan-builder-tools.ts`) before anything runs.

### Executor defaults (`constants.ts`)

Two bounds are left, both in `constants.ts`, both read by
`parallel-task-executor.ts` and `task-executor.ts` when a caller names none:
`DEFAULT_MAX_STEP_ITERATIONS` (action rounds per step) and
`DEFAULT_MAX_CONCURRENT_AGENTS`. The round caps that sat beside them are gone
(see the scheduling note above); the rest of what bounds a run is `RunBudget`
below.

Nothing resolves a per-run policy object: `execute_plan` passes the run's
budget and the parent's per-step iteration cap directly.

`maxConcurrentAgents` bounds one merge numerically (tasks per plan, steps per
task), not the run. The run-level bound is the budget's permit pool below, and
a permit stands for one open provider conversation, not one layer: a task takes
none, each step holds one through `branchPool` (`subagent.ts`), and a child a
step or sub-agent spawns runs on its parent's permit while the parent is idle
in the spawning call and borrows from the run pool beyond that. A holder never
queues for a second permit, so nesting cannot deadlock, and one pool bounds
tasks, steps and sub-agents together (`run-budget-propagation.test.ts`, "bounds
every layer"). `start_subtask` refuses past `MAX_BACKGROUND_SUBTASKS_PER_TURN`
(`tools/start-subtask-tool.ts`) with `background_limit_reached`; a detached
child still on its parent's permit can overlap the parent's next turn.
Planning draws on the same budget: `TaskPlanner` takes a `budget` (falling back
to the context's) and a refused turn stops planning naming the budget's reason.

### One budget per run (`@nodetool-ai/runtime` → `RunBudget`)

A run's bounds are one object, created by the host and shared downward, never
re-created by a child. `RunBudget` carries four:

| Bound | What refuses | Setting |
|---|---|---|
| `turns` | a turn whose worst case would cross the USD cap | `NODETOOL_AGENT_TURN_COST_CAP_USD` |
| `deadline` | any turn or tool call after the wall clock runs out | `NODETOOL_AGENT_TURN_DEADLINE_MS` |
| `concurrency` | a permit past the run's pool — tasks, steps, nested executors and sub-agents all draw from it, a holder's own permit counting as one | `NODETOOL_AGENT_MAX_CONCURRENCY` |
| `turnCount` | a turn past the run's cumulative total | `NODETOOL_AGENT_MAX_TURNS` |

Spend admission is reserve-then-commit, because the next call's cost is only
known afterwards: $0.49 spent under a $0.50 cap still admits a $0.30 call.
`turns.reserve` is the single admission point and records the first reason it
refuses; `exhausted` is set once, so a run that ran out of money and then ran
out of time stopped for the money.

**A reservation is a handle, because the budget is shared.** `turns.reserve`
answers a `TurnReservationHandle` carrying that turn's own worst case and its
own pricing (or `null` when it refused), and `turns.commit(handle, actualUsd)`
settles exactly that one — every other loop's reservation stays outstanding.
One shared counter released whatever was in flight, so a chat turn committing
its turn handed a concurrent sub-agent's headroom back and the cap stopped
holding; a single `unpriced` flag likewise booked whichever turn committed
first under the other's pricing.

**An unpriced model is not a free one.** A model the price catalog does not
cover has no worst case to reserve, so it is admitted only while its prompt
fits `NODETOOL_AGENT_UNPRICED_TOKEN_CEILING`, counted in `unpricedTurns`, and
leaves `spentUsd` a declared lower bound — the `unpriced` convention `nodetool
costs` already follows. With no USD cap configured there is nothing for the
ceiling to protect and it does not apply; the run stays bounded by its deadline
and turn count.

**How a child reserves against its parent.** The budget rides
`CapabilityRun.budget` and `SubAgentToolRuntime.budget`, and `subAgentRuntime()`
(`capabilities/agents.ts`) is the one seam where it joins the runtime, so every
delegation capability inherits it from a single place. `runSubAgent` hands that
object — never a new one — to its `CodeActExecutor`; `execute_plan` carries it
into `ParallelTaskExecutor`, which forwards it to every `TaskExecutor` and on to
every CodeAct step. It also rides `RUN_BUDGET_CONTEXT_KEY` on the context, which
is how a loop the host never constructs finds it: an `AgentNode` started through
`run_node`, or a JS script. `ProcessingContext.copy()` shallow-copies the
variable bag, so a child context shares the same budget object rather than a
clone — that sharing is what makes a cap a run total.

**Permits are taken once per branch.** A run-total semaphore deadlocks if a
holder queues for a second permit, which nested merges do by construction:
`ParallelTaskExecutor` holds permits for tasks whose `TaskExecutor`s then queue
for step permits. `acquireRunSlot` is therefore re-entrant on a context flag,
and each DAG executor holds one slot for the length of its run.

**A budget stop is visible, never silent.** `generateLoop` used to `return`, so
a consumer could not tell a refused turn from the model ending its turn. It
yields one `ProviderStop` as its final item — `budget`, `deadline`,
`iterations`, or `aborted` — and a turn the model ends on its own yields none.
Every consumer surfaces it: a CodeAct step fails naming the reason the budget
recorded, and `AgentNode` raises a node error. `classifyProviderStream`
(`llm-nodes/agent-utils.ts`) yields a `stop` event for it; before that branch
existed the item fell through its chunk/tool-call/message chain and vanished.

Absent means unbudgeted, not exhausted: a kernel workflow run with no host
budget behaves exactly as it did before.

### Step failure is terminal, not completion

A step that fails sets `step.failed` + `step.error` and leaves `completed`
false, and its `step_result` carries the protocol-level `error` field. Nothing
downstream may treat a failure as a satisfied dependency: the scheduler walks
the failed node's transitive dependents and settles each as failed, naming the
dependency directly above it, and `execute_plan` answers a plan whose every
task failed with `error: "plan_failed"` and the per-task failures rather than
compiling a deliverable out of nothing; it does not throw. The same holds one
level up — a failed task blocks its dependent tasks — and a step or task the
run's signal cut short settles once as "Step aborted" / "Task aborted", never
as "dependency failed", rather than being left looking like it is still
running.

## `create_plan` / `execute_plan` — the chat's plan mode

The chat's **Plan** permission mode blocks every mutating capability, so a
multi-step request used to come back as prose. `create_plan` (in the `agents`
capability module) runs `TaskPlanner.planMultiTask` over the objective,
forwards the `planning_update` / `task_update` events into the thread — the web
already renders both — and returns the plan's shape. It executes nothing: the
planner produces a plan, and the turn ends with it on screen.

It is offered **only** in plan mode, and there it joins `DIRECT_TOOL_NAMES` so
the model can call it outright; a deliverable reachable only by writing a
sandbox action to import it is one the model does not reach for. The planner
sees the parent belt minus `create_plan` itself, so steps route to real tool
names and no plan contains "call create_plan".

`execute_plan` is the other half: it takes that plan back and runs it on
`ParallelTaskExecutor`. **The plan travels inline** — `title` plus the `tasks`
array the model copies out of
`create_plan`'s result. There is no plan store and no plan id: passing the plan
itself is what survives the mode switch, keeps what runs identical to what the
user is looking at, and lets "run it, but drop task 3" be expressible. Plans
are a few hundred tokens.

The plan is checked before anything runs, by `PlanBuilder` — one authority for
what a plan may be, so a plan `create_plan` produced cannot be rejected here.
`buildPlanFromTasks` (`tools/plan-builder-tools.ts`) sorts the tasks so every
dependency precedes its dependents (a hand-edited plan need not arrive that
way) and feeds them through `addTask`/`finish`. Kahn's residue is exactly the
tasks in a cycle, so a cycle is reported by name rather than as a task that was
"not added yet". A rejection returns `invalid_plan` with one issue per
offender and runs nothing.

Every message the executor yields is forwarded verbatim — the `task_update`
events are what the thread and the sidebar render, so re-summarizing them would
leave the user watching nothing until the end. The call returns each task's
`completed`/`failed` (with the step and error behind a failure), a `results`
map keyed by task id, and beside it a `steps` map of per-step results, so a
caller can read what one step produced without unpacking its task. A plan
whose every task failed comes back as `error: "plan_failed"` with those
failures, not as a throw. The step results also stay in the run's shared
memory under `task:<id>`, which the description points at so the model reads
one back with `read_shared` instead of redoing the work.

`execute_plan` is classified `external`: running a plan is not one action but
every action in it. That is what blocks it in plan mode — the permission gate
is the confirmation, and there is no second approval step — and asks once
everywhere else. Each step's own tool calls stay gated inside its child loop.
The steps see the parent belt minus both plan capabilities: a step that
re-plans or re-runs the plan it belongs to is a loop.

In `chat-turn.ts` it sits on the belt in **every** mode, gated, so a call in
plan mode answers `blocked_in_plan_mode` rather than "unknown tool"; it joins
`DIRECT_TOOL_NAMES` in every mode **except** plan.

## Sub-Agent Core (`src/subagent.ts`)

The one place that knows how to spawn, stream, and settle a child agent. A
sub-agent is an async generator of `ProcessingMessage` events whose return
value is how the run settled — CodeAct is the default producer, but anything
with that shape (a future reviewer, a researcher) streams through the same
pipe and nests in the UI the same way.

| Primitive | Does |
|---|---|
| `runSubAgent(opts)` | One CodeAct child loop: single-step task, optional `outputSchema` (structured via `finish()`, prose otherwise), yields events, returns `SubAgentOutcome` — never throws for run failures |
| `settleStepResult(sr, {hasOutputSchema})` | The unified failure detection: top-level `step_result.error`, the sole-key `{error}` payload a dying step reports, and (schemaless only) any string `error` property |
| `forwardSubAgentStream(gen, opts)` | Drives any sub-agent generator: tags events (`parent_tool_call_id`, `subtask_depth`), forwards without letting a broken forwarder kill the child, honors an abort signal between events |
| `enterSubAgentDepth(ctx, maxDepth)` | The shared recursion gate over `SUBTASK_DEPTH_KEY`: refuses past the cap, else returns a copied context with the depth bumped |
| `SubAgentTool` | Base class for tools that expose a sub-agent to a parent model — subclasses declare the tool surface, translate params into a `SubAgentToolRun`, and pick the child toolset; the base owns depth gate, streaming, tagging, settlement |

Every spawn site goes through it: `RunSubtaskTool` (inherits the full parent
belt, stitches itself in for recursion), `RunSearchTool` (read-only
allowlist, breadth-scaled iteration budget), and `StartSubtaskTool` (same
child but returns a `subtask_id` receipt immediately so the parent keeps
its turn) are thin `SubAgentTool` subclasses. `WaitSubtasksTool` reads the
same per-turn `BackgroundSubtaskRegistry` (`src/background-subtasks.ts`) that
the background pump settles — `wait_subtasks({ids?, timeout_ms?})` blocks
until every requested record left "running" (or on timeout/abort, which
return current statuses instead of throwing). The registry lives on
`SubAgentToolRuntime.background`, one per chat turn, built by the host
(websocket runner, CLI); a host with no registry refuses by name. A
background subtask's events still stream to the UI tagged with
`parent_tool_call_id`/`subtask_depth`, and nesting depth is still gated
by `enterSubAgentDepth`. In CodeAct: `await nodetool.agents.start(prompt)`
+ `await nodetool.agents.wait({ids, timeoutMs})` — fan out while you
keep working. A generator that is not a CodeAct child streams through
`forwardSubAgentStream` directly. A new delegation tool should be another
subclass, not another copy of the machinery.

Tests: `tests/subagent.test.ts` (pure-function coverage), plus the spawn-site
suites (`tests/run-subtask-tool.test.ts`, `tests/run-search-tool.test.ts`,
`tests/background-subtasks.test.ts` for `start`/`wait` and the registry,
`tests/capabilities-agents.test.ts` through the capability seam) which
exercise the core end-to-end.

## Code-shaped orchestration is CodeAct, not a mode

There is no script mode. It was a third planning mode beside `TaskPlan` and the
graph planner: `ScriptPlanner` had the LLM author one JavaScript *orchestration
script* and `ScriptRunner` executed it in the sandbox, spawning a sub-agent per
`agent()` call. CodeAct made it redundant — a step already acts by writing
JavaScript in that same sandbox, so the loops, budget-scaled fan-out, dedup
between rounds and early exits a script expressed are ordinary control flow
inside an `execute_code` action:

| Script primitive | CodeAct equivalent |
|---|---|
| `await agent(prompt, opts?)` | `await nodetool.agents.run(prompt)` (a `run_subtask` child) |
| `await agent.start(prompt)` + `await agent.wait({ids})` | `await nodetool.agents.start(prompt)` + `await nodetool.agents.wait({ids})` — background spawn, collect later |
| `await parallel(thunks)` | `await Promise.all(...)`, or `nodetool.batch` for a bound |
| `await pipeline(items, ...stages)` | `nodetool.batch(items, async (item) => …)` |
| `log(message)` | `console.log(message)` |
| `budget` | the run's own `AgentPolicy` bounds, enforced host-side |
| `inputs` | the step's inputs, read from `context.memory` via `read_shared` |

The difference that mattered — one authored artifact reviewed before anything
ran — is not lost: a plan still goes through the approval gate, and an action's
code is visible in the `execute_code` call. What is gone is the second sandbox
API, the second planner prompt, and the second set of budget knobs
(`maxAgentCalls`).
