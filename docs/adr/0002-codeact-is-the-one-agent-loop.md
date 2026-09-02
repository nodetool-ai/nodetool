---
status: accepted
---
# CodeAct is the one agent loop; `Agent` is retired

`packages/agents/src/agent.ts` runs a second loop next to CodeAct: `TaskPlanner` → `ParallelTaskExecutor` → `TaskExecutor` → `CodeActExecutor` → `CompilerAgent`, wrapped in a plan approval gate, a plan cache, a checkpoint store, per-phase model selection, and skill auto-select by objective word overlap. One command constructs it. Everything `Agent` alone wires is therefore reachable only from the CLI, while the loop the product ships — a CodeAct session over a gated belt — is what chat, plan mode, and every sub-agent run on. Two loops means every fix lands twice or in the wrong one: budgets, the permission ladder, transcript compaction, and the scheduler each have to be built for both, and the one nobody uses is where they rot. The repo made this call once when CodeAct replaced script mode ([codeact-design.md](../codeact-design.md)); this applies it to the loop that survived.

**D1.** `nodetool agent run` becomes one CodeAct session over the belt chat uses, with `create_plan` and `execute_plan` reachable the way they are in chat. What goes with `Agent`: `CompilerAgent`, because synthesis is the parent loop's next turn and it already reads `task:<id>` from memory; the plan approval gate, because the permission ladder classifies `execute_plan` as `external` and that classification is the approval; the plan cache and the checkpoint store, which no caller supplies; `planningModel` and `reasoningModel`, which no caller sets; and skill auto-select, whose replacement is the chat's skill catalog plus `load_skill`. What stays: `TaskPlanner`, `ParallelTaskExecutor`, `TaskExecutor`, `CodeActExecutor`, `SubAgentTool`, and the supervisor. Chat plan mode runs on the planner and the parallel executor, so those are a product path rather than `Agent`'s scaffolding.

**D2.** The workflow `AgentNode` (`packages/llm-nodes/src/nodes/agents.ts`) stays a provider-native JSON tool loop, and joins the shared permission gate and the shared `RunBudget`. A node inside a saved graph wants a small loop a graph author can bound and predict, and provider-native tool calls give that with no sandbox in the path. Handing it the sandbox and the `nodetool.*` object model is a separate product question — what a node that runs arbitrary code means for a graph somebody else opens and runs — and it is not answered here.

## Evidence

Every host that runs a model loop, and where each one is constructed:

| Host | Loop | Constructed in | Gate | Budget |
|---|---|---|---|---|
| Chat turn (web, Telegram, MCP) | one CodeAct session over `provider.generateLoop` | `packages/websocket/src/session/chat-turn.ts` (`createChatCodeActSession`) | `gateTools` | `createChatTurnBudget` |
| Chat plan mode | `create_plan` → `TaskPlanner.planMultiTask`, `execute_plan` → `ParallelTaskExecutor` | `packages/agents/src/capabilities/agents.ts` | inherited belt | the run's budget, via `subAgentRuntime` |
| Workflow `AgentNode` | JSON tool calls over `provider.generateLoop` | `packages/llm-nodes/src/nodes/agents.ts` | none | its own `createRunBudget`, or the caller's via `budgetFromContext` |
| CLI `nodetool agent run` | `Agent`: `TaskPlanner` → `ParallelTaskExecutor` → `TaskExecutor` → `CodeActExecutor` → `CompilerAgent` | `packages/cli/src/commands/agent.ts` | none | none |

The call graph is one grep:

```bash
grep -rn "new Agent(" packages web electron --include=*.ts --include=*.tsx
```

It answers with `packages/cli/src/commands/agent.ts` and the `packages/agents/tests/` suites that exercise `Agent` directly. There is no other production caller, so the CLI is the whole audience for what `Agent` wires.

The options only `Agent` passes are dead on the same evidence. `checkpointStore` and `planCache` are supplied at one site each, both inside `agent.ts`, and `FileCheckpointStore.load` resolves without reading anything until a `loadFromDisk()` that `Agent` never awaits, so a resumed run resumes from an empty store. `planningModel` and `reasoningModel` appear in `agent.ts` and `task-planner.ts` and are set by no caller, so the per-phase model selection they exist for has never selected a different model.

The plan approval gate is orphaned from the other side. `PLAN_APPROVAL_CONTEXT_KEY` has one reader, `Agent.resolveApprovalCallback`, and the websocket installs a callback under it (`attachPlanApproval`, `packages/websocket/src/session/chat-history.ts`) for an `Agent` that is never constructed in that process. Retiring `Agent` deletes the reader and the installer together.

## Considered options

- Keep `Agent` as a second supported host: rejected, this is the status quo and it is what makes each of A1, A2, A4, and A7 land twice.
- Delete `TaskPlanner` and the DAG executors with `Agent`: rejected, `create_plan` and `execute_plan` run on them from chat.
- Keep `CompilerAgent` as the synthesis step under CodeAct: rejected, it stores the `finish_step` payload without validating it against `outputSchema`, and the memory read that replaces it is already what `execute_plan` documents.
- Converge `AgentNode` on CodeAct in the same change: rejected, it changes what a node in a saved graph is allowed to do, which is D2's separate question.
- Give `AgentNode` its own gate and its own budget rather than the shared ones: rejected, a second classification table is exactly the duplication D1 removes.

## Consequences

- `nodetool agent run` gains the chat belt's gate and budget, and loses the plan-first-then-execute shape it had by construction. The rewrite has to give that shape back — an objective that asks for a plan, or a permission mode the command exposes.
- Plan approval moves from a bespoke callback to the permission ladder. A host with nobody to ask fails closed at `execute_plan` instead of inside `Agent`.
- The `planning_update` message type stays, because `create_plan` emits it. The compiler phases stop being produced, so the consumers that render them (`packages/cli/src/useExecutionState.ts`) lose those branches.
- `AgentPolicy`'s bounds have one consumer left, `execute_plan`. They either fold into the run budget or survive as the constants file the two executors read.
- The memory contract is unchanged. "Final synthesis by `CompilerAgent`" becomes "the calling loop reads `task:<id>` after `execute_plan` returns" in `packages/agents/AGENTS.md` and `docs/agent-memory.md`.
- `AgentNode` still needs the gate. Its budget already comes from the shared `RunBudget`, its own or the calling run's.
