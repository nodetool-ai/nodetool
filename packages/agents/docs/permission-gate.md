# Permission gate

**Navigation**: [Agents package rules](../AGENTS.md) → **Permission gate**

Paths are relative to `packages/agents/` unless they name another package.

## Where the permission gate is set

One ladder decides every actionable call. `decidePermission`
(`tools/tool-permissions.ts`) reads a mode and a category, `invokeCapability`
(`capabilities/invoke.ts`) runs the sequence around it (read-class fast path,
mode decision, session allow-set, approval round trip), and `gateLegacyTools`
(`capabilities/legacy-tools.ts`) is the door a `Tool` walks through it. What
differs between hosts is who answers when the ladder asks.

A host publishes one `PermissionGateOptions` under
`PERMISSION_GATE_CONTEXT_KEY` (`src/types.ts`), and every loop under it reads
that object with `gateFromContext` instead of building a gate of its own
(invariant I-1). This is the channel `RunBudget` already travels on, for the
same reason: `ProcessingContext.copy()` shallow-copies the variable bag, so a
child shares the host's gate object rather than a clone, which is what makes a
mid-turn `set_permission_mode` and an "allow for this chat" answer reach a loop
that started before them. The contract itself — the key, the types,
`decidePermission`, `headlessGate` — lives in `@nodetool-ai/runtime`
(`permission-gate.ts`) so the workflow hosts below this package can set a
gate; this package re-exports the names. Every host sets one, so a context
carrying no gate is a bug: `gateFromContext` logs it at error level and
answers a gate that lets read-class calls through and denies everything else
(mode `default`, approver `deny`). A host that means "nobody to ask" says so
with `headlessGate(hostName)`.

| Host | Where its gate comes from | Mode | Approver |
|---|---|---|---|
| Chat turn (web, Telegram) | `chat-turn.ts` sets `chatGate` on the turn context | the thread's live mode, read through a getter so `set_permission_mode` lands mid-turn | round trip to the client (`requestToolApproval`) |
| MCP mount | `mcpSessionGate()` in `mcp-agent-tools.ts` — `headlessGate("MCP")` with `execute_code` seeded into `sessionAllow` — and one session-owned `CapabilityRun`, so direct registrations, namespace imports, and `tools.<name>()` meet the same ladder | `auto`: the client's user connected this agent deliberately, and an MCP session has no approval UI of its own to prompt through | nobody: the headless deny. The one standing approval is `execute_code`, because the client already put that call, code included, in front of its user; an escalation from inside a run (an un-allowlisted Apify actor) has no such answer and is denied |
| `run_node` child | `runSingleNode` builds a context of its own, so the turn's gate is passed in as an argument and set on it | the calling turn's, the same object | the calling turn's client |
| `AgentNode` in a workflow | `genProcess` wraps what `buildTools` returned in `gateFromContext(context, "Agent node")` | the host's, or `auto` when no host set one | the host's, or the headless deny |
| JS script | `js-script-sandbox.ts` passes `gateFromContext(context, "JS script")` to `createCapabilityRun` | same | same |
| `nodetool.code.Code` node | `code-node.ts` reads `gateFromContext(context, "Code node")` and uses it for both doors: `createCapabilityRun` for the `@nodetool-ai/sandbox-nodetool/*` imports, `capabilityRunForTools` for the belt the bridge invokes | same | same |
| Kernel workflow run | `buildWorkspaceExecutionContext` (`packages/execution/src/service/workflow-workspace.ts`) sets `headlessGate("kernel workflow run")` on the context it builds, and `ExecutionSession.create` sets the same on a caller's own context when that caller set none (see below) | `auto` | nobody: the headless deny |
| Headless job runner (trigger-driven runs) | `packages/websocket/src/headless-job-runner.ts` sets `headlessGate("headless job runner")` on the run context | `auto` | nobody: the headless deny |
| `nodetool agent run` on a TTY | `createCliPermissionGate` (`packages/cli-chat/src/permission-gate.ts`), host name `nodetool agent run`, set on the run's context | `--permission-mode`, defaulting to `default` | the terminal: `y / n / a` prompted on stderr, because stdout carries the result. `a` answers `allow_for_chat`, and the name lands in the run's shared `sessionAllow` |
| `nodetool agent run` with the objective piped in | the same builder, not interactive | `--permission-mode`, defaulting to `auto` | nobody: `headlessGate`'s deny, its reason printed once per run |
| `nodetool-chat` reading piped stdin (`runStdinMode`) | the same builder, host name `nodetool-chat`, set on each line's context | `--permission-mode`, defaulting to `auto` | nobody: the headless deny |
| `nodetool-chat --url` | no gate is built here | — | the server's chat turn, which gates the belt it runs |
| `nodetool-chat` interactive session | **nothing**: the Ink session builds its own belt in `app.tsx`, wraps it in no `gateLegacyTools`, and puts no key on its context | none | nobody |

A CLI run that cannot prompt keeps the mode it was asked for and changes only
the approver, so a piped `--permission-mode plan` still blocks what plan mode
blocks. The `sessionAllow` Set is created once per run and shared by reference,
which is what makes `a` outlive the call that answered it: `nodetool-chat`
rebuilds its belt for every input line and consults the same Set. Under
`--json` the notice and any prompt ride the event stream rather than stderr, so
that stream stays one JSON object per line.

**The interactive CLI session is the host A2 left open.** Its belt is
`RunSubtaskTool` plus raw tools, so nothing there meets the ladder. The reason
is the terminal, not the design: the Ink session reads stdin itself
(`useInput`), so the `readline` prompt every other CLI path uses cannot share
it, and an approval there needs an Ink component instead. Rather than accept a
mode it would ignore, `packages/cli-chat/src/chat-entry.ts` prints that
`--permission-mode` does not apply to the interactive session.

**Both gated CLI hosts retain a `Tool[]` compatibility belt.** The provider
loop and delegated executors still require it. `gateLegacyTools` owns one run
per belt and context, and CLI CodeAct reuses that run directly. Native wrappers
supply specs and implementations without being converted back into legacy
capabilities. `execute_plan` uses the same gate as other actionable calls.
Delegation and planning capabilities retain their declared read category.

**The kernel row is a decision, set explicitly.** A workflow run is consent:
the user pressed Run on a graph whose nodes list their tools, so an agent loop
inside it runs `auto` with nobody to ask. `buildWorkspaceExecutionContext`
says so by setting `headlessGate` from `@nodetool-ai/runtime`, and
`ExecutionSession.create` does the same for a caller that hands in its own
context with no gate on it (`nodetool run`, the WebSocket job runner, the app
simulator), while a caller whose context already carries a gate — a chat
turn's `run_node` — keeps it by reference. Setting it at the choke point is
what lets `gateFromContext` treat an absent gate as a bug and fail closed.

**Plan mode already blocks `run_node` one level above the node.** `run_node`
is classified `execute`, and `decidePermission("plan", "execute")` is `block`,
so a chat in plan mode gets `blocked_in_plan_mode` from the belt before the
node runs. The gate on the node closes the same hole reached another way: a
`set_permission_mode` to `plan` while a node is already running, or any other
host that puts a plan-mode gate on a context. What the child inherits is pinned
by `packages/websocket/tests/chat-turn-handler-run-node.test.ts`, which asks
`gateFromContext` from inside the node's own executor.

**Control tools and `submit_result` stay ungated on an `AgentNode`.** They are
graph wiring rather than capabilities: a control tool fires an outgoing control
edge, and `submit_result` hands the node's structured outputs back to the node.
Both are appended after `gateAgentTools` has run. The wrap sits at the
`genProcess` call site rather than inside `buildTools` because `buildTools` is
the hook a subclass overrides, and gating inside it would be skipped by any
override that does not call `super`.

**The headless gate denies, and names the host that had nobody to ask.**
`headlessGate(hostName)` runs `auto` with an approver that resolves `"deny"`
and logs the refusal. In `auto` the ladder allows read, write, execute and
external outright, so that approver is reached only by an escalation the ladder
itself raises: `admitCodeAction` asks before a high-risk `execute_code` action
in auto, and the Apify actor policy asks before an actor the install has not
allowlisted. Resolving `"allow"` would grant what those escalations exist to
withhold, and never resolving would hang the run (invariant I-4).
`headlessDenialReason` is exported so a host that runs headless on purpose can
print the same sentence once at the start instead of once per denied call.

**Compatibility consumers may still build an ungated run.**
`capabilities/lazy-tool.ts` and `tools/serp-tool-factory.ts` build compatibility
tools whose calls use `invokeCapability`. Gated hosts supply their permission
gate through `capabilityRunForTools`, or `gateLegacyTools` when they need
`Tool[]`. `capabilities/packs.ts` reads a SKILL.md,
a read-class call with nothing for the ladder to withhold.
`packages/agents/tests/gate-from-context.test.ts` walks every
`packages/*/src` for `ungatedCapabilityRun` and fails on any file its allowlist
does not cover. It also asserts that the three sites it names by hand were
found, so it cannot pass on a walk that matched nothing. The walk used to stop
at this package, which is why the Code node's ungated mount sat outside it.

## Approving a plan is the permission gate

There is no plan-approval callback. `execute_plan` is classified `external` in
`tools/tool-permissions.ts`, so running a plan is approved where every other
action is approved — one ladder, one dialog, one mode
(`set_permission_mode`) — instead of a second round trip the host had to wire
by hand. `create_plan` produces a plan and stops, so the user sees what will
run before anything does.

A host with nobody to ask fails closed at `execute_plan` rather than inside the
loop, which is what invariant I-4 asks for.
