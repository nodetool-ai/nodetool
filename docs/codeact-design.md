# CodeAct Execution Mode — Design

Status: implemented behind `executionMode: "codeact"` (default stays `"tools"`).
Code: `packages/agents/src/codeact/`.

## What this is

An alternative action space for the agent step loop. In the default mode the
model acts by emitting one JSON tool call per action, the host executes it, and
the result comes back as a tool message — one round trip per tool. In CodeAct
mode the model acts by writing a JavaScript program; the program runs in the
QuickJS sandbox where the same toolbelt is exposed as async functions
(`tools.web_search(...)`), and one round trip can chain, loop over, branch on,
and post-process any number of tool calls. The program's output — return value,
console logs, thrown error — comes back as the observation for the next turn.

The research this follows:

- **CodeAct** (Wang et al., ICML 2024, arXiv:2402.01030) — executable code as
  the action space beats JSON/text tool calling: up to +20% success, ~30% fewer
  turns. The core loop here (code action → execution observation → repair) is
  that paper's.
- **CaveAgent** (arXiv:2601.01569) — a *persistent* runtime across turns
  (stateful objects survive between actions) adds +5–13.5% success and ~28%
  fewer tokens on data-heavy tasks. Our `state` object is this: it lives on the
  host and syncs back after every action, so turn N+1 can read what turn N
  computed without re-serializing it through the transcript.
- **MCP design-choice study** (arXiv:2602.15945) and Anthropic's
  *Code execution with MCP* (Nov 2025) — decoupling tool *results* from model
  *context* is where the token savings come from (their headline example:
  98.7% reduction). A CodeAct program can fetch a large payload, reduce it in
  the sandbox, and surface only the reduction; in tool mode the whole payload
  transits the transcript.
- **To Run or Not to Run** (arXiv:2606.26978) — execution isn't free; there are
  regimes where restricting it saves cost with little accuracy loss. That is
  why this is a *mode*, not a replacement: the default stays `"tools"`, and the
  eval suite exists to measure where codeact actually wins before any default
  flips.

## What already exists (and is reused unchanged)

| Piece | Where | Role here |
|---|---|---|
| QuickJS WASM sandbox | `packages/agents/src/js-sandbox.ts` (`runInSandbox`) | Executes every action. All its limits (30 s timeout, 64 MB heap, fetch caps, output truncation, SSRF guard, workspace containment) apply per action. |
| Tool base class + registry | `src/tools/base-tool.ts`, `tool-registry.ts` | The toolbelt is the same `Tool[]` the tool-mode step gets — codeact adds no capability that tool mode doesn't have. |
| Provider loop | `BaseProvider.generateLoop` | Drives the turn loop; codeact presents exactly one provider tool. |
| Result-schema validation | `src/utils/json-schema-validate.ts` | `finish(result)` validates host-side with the same checker `finish_step` uses. |
| Never-reject bridge convention | `js-sandbox.ts` / `script-runner.ts` | Host bridges resolve `{ok, ...}` envelopes; a guest prelude re-throws. Required by the QuickJS handle-leak workaround. |
| Agent memory | `context.memory` | Step/task results land under the same keys; memory tools are in the toolbelt as functions like everything else. |

CodeAct is *not* script mode. `ScriptRunner` orchestrates **sub-agents**
(`agent()` spawns a `StepExecutor`); codeact is what a single step *does
instead of* JSON tool calls. The two compose: a script-mode run whose
sub-steps execute in codeact mode is just both flags set.

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

- **`tools.<name>(args)`** — one async function per tool in the step's
  toolbelt. Calls bridge to `Tool.executeTool` on the host. A tool that
  returns an `{error}` payload throws in the guest, so `try/catch` is the
  error-handling idiom. Per-action tool-call cap (`maxToolCallsPerAction`,
  default 50) so a runaway loop can't drain budgets silently.
- **`state`** — a plain object that persists across actions within the step
  (host-side, synced back after every run via the sandbox's global sync-back).
  Fetch once, reuse every turn; never re-fetch to re-look at something.
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

1. The action contract (write code, observe, repair; `state` discipline; keep
   observations small — return summaries, stash payloads in `state` or
   memory).
2. The tool catalog as **typed signatures**, generated from each tool's JSON
   schema (`await tools.browse({url: string, timeout?: number})` + first
   sentence of the description) — and only for the **resident** set. The
   high-traffic tools nearly every step reaches for (the whole search family
   — `web_search`, `search_nodes`, `run_search`, `google_news`,
   `google_images`, `asset_search`, `grep`, `glob` — plus the Claude-agent
   file set (`read_file`, `write_file`, `edit_file`, `list_directory`),
   browser, HTTP, memory, `run_subtask` — `CODEACT_RESIDENT_TOOL_NAMES`,
   overridable per executor) stay fully documented; once the belt exceeds `CODEACT_DEFER_THRESHOLD` (16),
   everything else is listed by name only and discovered in-sandbox via
   `await searchTools("query")`, which reuses the ToolSearch query grammar
   (`select:`, keywords, `+substr`) and returns each match's signature and
   description. Deferred tools remain callable — the split spends prompt
   tokens, not capability. This is the progressive-disclosure half of the
   Anthropic MCP result.
3. A condensed sandbox API reference (what exists beyond `tools.*`, what is
   blocked, the key limits) derived from the same manifest the Code-node
   prompt uses, so it cannot advertise an API the sandbox doesn't marshal.
4. The output-schema section for schema'd steps.

Caller-supplied system prompts remain preambles, exactly as in
`StepExecutor.buildSystemPrompt` — they cannot override the execution
contract.

## Security posture

The action executes with the same privileges tool mode already grants:

- Every `tools.*` function is a tool the model could have called directly; the
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

- `AgentOptions.executionMode?: "tools" | "codeact"` — threaded through
  `Agent` → `ParallelTaskExecutor` → `TaskExecutor`, which picks the executor
  class per step (`createStepExecutor`). Script mode forwards it to its
  sub-agents; process-mode fan-out steps use it too.
- **The setting**: `NODETOOL_AGENT_EXECUTION_MODE` (`tools` | `codeact`),
  registered in the settings registry so it appears in the Settings UI and
  `nodetool settings`. Resolution precedence, everywhere a mode is resolved
  (`resolveExecutionMode`): explicit option > the setting > `"tools"`. The
  server mirrors the stored value into the environment at startup
  (`applyAgentExecutionModeSetting`); a real environment variable wins over
  the stored value, and a Settings change takes effect on the next server
  start.
- CLI: `nodetool agent run <yaml> --codeact`; the agent YAML also takes
  `execution_mode: codeact`. Flag > YAML > setting.

## Chat turns (websocket runner)

The chat websocket runner honors the same setting: when `resolveExecutionMode()`
says `codeact`, a plain chat turn presents `execute_code` (plus `view_image`,
the one channel that puts pixels into context and so cannot ride the JSON
observation envelope) instead of the toolbelt, and the ToolSearch deferral
machinery is replaced by the in-sandbox `searchTools()`. The adapter is
`createChatCodeActSession` (`packages/agents/src/codeact/chat-codeact.ts`): a
chat toolbelt mixes server tools with client (`ui_*`) tools that exist
server-side only as schemas, so instead of `buildToolBridge` the session
bridges `tools.<name>()` to the chat runner's own `executeTool` router —
permission gating, client round-trips over the ToolBridge, and asset
materialization all stay where they are. `state` persists across the turn's
actions; there is no `finish()` — a plain assistant message ends the turn, and
the prompt says so (`variant: "chat"` of `buildCodeActSystemPrompt`).

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

## Evaluation

`eval codeact` (registered next to `subtask`): objectives with instrumented
tools where the interesting metric is *rounds* and *tool routing*, scored
structurally (required tools invoked, forbidden ones not, action count within
bounds, final result correct). Run the same cases through both modes to get
the paper's comparison on our own toolbelt:

```bash
npm run dev:nodetool -- eval codeact -p anthropic -m claude-sonnet-5
```

Harness tests (`tests/codeact-executor.test.ts`) drive the executor with a
`ScriptedProvider` — tool chaining in one action, `state` persistence across
actions, schema repair after an invalid `finish`, error observations, prose
finalization — no network, no model.

## Non-goals (now)

- Flipping the default. `"tools"` remains until the eval says otherwise per
  the cost-effectiveness caveat above.
- Python actions. The sandbox is JS; the CodeAct result is about code as the
  action space, not about Python specifically.
- Replacing planners. GraphPlanner/ScriptPlanner/CodePlanner already use
  code-shaped *artifacts*; this changes the step execution loop only.
