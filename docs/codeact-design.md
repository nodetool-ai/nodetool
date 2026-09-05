# CodeAct Execution — Design

Status: the only agent execution mode. There is no switch.
Code: `packages/agents/src/codeact/`.
The engine every action runs on: [JavaScript Sandbox](javascript-sandbox.md).

## What this is

The action space of the agent step loop. The older loop had the model emit one
JSON tool call per action, the host execute it, and the result come back as a
tool message — one round trip per tool. Under CodeAct the model acts by writing
a JavaScript program; the program runs in the
QuickJS sandbox where the same toolbelt is imported as async functions
(`import { web_search } from "@nodetool-ai/sandbox-nodetool/web"`), and one
round trip can chain, loop over, branch on,
and post-process any number of tool calls. The program's output — return value,
console logs, thrown error — comes back as the observation for the next turn.

The research this follows:

- **CodeAct** (Wang et al., ICML 2024, arXiv:2402.01030) — executable code as
  the action space beats JSON/text tool calling: up to +20% success, ~30% fewer
  turns. The core loop here (code action → execution observation → repair) is
  that paper's.
- **CaveAgent** (arXiv:2601.01569) — a *persistent* runtime across turns
  (stateful objects survive between actions) adds +5–13.5% success and ~28%
  fewer tokens on data-heavy tasks. An in-sandbox `state` object played this
  role at launch; it is gone now — process-local, LRU-capped per thread on the
  chat runner, and silently lossy across restarts. Durable carry is thread
  memory (`nodetool.memory.*`) plus the `asset://` refs generation calls
  already return.
- **MCP design-choice study** (arXiv:2602.15945) and Anthropic's
  *Code execution with MCP* (Nov 2025) — decoupling tool *results* from model
  *context* is where the token savings come from (their headline example:
  98.7% reduction). A CodeAct program can fetch a large payload, reduce it in
  the sandbox, and surface only the reduction; in tool mode the whole payload
  transits the transcript.
- **To Run or Not to Run** (arXiv:2606.26978) — execution isn't free; there are
  regimes where restricting it saves cost with little accuracy loss. The
  `codeact` eval suite is where that cost/benefit stays measurable.

## What already exists (and is reused unchanged)

| Piece | Where | Role here |
|---|---|---|
| QuickJS WASM sandbox | `packages/agents/src/js-sandbox.ts` (`runInSandbox`) | Executes every action. All its limits (30 s timeout, 64 MB heap, fetch caps, output truncation, SSRF guard, workspace containment) apply per action. |
| Tool base class + registry | `src/tools/base-tool.ts`, `tool-registry.ts` | The toolbelt is the same `Tool[]` a step has always been given — codeact adds no capability of its own. |
| Provider loop | `BaseProvider.generateLoop` | Drives the turn loop; codeact presents exactly one provider tool. |
| Result-schema validation | `src/utils/json-schema-validate.ts` | `finish(result)` validates host-side with the same checker `finish_step` uses. |
| Never-reject bridge convention | `js-sandbox.ts` | Host bridges resolve `{ok, ...}` envelopes; a guest prelude re-throws. Required by the QuickJS handle-leak workaround. |
| Agent memory | `context.memory` | Step/task results land under the same keys; memory tools are in the toolbelt as functions like everything else. |

CodeAct replaced script mode. `ScriptRunner` had an LLM-authored orchestration
script spawn sub-agents through `agent()`; an action does the same thing with
ordinary control flow and `nodetool.agents.run(prompt)`, in the same sandbox,
without a second planner or a second set of budget knobs.

## The action protocol

The model sees **one** provider tool:

```
execute_code({ code: string })
```

Code actions arrive through a tool call rather than fenced text because every
provider adapter already delivers tool calls reliably; scraping code blocks
out of prose is exactly the fragility tool calling was invented to avoid. The
CodeAct paper's gains come from the *action space* being code, not from the
transport being free text.

Inside the sandbox, on top of the standard surface (`console`, `fetch`,
`workspace`, `crypto`, `data`, `format`, …), the action gets:

- **`import { <name> } from "@nodetool-ai/sandbox-nodetool/<namespace>"`** —
  one async function per tool in the step's toolbelt, reached by import; there
  is no `tools.<name>()` global. A name a capability module owns comes from
  that namespace, and a tool the session added at its call site comes from
  `.../session`. Calls bridge to `Tool.executeTool` on the host. A tool that
  returns an `{error}` payload throws in the guest, so `try/catch` is the
  error-handling idiom. Per-action tool-call cap (`maxToolCallsPerAction`,
  default 50) so a runaway loop can't drain budgets silently.
- **Memory** — the durable carry between actions and turns. There is no
  cross-action variable bag: local variables die with the action, `return` is
  the observation only. Generation calls save their result as an asset and
  return its `asset://` uri; an action records what later actions or turns
  need with `nodetool.memory.save` (shown back to the model at turn start).
  Fetch or generate once, reuse every turn; never re-fetch or re-generate to
  re-look at something.
- **`finish(result)`** — completes the step. For schema'd steps the host
  validates against the declared schema; an invalid result throws in the guest
  with the violation list, so the same action can repair and retry, or the
  failure becomes the observation for the next action. Valid `finish` ends the
  provider loop (AbortController, same mechanism as `finish_step`).
- **The action's return value** — becomes part of the observation. Returning a
  small summary of big intermediate data is the context-decoupling move; the
  prompt says so explicitly.

The observation sent back as the tool result is a JSON envelope:

```
{ ok, result?, error?, stack?, logs?, finished?, toolCalls }
```

truncated by the same `truncateToolResult` cap as any tool result (20 000
chars). `toolCalls` is the count consumed, so the model can see budget burn.

### Completion semantics (identical contract to StepExecutor)

- Schema'd step: only a schema-valid `finish(result)` completes. Iterations
  exhausted → explicit failed step, never a silent guess.
- Unschema'd step: `finish(...)` works, and a plain assistant message with no
  tool call also finalizes (its text is the result) — the same prose-mode rule
  the tool-mode executor has.
- Failure reporting, memory writes (`step:<id>`, `task:<id>` with
  `useFinishTask`), and the `ProcessingMessage` stream (`task_update`,
  `step_result`, `tool_call_update`, `chunk`) are byte-compatible with
  `StepExecutor`, so every consumer — CLI tree, web ExecutionTree, script
  runner, supervisor — works unchanged.

Each host-bridged tool invocation is surfaced as a `tool_call_update` (id
`codeact_<n>`), so observability keeps per-tool granularity even though the
provider transcript only carries `execute_code`.

## Prompting

`buildCodeActSystemPrompt` renders:

1. The action contract (write code, observe, repair; memory carry;
   keep observations small — return summaries, save payloads as assets or in
   memory).
2. The tool catalog as **typed signatures**, generated from each tool's JSON
   schema (`await browse({url: string, timeout?: number})` + first
   sentence of the description), grouped under the `import` statement that
   makes each group callable — and only for the **resident** set. The
   high-traffic tools nearly every step reaches for (the whole search family
   — `web_search`, `search_nodes`, `run_search`, `asset_search`, `grep`,
   `glob` — plus the Claude-agent
   file set (`read_file`, `write_file`, `edit_file`, `list_directory`),
   browser, HTTP, memory, `run_subtask` — `CODEACT_RESIDENT_TOOL_NAMES`,
   overridable per executor) stay fully documented; once the belt exceeds `CODEACT_DEFER_THRESHOLD` (16),
   everything else is listed by name only and discovered in-sandbox via
   `await nodetool.searchTools("query")`, which reuses the ToolSearch query grammar
   (`select:`, keywords, `+substr`) and returns each match's signature and
   description. Deferred tools remain callable — the split spends prompt
   tokens, not capability. This is the progressive-disclosure half of the
   Anthropic MCP result.
3. A condensed sandbox API reference (what exists beyond the imports, what is
   blocked, the key limits) derived from the same manifest the Code-node
   prompt uses, so it cannot advertise an API the sandbox doesn't marshal.
4. The output-schema section for schema'd steps.

Caller-supplied system prompts remain preambles, exactly as in
`StepExecutor.buildSystemPrompt` — they cannot override the execution
contract.

## Security posture

The action executes with the same privileges tool mode already grants:

- Every imported function is a tool the model could have called directly; the
  bridge adds **no** capability. Per-step `tools` allow-lists stay a privilege
  boundary — a codeact step only sees its allowed subset.
- The sandbox's own limits bound the new part (arbitrary computation): CPU via
  interrupt handler, heap, fetch count/size/SSRF guard, workspace containment,
  no `eval`/`Function`, no module loader.
- The genuinely new risk (per the MCP design-choice study) is *composition*:
  one action can chain tool calls without per-call visibility in the provider
  transcript. Mitigations: per-action tool-call cap, per-invocation
  `tool_call_update` events (nothing becomes invisible to the host), and the
  30 s default action timeout.
- `finish` validation is host-side; the guest cannot forge a completed step.

## Integration surface

- Every step executor is a `CodeActExecutor`: `Agent` →
  `ParallelTaskExecutor` → `TaskExecutor` construct one per step, and
  `run_subtask` / `run_search` spawn their children the same way. There is no option, setting, or flag selecting
  an action space.
- Two callers stay on `StepExecutor`, the older JSON-tool-call loop, and it is
  no longer exported from the package: `SupervisorAgent` and the app-build
  spec stage. Both are one-shot structured verdicts on a fail-closed path,
  where a sandbox error would add a failure mode and code actions buy nothing.

## Chat turns (websocket runner)

A chat turn with tools presents `execute_code` (plus `view_image`, the one
channel that puts pixels into context and so cannot ride the JSON observation
envelope) instead of the toolbelt; discovery is the in-sandbox
`nodetool.searchTools()`. The adapter is
`createChatCodeActSession` (`packages/agents/src/codeact/chat-codeact.ts`): a
chat toolbelt mixes server tools with client (`ui_*`) tools that exist
server-side only as schemas, so instead of `buildToolBridge` the session
routes every imported belt name to the chat runner's own `executeTool` router —
permission gating, client round-trips over the ToolBridge, and asset
materialization all stay where they are. There is no `finish()` — a plain
assistant message ends the turn, and the prompt says so (`variant: "chat"` of
`buildCodeActSystemPrompt`).

A gated tool call parks the running program on the user's answer, so the turn
carries a **sandbox clock** (`createSandboxClock`): the runner suspends it for
the length of every tool- and plan-approval round trip, and the action resumes
with the budget it had when it asked. Without it the action's wall clock ran
through the prompt and killed the program mid-wait — the dialog was still on
screen, and answering it resolved nothing. Tests:
`packages/websocket/tests/chat-codeact-approval.test.ts`.

### Auto mode reads the action's declared risk

Auto mode used to mean "every call runs, no prompts", which made a code action
the one place a user could lose work they never agreed to lose: the per-call
ladder answers `allow` for every category, so a program that deletes a
workflow ran exactly like one that counted rows.

So `execute_code` carries one more required option, `risk` (`"low"` | `"high"`),
next to `title` and `code`. The model declares it; the host reads it before a
line of the program runs
(`admitCodeAction`, `packages/agents/src/codeact/execute-code-contract.ts`).
In auto mode a `low` action runs unattended and a `high` one asks once — for
the whole action, because the action, not the bridged call, is what the user is
being shown. A denied action never runs, and the refusal is the observation.
"Allow for this chat" is keyed on `execute_code` itself, so it stops the asking
for the rest of the thread.

It fails closed: a call with no `risk`, or one carrying anything outside the
enum, reads as `high`. The program's own imports set a floor under the
declaration (`importedActionRisk`): a static import of an `execute` or
`external` capability — the calls that spend money or leave the account — is
high whatever the call said, and a namespace import of a capability module
takes that module's highest class. A `write` import stays at the declared
risk, because a note the user asked for and a delete share the class and only
the model can tell them apart. Plan and default modes are untouched — their per-call
ladder already blocks or asks, and a second question per action would only
double the prompts. Hosts with no one to ask (the MCP mount, the security
monitor's pass in `Agent`) carry an always-allow `requestApproval`, so nothing
there can deadlock. Tests:
`packages/agents/tests/codeact-action-risk.test.ts`.

## Workflow graph editing: the JS object model

When the belt carries the `ui_*` workflow document tools, code actions get an
object model instead of one bridged call per mutation
(`packages/agents/src/codeact/graph-model.ts`):

```js
const wf = await openWorkflow(workflowId);
const input = wf.addNode("in1", "nodetool.input.StringInput", { name: "prompt" });
wf.addNode("llm1", "nodetool.agents.Agent", {}, { x: 400, y: 120 });
wf.connect("in1", "output", "llm1", "prompt");
wf.node("llm1").setTitle("Draft").set({ system: "be brief" });
await wf.commit();
```

Mutators are synchronous: they update a local mirror (`wf.nodes`, `wf.edges`,
`wf.node(id)`) and queue the equivalent `ui_*` operation. `commit()` replays
the queue through the bridged tools — the same contract the renderer and the
headless document tools implement, so routing, validation, and live-editor
sync are untouched. A failed commit names the failing operation and keeps it
(and everything after it) queued for a retry; removing a never-committed node
cancels its queued ops instead of issuing a delete. Tests:
`packages/agents/tests/chat-codeact.test.ts`.

## The platform as objects: `nodetool.*`

Alongside the graph model, an action gets the `nodetool` object model
(`packages/agents/src/codeact/nodetool-api.ts`): namespaces wrapping belt
tools, so gating and routing stay untouched and a method whose backing tool is
absent throws naming it. The namespaces are `workflows`, `nodes`,
`agents`, `models`, `providers`, `media`, `documents`, `web`, `memory`,
`style`, `email`, `assets`, `jobs`, `collections`, `apps`, `timelines`,
`sketches`, `scripts`, `storyboards`, plus `batch()` for bounded fan-out.

Authoring a graph is not one of them. It is a sandbox package,
`@nodetool-ai/sandbox-dsl`: one generated function per node type, carrying that
node's real inputs, one importable module per namespace. A node type the
catalog does not have has no export, so a hallucinated type fails at import
rather than at validation — the failure mode the string-typed `nodetool.graph()`
builder could not close. `workflow(...terminals)` returns the `{nodes, edges}`
shape `validate_workflow` and `create_workflow` already take.

The pack reaches an action through the session allowlist like any other:
`withGraphDslPackage` (`src/codeact/graph-dsl-package.ts`) adds it when the belt
carries `create_workflow`, `validate_workflow` and `run_workflow` and the
catalog serves the pack. A machine without it installed gets neither the
specifier nor the prompt section naming it.

`web` is the outside world behind one surface: `search(query, {provider})`
picks whichever search backend the belt carries (`"default"`, `"openai"`,
`"google"`, `"dataforseo"` pin one), with `news`, `images`, `browse(url)`,
`fetch(url)`, `download` and `screenshot` alongside. `memory` is the
conversation's durable notes (`memory_*`), `style` the user's
accumulated taste, `email` the Gmail three.

Every wrapped tool is filtered out of the prompt's tool catalog
(`nodetoolApiCoveredToolNames`) — it stays callable through the bridge and
findable via `nodetool.searchTools()`, but `nodetool.*` is its one documented form.
Workspace files are the exception on purpose: they go through the sandbox's own
in-process `workspace.*` API, which costs no tool call, and the prompt's action
contract says so.

## What the belt does not carry

Two shrinks keep the belt to capabilities a model cannot write itself:

- The pure-computation tools (`calculate`, `geometry`, `trigonometry`,
  `statistics`, `unit_conversion`) are gone everywhere, MCP included. Anything
  a model can do by writing code is not a tool. The code tools `run_code` and
  `js` went with them: `execute_code` is the code path, and a second one only
  offered the model a sandbox without the `nodetool.*` API.
- The provider-specific media duplicates — `image_generation`,
  `openai_image_generation`, `google_image_generation`,
  `openai_text_to_speech` — are deleted, because `nodetool.media` already
  covers them through the provider-agnostic `generate_image` /
  `generate_speech`. The provider-specific search names went the same way,
  but their implementations stayed: they are the backends `web_search` /
  the single `web_search` capability routes to, now plain functions rather than
  tools.

## Evaluation

`eval codeact` (registered next to `subtask`): objectives with instrumented
tools where the interesting metric is *rounds* and *tool routing*, scored
structurally (required tools invoked, forbidden ones not, action count within
bounds, final result correct):

```bash
npm run dev:nodetool -- eval codeact -p anthropic -m claude-sonnet-5
```

Harness tests (`tests/codeact-executor.test.ts`) drive the executor with a
`ScriptedProvider` — tool chaining in one action, the absence of a `state`
global, schema repair after an invalid `finish`, error observations, prose
finalization — no network, no model.

## Non-goals (now)

- Python actions. The sandbox is JS; the CodeAct result is about code as the
  action space, not about Python specifically.
- Replacing planners. GraphPlanner/CodePlanner already use code-shaped
  *artifacts*; this changes the step execution loop only.
