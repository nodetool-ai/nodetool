# Removing redundant Tool/capability wrapping around the permission gate

Scope: the conversions between `Tool` and capability in
`packages/agents/src/capabilities/adapters.ts`,
`packages/agents/src/capabilities/gate-tools.ts`, and
`packages/agents/src/evals/tool-loop-permission.ts`. Background and the
migration this finishes are in
[tool-class-retirement-design.md](../tool-class-retirement-design.md#where-the-permission-gate-lives).
The per-host gate table is in
[packages/agents/AGENTS.md](../../packages/agents/AGENTS.md#where-the-permission-gate-is-set).

## 1. The problem

The permission ladder runs in one place, `gatedCall` inside
`CapabilityRun.invoke` (`capabilities/invoke.ts`). Several callers reach it by
converting the same operation between representations more than once.

The headless eval path converts five times for one call:

```text
HeadlessTool                                  (evals/tool-loop-bridge.ts)
  → HeadlessSurfaceTool extends Tool          (evals/tool-loop-permission.ts)
    → GatedCapabilityTool                     (capabilities/gate-tools.ts)
      → capabilityFromTool(inner)             (capabilities/adapters.ts), per call
        → createCapabilityRun(...)            one run per call
          → run.invoke → gatedCall → impl
            → HeadlessSurfaceTool.process → HeadlessTool.execute
```

`gateHeadlessTools` then rebuilds a `HeadlessTool` around the result.

Registry capabilities that a host already holds a gated `CapabilityRun` for
take a shorter but still redundant path:

```text
toolForCapabilityName(name, run)              LazyCapabilityTool, calls impl directly
  → gateTools(...)                            GatedCapabilityTool
    → capabilityFromTool(...)                 a second spec for the same name
      → createCapabilityRun(...)              a second run beside `run`
        → gatedCall → LazyCapabilityTool.process → impl(run, args)
```

The sites are `buildAuthoringBelt` (`packages/agents/src/author-graph.ts`) and
the `execute_plan` entries in `buildCliAgentBelt`
(`packages/cli/src/chat-codeact.ts`) and the chat turn
(`packages/websocket/src/session/chat-turn.ts`).

## 2. Decisions

- **D1. Headless tools become capabilities directly.** `gateHeadlessTools`
  builds one `CapabilityExport` per headless tool and one `CapabilityRun` over
  all of them, and each gated `execute` calls `run.invoke`. No `Tool` is
  constructed. This is the completion criterion.
- **D2. A host with a gated run invokes through it.** A new belt adapter,
  `toolInvokingCapability(name, run)`, returns a `Tool` whose `process()` is
  `run.invoke(name, args)`. It replaces `gateTools(toolForCapabilityName(...))`
  where the run already carries the intended gate. The `Tool` stays because
  these belts are still `Tool[]`.
- **D3. Heterogeneous belts keep `gateTools` and `capabilityFromTool`.** The
  chat turn, MCP mount, CLI base belt, Code node, and `AgentNode`
  (`llm-nodes/agent-utils.ts`) gate belts that mix registry tools with
  host-built ones (`RunNodeTool`, UI bridges, sandbox tools, dynamic
  Code-node tools). `capabilityFromTool` is what classifies a non-registry
  tool through `capabilityCategoryFor`. Removing it before those belts are
  capability lists would reach `invoke` with no category. The design doc
  records the same constraint in
  [the survey section](../tool-class-retirement-design.md#the-survey-the-sandbox-packs-and-what-the-count-is-made-of-2026-08-12).
- **D4. Deliberately ungated delegation stays ungated.** `run_subtask`,
  `start_subtask`, `wait_subtasks`, `run_search`, and `create_plan` call their
  implementation directly by design (their children run the gated belt). D2
  applies only to tools that are gated today. Routing the others through
  `invoke` would add approval prompts that do not exist now.
- **D5. `toolFromCapability` is left in place.** It is a one-line alias of
  `toolFromLazyCapability` with two production callers and about twenty test
  callers. Deleting it is a rename, not a removed layer. It can go in a
  separate cleanup PR if wanted.

Kept unchanged: the ladder in `gatedCall` (read fast path, mode decision,
session allow-set, approval, security monitor, clock suspension), argument
validation through `validateCapabilityArgs`, `capabilityCategoryFor` lookup
order, and the approval request records the eval reports.

## 3. Tasks

### A1. Headless eval tools gate without a `Tool` (D1)

Files: `packages/agents/src/evals/tool-loop-permission.ts`,
`packages/agents/tests/tool-loop-eval.test.ts`.

1. Add a module-private `capabilityFromHeadlessTool(tool: HeadlessTool):
   CapabilityExport`:
   - `name` and `description` from the tool.
   - `inputSchema` from `zodToJsonSchema(tool.parameters)`, the same
     conversion `Tool.inputSchema` uses today.
   - `category` from `capabilityCategoryFor(tool.name)`
     (`capabilities/registry.ts`). The `ui_*` names resolve to their
     registered spec categories in `capabilities/ui.specs.ts`, which is what
     the current path produces.
   - No `zodSchema`. `HeadlessTool.execute` already parses with
     `parseWithTypeCoercion`, and the current path does not validate at the
     gate. Adding it would change error shapes the eval cases see.
   - `impl: (_run, args) => tool.execute(args)`.
2. In `gateHeadlessTools`, build the exports once, then one run:
   `createCapabilityRun({ context, gate, capabilities: exports })`. Each
   returned tool keeps name, description and parameters and sets
   `execute: (args) => run.invoke(tool.name, args)`.
   One run for the whole case is equivalent to one run per call: the only
   mutable state is `gate.sessionAllow`, which already lives on the shared gate
   object, and `budget` is read from the same context either way.
3. Delete `HeadlessSurfaceTool` and the imports of `gateTools`, `Tool`, and
   `ZodType`. Rewrite the file header, which currently explains the `Tool`
   detour.
4. Tests:
   - The existing `permission-gated cases` block in
     `tests/tool-loop-eval.test.ts` must pass unchanged. It covers plan-mode
     block, default-mode deny, the ungated case, and default-mode allow with
     recorded requests.
   - Add one test that proves no `Tool` path is used: mock
     `../src/capabilities/gate-tools.js` and `../src/capabilities/adapters.js`
     with implementations that throw, then run the plan-mode and deny cases.
     Confirm the test fails against the current implementation before the
     change.
   - Add a case with two writes in default mode and assert two recorded
     requests. This pins that sharing one run across calls did not change
     approval behaviour.

Acceptance: a headless capability is authorized and executed without
constructing a `Tool`, and all permission tests in
`tests/tool-loop-eval.test.ts` pass.

### A2. Belt tools that invoke through the host's run (D2)

Files: `packages/agents/src/capabilities/lazy-tool.ts`,
`packages/agents/src/capabilities/index.ts`, `packages/agents/src/index.ts`,
`packages/agents/tests/capabilities-gate-parity.test.ts`.

1. Add `toolInvokingCapability(name: string, run: CapabilityRunSource): Tool`
   beside `toolForCapabilityName`. It resolves the spec with `capabilitySpec`
   and throws on an unknown name, as `toolForCapabilityName` does. Its
   `process()` resolves the run from the source and returns
   `run.invoke(this.name, params)`. It does not validate itself, because
   `gatedCall` validates. Name, description, `inputSchema`, `zodSchema`,
   `needsToolCallId`, and `userMessage` come from the spec, sharing the
   `LazyCapabilityTool` accessors (extend that class with a mode flag rather
   than adding a third `Tool` subclass).
2. Update the `lazy-tool.ts` header: it currently says a belt is always gated
   from outside by `gateTools`. State the two modes and when each applies.
3. Export it from `capabilities/index.ts` and `src/index.ts`.
4. Extend `tests/capabilities-gate-parity.test.ts` so each existing parity
   case (read, approve, deny, plan block, auto, `allow_for_chat`, monitor
   block, clock suspension, `_tool_call_id` threading, `_message` stripping)
   also runs through `toolInvokingCapability`. The transcripts must match the
   `invoke` and `gateTools` entrances.

### A3. Move the gated-run call sites to A2 (D2, D4)

1. `buildAuthoringBelt` (`packages/agents/src/author-graph.ts`): the run is
   built with `gate`. Replace
   `gateTools(names.map((n) => toolForCapabilityName(n, run)), gate)` with
   `names.map((n) => toolInvokingCapability(n, run))`. Update the function's
   doc comment. Cover with the existing author-graph tests, plus one test that
   a write-class belt tool in plan mode returns `blocked_in_plan_mode`.
2. `buildCliAgentBelt` (`packages/cli/src/chat-codeact.ts`): `delegationRun`
   already carries `gate`. Replace the `gateTools([toolForCapabilityName(
   "execute_plan", delegationRun)], gate)` block with
   `toolInvokingCapability("execute_plan", delegationRun)`. Leave the other
   delegation tools on `toolForCapabilityName`.
3. Chat turn (`packages/websocket/src/session/chat-turn.ts`): its
   `delegationRun` uses `UNGATED` on purpose. Add a second source,
   `planExecutionRun`, with the same options and `gate: chatGate`, and build
   `execute_plan` with `toolInvokingCapability("execute_plan",
   planExecutionRun)`. Do not change the gate of `delegationRun`.
4. Run the plan-mode tests that already cover `execute_plan` in the CLI and
   websocket packages (`grep -rn execute_plan packages/*/tests`) and confirm
   they pass without edits.

### A4. Documentation

1. `capabilities/gate-tools.ts` header: state that `gateTools` is for belts
   holding tools that are not registry capabilities over a gated run, and name
   `toolInvokingCapability` as the entrance for the rest.
2. `packages/agents/AGENTS.md` § Where the permission gate is set: add one
   sentence naming the two entrances. Run `npm run check:agents-docs`.
3. `docs/tool-class-retirement-design.md` § Where the permission gate lives,
   "What shipped since": replace the sentence saying every `Tool` enters
   through `GatedCapabilityTool` with the current split, and keep D3's reason
   for the remaining `capabilityFromTool` use.

## 4. Order and PR shape

A1 is independent and meets the completion criterion alone. Ship it first.
A2 and A3 go in one PR, because A2 has no production caller without A3.
A4 lands with the PR whose code it describes.

## 5. Verification

For each PR, from the repository root, after `npm run build:packages`:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

A2 and A3 change imports inside `packages/agents/src/capabilities/`. The
`tools/` to `capabilities/` import cycle that once hung the packaged server
is visible only in the bundle, so also run `npm run backend:smoke` for that
PR. `toolInvokingCapability` must not add an import from `tools/` into
`capabilities/` beyond what `lazy-tool.ts` already has.

## 6. Risks

- **R1. Category drift for a headless tool name that is not a registered
  capability.** `capabilityCategoryFor` falls back to the classification map,
  then to `external`, which is the same answer `capabilityFromTool` gives
  today. The A1 tests pin `ui_add_node` as `write` and `ui_get_graph` as
  `read`.
- **R2. Double validation in A2.** `toolInvokingCapability` must not call
  `validateCapabilityArgs` itself. The parity test asserts one
  `invalid_tool_arguments` shape, not a nested one.
- **R3. Gating a tool that is ungated today.** A3 touches only `execute_plan`
  and the authoring belt, both gated now. Any other swap is out of scope
  (D4).

## 7. Out of scope

- Converting heterogeneous `Tool[]` belts to capability lists, which is what
  deleting `capabilityFromTool` and `GatedCapabilityTool` requires (D3).
- Deleting `toolFromCapability` (D5).
- Moving classification from `TOOL_PERMISSION_CATEGORIES` into specs.
