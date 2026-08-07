# Agents Package

## Agent Memory (`@nodetool-ai/runtime` → `context.memory`)

Every `ProcessingContext` carries an `AgentMemory` instance at `context.memory`. It is the **single source of truth** for everything shared between steps, tasks, sub-agents, and tools. Do not introduce a parallel result map in any executor — read and write through `context.memory`.

### Access pattern: progressive disclosure via tools

Memory contents are NOT auto-injected into prompts. Agents access memory through three tools that are auto-attached to every step (and to every team iteration):

| Tool | Purpose |
|---|---|
| `memory_list` | Discover available entries (metadata only — keys, titles, kinds, byte sizes) |
| `memory_read` | Fetch full values for specific keys |
| `memory_write` | Publish a value under `shared:<key>` |

The default execution system prompt documents these tools. The user message names only **specific** upstream keys the planner pinned (`step.dependsOn` plus parent-task `dependsOn` via `upstreamMemoryKeys`) — values are pulled on demand.

### Key namespaces

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

memoryKeys.step("step_1");         // "step:step_1"  — step result
memoryKeys.task("research_phase"); // "task:research_phase"  — task result
memoryKeys.input("customer");      // "input:customer"  — caller-supplied input
memoryKeys.shared("note");         // "shared:note"  — cross-agent scratch
```

### Who writes what

| Writer | Trigger | Key | Kind |
|---|---|---|---|
| `CodeActExecutor` | Step completion | `step:<step.id>` | `step_result` |
| `CodeActExecutor` | Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| `TaskExecutor` | Startup / process-mode aggregation | `input:<key>` / `step:<step.id>` | `input` / `step_result` |
| `ParallelTaskExecutor` | After a task completes (idempotent) | `task:<task.id>` | `task_result` |
| `memory_write` tool | Agent / sub-agent publish | `shared:<key>` | `shared` |

`memory_write` is restricted to the `shared:` namespace so agents can't spoof step / task / input results. Internal executors write directly through `context.memory.set` for their owned namespaces.

### Custom prompts are preambles, not replacements

A step executor always builds the default execution prompt (the CodeAct action contract, the output schema, the `finish()` discipline). A caller-supplied `systemPrompt` is layered as a preamble *before* the default — it cannot override the execution contract. Earlier versions allowed this and broke result capture in plan mode.

### Final synthesis: CompilerAgent

`Agent` ends with a dedicated `CompilerAgent` pass after `ParallelTaskExecutor` finishes. The compiler reads the gathered memory snapshot, fetches values via `memory_read`, and produces the final deliverable:

- **Structured mode** (an `outputSchema` is set): `finish_step` is included in the toolset, and the compiler returns a schema-conformant value.
- **Prose mode** (no `outputSchema`): `finish_step` is omitted; the compiler emits a final assistant message and the absence of any tool call ends the loop. The text becomes the result.

The planner is told NOT to create an aggregation/synthesis step — final assembly is the compiler's job. There is no "schema grafted onto the last step" hack anymore.

### Threading task-level deps through executors

`ParallelTaskExecutor` derives `task.dependsOn.map(memoryKeys.task)` and forwards it as `upstreamMemoryKeys` to `TaskExecutor`, which forwards it verbatim to every step executor. The step's user message renders these as `- task:<id>` hints next to the intra-task `step:<id>` deps. The agent calls `memory_read` when it needs the values.

### Tests

- `packages/runtime/tests/agent-memory.test.ts` — unit tests for `AgentMemory`
- `packages/agents/tests/memory-tools.test.ts` — unit tests for `memory_list` / `memory_read` / `memory_write`
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end through `Agent`, including a fake-provider round trip that drives `memory_list` → `memory_read` → `finish_step`
- `packages/agents/tests/_helpers/mock-context.ts` — shared mock context with a real `AgentMemory` for executor tests

When asserting memory writes in tests, prefer `context.memory.has(memoryKeys.task("..."))` and `context.memory.subscribe(...)` over spies on `set` / `storeStepResult`.

For the full API reference, tool schemas, propagation flow, design decisions, and troubleshooting, see [docs/agent-memory.md](../../docs/agent-memory.md).

## JavaScript Sandbox (`src/js-sandbox.ts`)

User-authored JS from `MiniJSAgentTool` and `nodetool.code.Code` runs in a
**QuickJS WebAssembly sandbox** via `@sebastianwessel/quickjs`. The guest lives
in its own WASM heap, so runaway or malicious code can't corrupt the host V8
heap the way it could under the previous `node:vm` implementation.

Hard limits enforced by the runtime. Each row's default can be overridden per
invocation via `RunSandboxOptions.limits`, clamped to the ceiling in the last
column by `resolveSandboxLimits`:

| Limit | Default | Configured by | Ceiling |
|-------|---------|---------------|---------|
| Execution time | `timeoutMs` (30 s) | `setInterruptHandler` (CPU budget) + wall-clock race | — |
| Guest heap | `GUEST_MEMORY_LIMIT` = 64 MB | `runtime.setMemoryLimit` (`limits.memoryLimitBytes`) | 512 MB |
| Call stack | `GUEST_STACK_LIMIT` = 512 KB | `runtime.setMaxStackSize` (`limits.stackLimitBytes`) | 8 MB |
| Fetch calls | `MAX_FETCH_CALLS` = 20 per run | counter inside bridge (`limits.maxFetchCalls`) | 100 |
| Fetch body | `MAX_RESPONSE_BODY_SIZE` = 1 MB | truncation inside bridge (`limits.maxResponseBodyBytes`) | 50 MB |
| Fetch timeout | `FETCH_TIMEOUT_MS` = 15 s | per-request `AbortController` (`limits.fetchTimeoutMs`) | 120 s |
| Output | `MAX_OUTPUT_SIZE` = 100 KB | `serializeResult` truncation (`limits.maxOutputSize`) | 10 MB |
| Random bytes | `MAX_RANDOM_BYTES` = 64 KB | `crypto.getRandomValues` clamp | — |
| Progress reports | `MAX_PROGRESS_CALLS` = 1000 per run, one per `PROGRESS_MIN_INTERVAL_MS` = 100 ms | counter + timestamp inside the bridge | — |
| `data.*` input | `MAX_DATA_INPUT_CHARS` = 5 MB of text | length check inside each bridge | — |
| `data.selectHtml` matches | `DEFAULT_SELECT_HTML_LIMIT` = 100 | `options.limit` | `MAX_SELECT_HTML_LIMIT` = 1000 |

QuickJS's memory limiter counts its own heap objects; string and typed-array
payloads are not charged against it, so `memoryLimitBytes` bites on object
allocation, not on `new Uint8Array(n)`.

Exposed guest surface: `console`, `fetch`, `uuid`, `sleep`, `getSecret`,
`crypto.{randomUUID,getRandomValues,digest,hmac}` (WebCrypto-backed — `digest`
and `hmac` take SHA-1/256/384/512 and accept string or `Uint8Array` input, both
returning a `Uint8Array`), `workspace.{read,write,list,readBytes,writeBytes,
stat,root,copy,move,mkdir,remove}` (requires a `ProcessingContext`; `remove`
deletes one file or one empty directory, never a tree; `copy`/`move` check the
source for read containment and the destination for write containment;
`stat` returns `{exists, size, isDirectory, isFile, isSymlink, modifiedMs,
createdMs, accessedMs}` and reports a missing path as `exists: false` rather
than throwing), the pure guest-side helpers
`toBase64`/`fromBase64`/`toHex`/`fromHex`/`utf8Encode`/`utf8Decode`,
`progress(percent, message?)`, `format.{number,date,relativeTime,list}`,
`data.{parseCsv,toCsv,selectHtml,htmlToMarkdown,parseXlsx,parseYaml,toYaml,
parseXml,unzip,zip,diff}`, and any caller-supplied `globals`. `fetch` sends a
`Uint8Array` body as raw bytes instead of JSON.

`progress` is fire-and-forget: it reports to
`RunSandboxOptions.onProgress`, clamped to 0–100 with the message truncated to
500 chars, and is a no-op when the caller passes no sink. `nodetool.code.Code`
wires it to `context.postMessage({ type: "node_progress", … })`, the same
channel the Python worker uses, so a long-running snippet drives the node's
progress bar.

`data` is the structured-data namespace, all host bridges over libraries that
stay host-side: `parseCsv`/`toCsv` (papaparse — values stay strings, no
`dynamicTyping`, so a column never changes shape between runs), `selectHtml`
(cheerio CSS selection) and `htmlToMarkdown` (turndown), `parseXlsx` (exceljs —
sheets to records, formula cells yield their computed result), `parseYaml`/
`toYaml` (js-yaml), `parseXml` (fast-xml-parser — attributes prefixed `@_`,
text values stay strings), `unzip`/`zip` (fflate — bytes cross host→guest via
the base64-marker rebuild, deep-revived so entry values are real
`Uint8Array`s), and `diff` (unified text diff). Every library is
`await import`ed on first use inside its bridge — lazily, so none sits in any
entry graph, but visibly, so esbuild inlines them into the packaged backend's
single-file `server.mjs` and Vite resolves browser builds for the in-browser
runner. Text inputs cap at `MAX_DATA_INPUT_CHARS`, binary at
`MAX_DATA_INPUT_BYTES`, and `unzip` refuses archives inflating past
`MAX_UNZIP_TOTAL_BYTES`. Members are documented to models via the sandbox
manifest (`code-gen/sandbox-manifest.ts`), which the drift test holds equal to
the real surface. The guest itself has no module loader — `import`/`require`
do not exist — so a host bridge is the only way library-backed behaviour
reaches user code.

`format` exists because QuickJS ships no `Intl`: each member is a host bridge
over `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` and
`Intl.ListFormat`, defaulting to locale `en-US`. All four are async (they follow
the never-reject convention), so a bad locale or option arrives in the guest as
a thrown `Error` carrying Intl's own message. `eval` and `Function` are deleted at init so the user cannot
re-enter dynamic code generation. Core JS (`JSON`, `Math`, `Date`, `Map`,
`URL`, `TextEncoder`, etc.) is QuickJS's native implementation, not a
host-bridged version.

**State sync-back**: object-typed globals are deep-replaced on the host after
the guest runs, so `CodeNode`'s `state` object persists across invocations.
Primitive globals pass by value (no sync).

**Known QuickJS limitations**:
- `url.searchParams.set(...)` doesn't propagate back to the parent URL. Build
  the query via `URLSearchParams` directly.
- Host async functions must never reject — `js-sandbox.ts` wraps them in a
  `neverReject` adapter that returns a tagged error object, which a guest
  prelude rewraps into a real `throw`. Working around a known handle leak in
  `@sebastianwessel/quickjs@3.0.1` (tracked as `list_empty(&rt->gc_obj_list)`
  assertion on runtime dispose).
- Binary crosses the boundary asymmetrically. Guest → host is handled by the
  typed-array serializers (`addSerializer`), so a guest `Uint8Array` reaches a
  bridge as a native one. Host → guest is not: a returned `Uint8Array` arrives
  in the guest as a numeric-keyed plain object. Bridges that produce bytes
  therefore return a base64 marker object and the guest prelude rebuilds a real
  `Uint8Array` — the pattern to follow for any new binary bridge.
- `serializeResult` scans for typed arrays at **any** depth. It used to look
  only one level in, so binary nested deeper fell onto the `JSON.stringify`
  path, where a `Uint8Array` becomes `{"0":137,"1":80}` — lossy, and
  indistinguishable from a user's own integer-keyed map. The streaming path hit
  this every time, since `genProcess` returns an array of yielded objects and
  the bytes are always at depth 2. The walk is cycle-safe and depth-capped
  (`SERIALIZE_MAX_DEPTH`); a cyclic value still falls through to `String`.

## Running Agents from CLI

### Interactive Chat

Every session runs the unified agent loop; `-a, --agent` and `--no-agent` are
accepted for backwards compatibility and do nothing.

```bash
# Start a session
nodetool-chat

# With specific provider and model
nodetool-chat --provider anthropic --model claude-sonnet-5

# With workspace directory
nodetool-chat --workspace /path/to/project

# Connect to WebSocket server
nodetool-chat --url ws://localhost:7777/ws
```

### Piped Input

```bash
echo "Summarize this codebase" | nodetool-chat --provider anthropic
```

### Interactive Commands

```
/agent    — Toggle agent mode on/off
/model    — Set model: /model claude-opus-4-6
/provider — Set provider: /provider openai
/tools    — List enabled tools
```

### Programmatic Usage

```typescript
import { Agent } from "@nodetool-ai/agents";
import { createRuntimeContext } from "@nodetool-ai/runtime";

const ctx = createRuntimeContext({ jobId: "...", userId: "1", workspaceDir: "." });

const agent = new Agent({
  name: "my-agent",
  objective: "Research and summarize AI trends",
  provider,          // BaseProvider instance
  model: "claude-sonnet-5",
  tools: [readFileTool, writeFileTool, searchTool],
  outputSchema: {    // Optional: structured output
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"]
  }
});

for await (const msg of agent.execute(ctx)) {
  // msg.type: "chunk" | "planning_update" | "task_update" | "tool_call_update" | "step_result" | "log_update"
}

const result = agent.getResults();
```

## The core API is in-process (`src/tools/mcp-tools.ts`)

The workflow/node/job/asset tools call NodeTool's own code, never HTTP. There
is no `NODETOOL_API_URL`, no `fetch`, and no server that has to be listening:

| Concern | Where it comes from |
|---|---|
| Workflows, jobs, assets | `@nodetool-ai/models` (`Workflow`, `Job`, `Asset`) |
| Running / debugging a workflow | `runWorkflow` in `@nodetool-ai/execution/service` |
| Interactive escalations | `submitEscalationVerdict` + the `debugSessions` registry, same module |
| Debugging an app | `runApplicationDebug`, same module |
| Building an app | `runApplicationBuild` (`src/app-build/build-service.ts`) |

`@nodetool-ai/execution/service` is the layer the REST routes call too, so a
tool result and the endpoint's response are one function's answer and cannot
drift. `packages/websocket` keeps the Fastify routes, auth and WS transport as
thin adapters over it.

Three things live above this package in the dependency order and arrive by
injection through `getAllMcpTools(options)`:

- `registry` — a `NodeRegistry`. Node discovery needs it, and so does anything
  that executes. Without one those tools answer with a "no node registry in
  this process" error instead of reaching for a network fallback.
- `examples` — the shipped example-workflow catalog (JSON inside the installed
  node packages; only the server walks the metadata roots).
- `exportDsl` — `workflowToDsl` from `@nodetool-ai/dsl`.

The server builds all three in `packages/websocket/src/mcp-tool-deps.ts` and
spreads `mcpToolHostDeps()` into every `getAllMcpTools` call site.

## Script Voicing Tools (`src/tools/script-voice-tools.ts`)

The headless path from a written script to voiced takes and an assembled
voiceover sequence. The editor voices a line over the chat WebSocket's
`generate_media` / `transcribe_audio` RPCs, and the `nodetool.script.*` nodes do
it inside a workflow; an agent outside the browser had neither. These call the
provider directly, save each take as an asset, and write it back onto the
persisted script.

| Tool | Does |
|---|---|
| `list_scripts` | Scripts newest first, with line and voiced counts |
| `get_script` | Cast, lines, and each line's voicing status |
| `voice_script_lines` | TTS per line → a take, current on its line |
| `assemble_script_timeline` | Voiced takes → a saved `timeline_sequences` row |

`get_script` reports the status the editor's gutter shows — `draft` (never
voiced), `stale` (text or voice changed since the take), `voiced`, `no_voice` —
and `voice_script_lines` defaults to every line that is draft or stale, so a
whole script is one call. Each line uses its own voice (its override, else its
speaker's) unless the call passes provider+model+voice to override them all; a
half-specified override is an error, not a guess. Lines are voiced concurrently
(default 3, max 8, 60 per call) and each take lands through a CAS on the row's
`updated_at`.

Synthesis delegates to `GenerateSpeechTool`, so the encoded/streaming-PCM
provider split is handled in one place. Word timings come from a best-effort ASR
pass (`whisper-1` by default, `transcribe: false` to skip it) and ride into the
assembled clips as captions. Take duration is ffprobe's answer, falling back to
the last word timing and then to the 3s placeholder — a take stays assemblable
without an exact length.

The voice rule (`effectiveVoice`), the staleness rule (`needsVoicing`) and the
script → timeline mapping (`buildScriptTimeline`) live in
`@nodetool-ai/timeline`; the editor's "Send to timeline" and
`nodetool.script.ScriptToTimeline` call the same functions, so the three
surfaces cannot drift. Re-assembly rewrites this script's voiceover track in
place and keeps clips other surfaces added.

Tests: `tests/script-voice-tools.test.ts` (in-memory DB, fake provider — no
network).

## Storyboard Render Tools (`src/tools/storyboard-render-tools.ts`)

The headless path from a directed storyboard to rendered media and an assembled
cut. The editor has always had this path — the Storyboard surface builds a
throwaway `TextToImage → Output` / `ImageToVideo → Output` graph per shot and
runs it in the browser — but an agent outside the browser had to author, save,
and run a workflow per shot, or drive the `ui_storyboard_*` tools, which only
work while that board is open. These call the provider directly, save each
result as an asset, and write it back onto the persisted board.

| Tool | Does |
|---|---|
| `list_storyboards` | Boards newest first, with per-board still/clip counts |
| `get_storyboard` | Shots with ids, status, and whether each has a still/clip |
| `render_storyboard_stills` | `text_to_image` per shot → the shot's keyframe |
| `render_storyboard_clips` | `image_to_video` seeded by the keyframe → the shot's clip |
| `revise_storyboard_clip` | `video_to_video` revision of one shot's clip |
| `assemble_storyboard_timeline` | Rendered clips → a saved `timeline_sequences` row |

Both render tools take `targets` (shot ids, indexes, or slugs) and default to
"whatever still needs this step", so a whole board is one call. Shots render
concurrently (default 3, max 8, 24 shots per call). Every write is a CAS on the
row's `updated_at` with a bounded retry, because concurrent renders all land on
the same board document; a conflicting write re-reads and re-applies rather than
clobbering.

The provider and model come from the call, else from the board's own
`imageModel` / `videoModel`. There is no fallback default — an unset model is an
error naming `find_model`, not silent spend on a model nobody chose.

Prompt composition, entity seasoning (`entitiesForShot`, `@nodetool-ai/protocol`)
and the shot → timeline mapping (`buildStoryboardTimeline`,
`@nodetool-ai/timeline`) are the editor's, so a board rendered headlessly matches
one rendered in the UI. Board entities are library assets carrying a
`metadata.nodetool_entity` marker; their descriptors and first reference image
ride along as the `entities` param, which the runtime expands at the provider
layer.

Tests: `tests/storyboard-render-tools.test.ts` (in-memory DB, stubbed
predictions — no provider calls).

## Google Workspace Tools (`src/tools/google-workspace-tools.ts`)

Drive, Gmail, Docs, Sheets and Calendar tools that authenticate with the access
token from the user's Google sign-in — there is no API key. The Supabase Google
login hands the browser a `provider_token`, the web app posts it to
`POST /api/oauth/google/session`, and the server stores it as an
`OAuthCredential` under provider `google`. Tools read it back through the
virtual secret key `GOOGLE_ACCESS_TOKEN`, which `getSecret` routes to
`resolveGoogleAccessToken` (refreshing a stale token when `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set).

They are not in `BUILTIN_TOOL_CLASSES`. A server without a login can never
produce a token, so the chat toolbelt adds them only when
`isGoogleWorkspaceEnabled()` (`@nodetool-ai/config`) is true — Supabase auth
mode, or `NODETOOL_GOOGLE_WORKSPACE=1`. The matching `lib.google.*` nodes are
filtered out of `/api/nodes/metadata` under the same condition.

```ts
import {
  getGoogleWorkspaceTools,
  registerGoogleWorkspaceTools
} from "@nodetool-ai/agents";

if (isGoogleWorkspaceEnabled()) {
  registerGoogleWorkspaceTools();   // makes resolveTool(name) work
  toolbelt.push(...getGoogleWorkspaceTools());
}
```

A missing or revoked credential surfaces as `{ error }` telling the user to sign
in with Google again, rather than throwing — the agent can then pick another
route instead of failing the whole step.

## Plan Approval Gate

`Agent` can pause after planning and present the plan for user approval before
executing it. Wire a callback either as the `requestPlanApproval` option or on
the ProcessingContext under `PLAN_APPROVAL_CONTEXT_KEY` (the websocket runner
sets the context variable for chat-triggered runs, so Agent nodes in plan mode
gate without explicit wiring):

```typescript
const agent = new Agent({
  ...,
  requestPlanApproval: async (plan) =>
    userSaysYes(plan) ? { decision: "approve" } : { decision: "reject", feedback: "..." }
});
```

- **approve** — execution proceeds.
- **reject with feedback** — the planner re-runs with the feedback appended to
  the objective (bounded by `MAX_PLAN_REVISIONS`, 3) and the revised plan is
  presented again.
- **reject without feedback** — the run ends; `getResults()` returns a
  rejection notice.

The gate emits `planning_update` events with phase `awaiting_approval`
(status Running/Success/Failed) and `revision` so UIs can show state. Over the
websocket this round-trips as `plan_approval_request` / `plan_approval_response`
messages; the web chat renders a `PlanApprovalCard` with approve/reject and a
feedback field. Without a callback, planning flows straight into execution as
before. Tests: `packages/agents/tests/plan-approval.test.ts`.

## Parallel Task Execution

The Agent class automatically decomposes objectives into parallel tasks via `TaskPlanner.planMultiTask()`. Tasks form a DAG — independent tasks run concurrently.

### How It Works

1. **Planning**: LLM generates a `TaskPlan` with multiple `Task` objects, each with `dependsOn` arrays
2. **Scheduling**: `ParallelTaskExecutor` finds tasks with satisfied dependencies and runs them concurrently
3. **Merging**: `mergeAsyncGenerators()` interleaves message streams from concurrent tasks
4. **Completion**: Results propagate to dependent tasks; cycle repeats until all tasks finish

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

Provide a pre-defined `task` to bypass the planning phase:

```typescript
const agent = new Agent({
  objective: "...",
  provider, model,
  task: {
    id: "my-task",
    title: "Direct task",
    steps: [
      { id: "s1", instructions: "Do X", dependsOn: [], completed: false, logs: [] },
      { id: "s2", instructions: "Do Y", dependsOn: ["s1"], completed: false, logs: [] }
    ]
  }
});
```

### Concurrency Defaults

| Constant | Default | Location |
|----------|---------|----------|
| `DEFAULT_MAX_TASK_ITERATIONS` | 100 | `parallel-task-executor.ts` |
| `DEFAULT_MAX_STEP_ITERATIONS` | 10 | `parallel-task-executor.ts` |
| `DEFAULT_MAX_STEPS` | 50 | `task-executor.ts` |
| `MAX_RETRIES` (planning) | 3 | `task-planner.ts` |

### One policy per run (`agent-policy.ts`)

`Agent` resolves `maxSteps`, `maxStepIterations`, `maxTokens`,
`maxConcurrentAgents` and `maxAgentCalls` into a single `AgentPolicy`
(`resolveAgentPolicy`, defaults in `DEFAULT_AGENT_POLICY`) and hands the same
object to every mode — single task, multi-task plan, script, graph. A knob
therefore means the same thing everywhere: `maxTokens` reaches the script and
graph runners, `maxSteps` bounds multi-task runs, and task/fan-out dispatch is
capped by the same semaphore script mode has always had
(`utils/merge-generators.ts`). The plan-approval gate is likewise a property of
the run, not of the planning mode: script and graph artifacts go through it too.

### Step failure is terminal, not completion

A step that fails sets `step.failed` + `step.error` and leaves `completed`
false, and its `step_result` carries the protocol-level `error` field. Nothing
downstream may treat a failure as a satisfied dependency: `TaskExecutor` blocks
dependents and marks them failed with the blocking step named, and a plan whose
every task failed throws instead of compiling a deliverable out of nothing.

## CodeAct Execution (`src/codeact/`)

The action space of the step loop, and the only one. Each step acts by writing
JavaScript that runs in the QuickJS sandbox with the toolbelt exposed as
`tools.<name>()` functions, a `state` object that persists across actions, and
`finish(result)` for host-validated completion. Design and the research it
follows (CodeAct, ICML 2024): docs/codeact-design.md.

- `CodeActExecutor` keeps the message contract, memory writes, and failure
  semantics the step loop has always had — consumers work unchanged. Bridged
  tool calls surface as `tool_call_update` events (ids `codeact_<n>`).
- Progressive disclosure: resident tools (`CODEACT_RESIDENT_TOOL_NAMES` —
  the search family incl. `web_search`/`search_nodes`/`run_search`/
  `asset_search`/`grep`/`glob`, the Claude-agent file set
  (`read_file`/`write_file`/`edit_file`/`list_directory`), browser, HTTP,
  memory, `run_subtask`) are documented in full; past `CODEACT_DEFER_THRESHOLD` tools, the rest is name-only in the
  prompt and discovered in-sandbox with `await searchTools("query")`
  (ToolSearch grammar). All tools stay callable either way.
- Every step executor is one: `TaskExecutor`, `ParallelTaskExecutor`,
  `ScriptRunner`'s `agent()` sub-agents, `run_subtask`, and `run_search` all
  construct `CodeActExecutor`. `StepExecutor` — the older one-JSON-tool-call
  loop — is no longer exported; two callers keep it because they are one-shot
  structured verdicts on a fail-closed path where a sandbox error would only
  add a failure mode: `SupervisorAgent` and the app-build spec stage.
- Chat turns run in it too: the websocket runner swaps the toolbelt
  for `execute_code` (+ `view_image`) via `createChatCodeActSession`
  (`src/codeact/chat-codeact.ts`), which bridges `tools.<name>()` to the chat
  runner's own tool router instead of `buildToolBridge` — permission gating
  and client (`ui_*`) round-trips stay where they are. When the belt carries
  the `ui_*` workflow document tools, actions also get the graph object model
  (`src/codeact/graph-model.ts`): `openWorkflow()` returns a model whose
  synchronous mutators queue ops against a local mirror and `commit()` replays
  them through the same `ui_*` contract.
- Both executors also load the `nodetool` object model
  (`src/codeact/nodetool-api.ts`): the platform as objects instead of raw
  `tools.*` calls — `nodetool.workflows` (list/get/run/start/debug/validate/
  create/open), `nodetool.graph()` (an ad-hoc graph builder with
  `ref.output()` wiring, `copyFrom()` graph-into-graph copying with id
  remapping, `validate()`, `save()`, and `run()` — save-as-`codeact-adhoc` +
  run), `nodetool.batch(items, fn, {concurrency})` for bounded fan-out (run a
  workflow once per CSV row), `nodetool.models` (`pick(capability)` resolves
  one ranked model; `find`/`list` for the long form), `nodetool.providers`
  (roster derived from the model catalog), and `nodetool.media`
  (`generateImage/editImage/generateVideo/animateImage/speak/transcribe/embed`
  plus the judge loop `critique/compare/scoreAdherence`, each taking a
  pick/find result or `"provider/model_id"`), `nodetool.nodes`
  (`search/info/list` — the graph builder's discovery half),
  `nodetool.documents` (convert, PDF text/tables, markdown↔pdf),
  `nodetool.apps` (`build/debug`), `nodetool.agents` (`run(prompt)` spawns a
  `run_subtask` child with a fresh context; `fanout(prompts, {concurrency})`
  batches them), the single-node harness on `nodetool.nodes.run(type,
  inputs)`, plus `assets`, `jobs` (with
  `wait(id, {timeoutMs, pollMs})` polling a background job to settlement),
  `collections` (full RAG loop: `index/indexBatch/search/hybridSearch/query`),
  `timelines`, `sketches`, `scripts`, and `storyboards`. `workflows` also
  carries `resolve(sessionId, escalationId, action)` for interactive-run
  escalations and `examples()`/`example("<package>/<name>")` feeding
  `copyFrom`. Every method wraps a
  belt tool, so gating and routing are untouched; a method whose backing tool
  is missing throws naming the tool, and the prompt section documents only the
  namespaces the belt can serve (`buildNodetoolApiPromptSection`). One surface
  per capability: tools the object model wraps
  (`nodetoolApiCoveredToolNames`, plus `GRAPH_MODEL_TOOL_NAMES` when the graph
  model loads) are filtered out of the prompt's tool catalog — they stay
  callable through the bridge and findable via `searchTools()`, but the
  `nodetool.*` form is the only documented one.
- Eval suite `codeact` scores the executor on offline instrumented cases:
  `nodetool eval codeact -p <p> -m <m>`.
- Tests: `tests/codeact-executor.test.ts`, `tests/codeact-eval.test.ts`,
  `tests/chat-codeact.test.ts`, `tests/nodetool-api.test.ts` (scripted
  provider, real sandbox, no network).

## Script Mode (code-shaped orchestration)

The third planning mode next to `TaskPlan` and the graph planner: the LLM
authors a JavaScript *orchestration script* (`ScriptPlanner`), and
`ScriptRunner` executes it in the QuickJS sandbox. Every `agent()` call in the
script runs a real `CodeActExecutor` sub-agent on the host. A script expresses
what a static DAG cannot — loops until a condition holds, budget-scaled
fan-out, dedup between rounds, early exit.

```typescript
const agent = new Agent({
  name: "researcher",
  objective: "Find and verify 5 claims about X",
  provider, model,
  useScriptPlanner: true,          // LLM writes the script
  // script: "...",                // or supply one directly (skips planning)
  maxConcurrentAgents: 8,          // semaphore over concurrent agent() calls
  maxAgentCalls: 100               // lifetime cap per run
});
```

Guest API (see `SCRIPT_PRELUDE` in `script-runner.ts`):

| Primitive | Behavior |
|---|---|
| `await agent(prompt, opts?)` | Run a sub-agent. `opts.schema` → structured result via `finish_step`; `opts.tools` restricts the toolset; `opts.label` names progress events. Throws on failure. |
| `await parallel(thunks)` | Concurrent thunks; a failure resolves to `null` instead of rejecting the batch. |
| `await pipeline(items, ...stages)` | Each item flows through all stages independently (no barrier). Stages receive `(prev, originalItem, index)`. |
| `log(message)` | Emits a `log_update` to the host event stream. |
| `budget` | `maxAgentCalls`, `agentCalls()`, `remainingCalls()`, `await spentUsd()`. |
| `inputs` | Caller-supplied inputs object. |

The script's `return` value becomes `agent.getResults()`. Sub-agents share
`context.memory` as usual, and concurrency is bounded host-side by a semaphore
(`maxConcurrentAgents`, default 8) plus a lifetime call cap (`maxAgentCalls`,
default 100) — calls past the cap fail with a budget error the script can
handle (`budget.remainingCalls()` guards loops). Script failures (syntax
error, uncaught exception, wall-clock timeout — default 60 min including
sub-agent time) throw from `Agent.execute`.

Host bridges never reject (the QuickJS handle-leak rule from
`js-sandbox.ts` applies): `__runAgent` resolves `{ok, result|error}` envelopes
and the guest `agent()` re-throws.

Tests: `tests/script-runner.test.ts`, `tests/script-planner.test.ts`,
`tests/agent-script-mode.test.ts`.

## Graph Mode (one-shot DSL planning)

`GraphPlanner` builds a workflow graph by having the LLM write ONE graph DSL
program instead of a tool call per node/edge. Discovery tools (`search_nodes`,
`get_node_info`, `list_nodes`, `find_model`) stay; construction goes through a
single `submit_graph(code)` tool. The program is plain JavaScript with the
same wiring semantics as `@nodetool-ai/dsl` — `node(type, properties)` creates
a node, passing `ref.output(slot?)` as a property value becomes an edge, and
the program ends with `return graph();`:

```js
const prompt = node("nodetool.input.StringInput", { name: "prompt" });
const image = node("nodetool.image.TextToImage", {
  prompt: prompt.output(),
  model: { provider: "fal_ai", id: "fal-ai/flux/schnell" }
});
node("nodetool.output.ImageOutput", { name: "image", value: image.output() });
return graph();
```

The program runs in the QuickJS sandbox (`evaluateGraphDsl` in
`src/graph-dsl.ts` — no host access), is loaded into a `GraphBuilder`, and
validated structurally plus with node-sdk's `validateGraph`. Failures return
as the `submit_graph` tool result, so the model fixes the program and
resubmits over feedback rounds; an accepted submission ends the loop. The
outer retry (`maxRetries`, default 3) carries the last program and its errors
into a fresh attempt when the model stops without an accepted graph.

Tests: `tests/graph-dsl.test.ts`, `tests/graph-planner-coverage.test.ts`,
`tests/graph-planner-loop.test.ts`.

### Eval suite

`src/evals/` carries a provider-agnostic evaluation harness for the planner:
`GRAPH_PLANNER_EVAL_CASES` (objectives + structural expectations — input
wiring, node-family patterns, branch handles, no provider-locked nodes) and
`runGraphPlannerEval` (metrics per case: accepted, score, submit rounds,
tool calls, attempts, duration, cost; aggregate: success rate, one-shot rate,
averages). Run it against any registered provider:

```bash
npm run dev:nodetool -- eval graph-planner --list
npm run dev:nodetool -- eval graph-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-planner -p ollama -m qwen-3.5:4b --cases summarize
npm run dev:nodetool -- eval graph-planner -p openai -m gpt-5.4-mini --json --out report.json
npm run dev:nodetool -- eval graph-planner -p anthropic -m ... --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/graph-planner-eval.test.ts`.

### End-to-end eval suite (`graph-e2e`)

The `graph-planner` suite stops at the graph: it scores structure, which says
nothing about whether the workflow does what was asked. `src/evals/graph-e2e-
{cases,eval}.ts` closes that loop — every case runs three phases and only counts
as a success when all three hold:

1. **plan** — `GraphPlanner.plan()` produces a graph, scored structurally by the
   same `checkExpectations` the graph-planner suite uses.
2. **execute** — `applyRunPolicy` stamps the run's provider/model onto the
   planner's Agent nodes (the planner leaves them model-less on purpose — the
   run owns that choice — so an unstamped graph dies on "Select a model"),
   then the graph runs for real with the case's inputs as run params, through a
   caller-supplied `GraphRunner`. The runner is injected so this package needs
   no execution dependency and the harness tests can drive scripted runs with
   no kernel; the CLI wires the real one over `ExecutionSession`
   (`packages/cli/src/evals/graph-runner.ts`).
3. **judge** — deterministic output checks (an output by name exists, is
   non-empty, matches/doesn't match a literal) plus an LLM judge
   (`src/evals/goal-judge.ts`) that reads the case's goal statement and the
   actual outputs and answers `{achieved, score, reasoning}` as plain JSON. A
   regex cannot tell a real German translation from the English echoed back;
   the judge can. A provider failure or unparseable answer is reported as a
   judge error, never as a pass.

Metrics per case: planned, executed, goalAchieved, score, submit rounds, node/
edge counts, plan and run duration, cost, plus the outputs themselves.
Aggregate: end-to-end success rate (the `--min-success` gate), plan rate,
execution rate, mean score. Cases whose graph needs a real model
(`needsModelProviders`) skip without configured providers; the two deterministic
cases (`concat`, `arithmetic`) run anywhere and use `skipJudge`, since their
outputs are pinned exactly by pattern.

Each case costs inference twice — the run, then the judge — so it is the most
expensive suite here. A full pass on `claude_agent_sdk`/`sonnet` runs ~$0.07.

```bash
npm run dev:nodetool -- eval graph-e2e --list
npm run dev:nodetool -- eval graph-e2e -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-e2e -p openai -m gpt-5.4-mini --cases concat,arithmetic
npm run dev:nodetool -- eval graph-e2e -p anthropic -m ... --timeout 600000 --min-success 0.8
```

Harness tests (scripted provider, fake runner, no network):
`tests/graph-e2e-eval.test.ts`.

### Code node authoring eval (`code-gen`)

`src/evals/code-gen-{cases,eval}.ts` drives the real `CodePlanner` over eight
cases — one per authoring shape the feature targets (reshape, merge/join,
compute, extract/parse, split, format, validate, seed) — and scores each
accepted `submit_code` submission structurally: declared outputs present and
typed, inputs limited to the slots the dialog offered, the destination-handle
case's expected output present with the right type, every declared output
assigned on every visible return path (`analyzeGeneratedCode`), no `state`/
`yield` when nobody asked, and no name that is neither sandbox API
(`unknownApiReferences`) nor bound by the code itself (`collectBoundNames`).

Acceptance is reported twice: **first-pass** (accepted on round 1, before the
tool fed anything back) and **post-repair** (accepted at all within the round
cap). `--min-success` gates on post-repair.

```bash
npm run dev:nodetool -- eval code-gen --list
npm run dev:nodetool -- eval code-gen -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval code-gen -p openai -m gpt-5.4-mini --min-success 0.9
```

Harness tests (scripted provider, no network): `tests/code-gen-eval.test.ts`.

### Planning-mode eval suites (`task-planner`, `script-planner`)

The graph-planner suite covers graph mode. The other two planning modes have a
suite each, both scoring the *plan* statically — nothing is executed.

**`task-planner`** runs `TaskPlanner.planMultiTask` and scores the committed
`TaskPlan`. `PlanBuilder` already rejects structurally broken plans (duplicate
step ids, dangling deps, cycles), so anything that comes back is valid by
construction; what it cannot judge is quality, and that is the suite:
parallel width, decomposition proportional to the objective, real dependencies
modelled as dependencies, tool routing (`run_python` for arithmetic, not a
reasoning step), the step-id prefix convention, and the prompt's hard rule that
final synthesis belongs to the Compiler, not to an "assemble" task. Metrics per
case: tasks, steps, parallel width, critical-path depth, planner tool calls,
rejected `add_task`/`finish_plan` calls; aggregate adds a **clean rate** — the
fraction of plans built without a single rejected call.

**`script-planner`** runs `ScriptPlanner.plan` and scores the authored
orchestration script by static analysis. `validateScript` already gates the
submission (non-empty, calls `agent(`, has a `return`, compiles); the suite
checks the control flow the objective demands — `parallel()`/`pipeline()` for
independent work, a real `for`/`while` for unknown-size discovery, a
`budget.remainingCalls()` guard on that loop, a `schema:` on the aggregating
call — plus universal checks that the script does not shadow a prelude name
(`agent`, `parallel`, `budget`, …), does not use `import`/`require` (no loader
in the guest), and stays inside a character budget. Metrics: `agent()` call
sites, script length, submit rounds, rejected submissions, one-shot rate.

Cases + expectations live in `src/evals/{task,script}-planner-cases.ts`, the
runners in `src/evals/{task,script}-planner-eval.ts`. Both offer the same
never-executed tool library (`src/evals/planner-tools.ts`: `web_search`,
`fetch_page`, `read_file`, `write_file`, `run_python`, `generate_image`) so the
planner has something concrete to route work to.

```bash
npm run dev:nodetool -- eval task-planner --list
npm run dev:nodetool -- eval task-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval script-planner -p openai -m gpt-5.4-mini --min-success 0.8
IS_SANDBOX=1 npm run dev:nodetool -- eval task-planner -p claude_agent_sdk -m sonnet --no-find-model
```

Harness tests (scripted provider, no network):
`tests/task-planner-eval.test.ts`, `tests/script-planner-eval.test.ts`.

**Cost reads `$0` on these two under `claude_agent_sdk`.** Both planners abort
the provider loop from inside the accepting tool (`finish_plan` /
`submit_script`), and the SDK only reports token usage on its terminal `result`
message — which a cancelled query never emits. The run is not free; the usage
is simply unobservable. Score, timing, and call counts are unaffected.

### Tool-loop eval suites (frontend `ui_*` surfaces)

Where the graph-planner eval measures one-shot DSL authoring, the tool-loop
harness measures the incremental, multi-turn tool-calling flow the browser UI
and the agent WebSocket bridge actually expose. A real provider is handed the
frontend tool contract (names/descriptions/Zod schemas mirrored from
`web/src/lib/tools/builtin/*`) and drives it against a **headless bridge** —
a node-side fake that holds the same state shape and applies the same
mutations, with no browser. `runToolLoopEval` (`src/evals/tool-loop-eval.ts`)
is generic over the surface: a case supplies a `createBridge` factory
(`HeadlessSurfaceBridge<TFinal>` — `{ tools, finalState }`) plus structural
expectations, and the runner reports the same metrics as graph-planner
(accepted, score, tool calls, duration, cost). Scoring is structural
(`checkToolLoopExpectations`: required/forbidden tools, ordering, final-state
predicates, tool-call budgets, no-error-results) — never an exact transcript,
so many valid tool orderings pass.

**Checks carry a severity, and the score weighs them by it** (3/2/1 for
`critical`/`standard`/`advisory`, `scoreToolLoopChecks`). Whether the required
tools were called, what the final state looks like, and every escalation check
are `critical`; ordering and no-error-results are `standard`; the tool-call
budgets are `advisory`. A run that fails any critical check is additionally
capped at `CRITICAL_FAILURE_SCORE_CAP` (0.5).

The flat pass-fraction this replaced made scores non-comparable. A live sonnet
run of `confirm-before-delete` deleted the dead branch without ever asking —
the one behavior that case exists to measure — and scored **0.62**, because the
graph it produced satisfied every state predicate. The same run of
`escalate-missing-capability` escalated correctly, built the fallback the user
described, and scored **0.92**, docked only for exceeding a call budget. Under
weighting the first is capped at 0.5 and the second lands near 0.97, which is
the ordering the numbers should have had. `criticalFailures` per case makes it
visible without reading the check list, and the text report prefixes those
failures with `[critical]`.

Severity also decides the gated metric. A case is a **success** only when the
loop completed *and* no critical check failed, and `successRate` — what
`--min-success` reads — counts those. "The loop ran to a stop without a
provider error" is reported alongside as `completionRate`: it is a liveness
signal, not a result, and a model that called zero tools scores 100% on it.

Ten suites are registered:

| Suite | Tools | Bridge (`src/evals/`) |
|---|---|---|
| `tool-loop` | `ui_*` graph editor | `tool-loop-bridge.ts` |
| `workflow-escalation` | `ui_*` graph editor + `ask_user` | `tool-loop-bridge.ts` + `escalation.ts` |
| `script-tools` | `ui_script_*` | `surfaces/script.ts` |
| `sketch-tools` | `ui_sketch_*` | `surfaces/sketch.ts` |
| `timeline-tools` | `ui_timeline_*` | `surfaces/timeline.ts` |
| `storyboard-tools` | `ui_storyboard_*` | `surfaces/storyboard.ts` |
| `model3d-tools` | `ui_3d_*` | `surfaces/model3d.ts` |
| `app-tools` | `ui_app_*` App Builder | `surfaces/app.ts` |
| `thread-memory-tools` | `thread_memory_*` / `asset_*` | `surfaces/thread-memory.ts` |
| `creative-pipeline` | the three creative surfaces, composed, plus `ui_brief_*` / `ui_review_*` | `surfaces/creative-pipeline.ts` |

`creative-pipeline` is the long-horizon suite: one commission carried through
brief → ideation → sketch → storyboard → cut → review, scoring the *seams*
rather than any one surface. It composes the real sketch, storyboard and
timeline bridges instead of reimplementing them, so it cannot drift from the
three suites that already cover those contracts, and replaces
`ui_storyboard_assemble_timeline` with a version that actually drives the
timeline bridge — the handoff is the thing under test. `ui_brief_*` and
`ui_review_*` are eval instrumentation, not a frontend contract: a brief passed
only in the prompt can't be told apart from one the model ignored.

Rendered clips come back 1.35× the requested length, the way a video model that
emits fixed-length takes does, so a cut planned to exactly fill the brief
overruns. Catching that and trimming — the *last* clip, since shortening an
earlier one only opens a gap and leaves the runtime untouched — is what
separates a scoring run from a passing-looking one.

The predicates grade outcomes, not the shape of the process. Three checks were
rewritten after live runs, all the same mistake: they encoded one valid working
order and failed models that used another.

- Severity was a three-value enum that threw on `"critical"`, failing a run on
  this harness's vocabulary. Synonyms now map.
- Overrun detection grepped the note prose for runtime/duration/length, and
  scored a run that found the overrun and fixed it as a miss on wording. It
  now reads the severity the model assigned.
- `reviewActedOn` counted edits after the first review note, requiring
  report-before-fix. A sonnet run assembled at 16.20s, trimmed and
  ripple-moved to 12.00s, verified with `ui_review_get_cut` and *then* filed
  notes as a sign-off — a complete loop scored as "review changed nothing". It
  is now `cutRevisedAfterAssembly`, which accepts either order.

Measured on `claude_agent_sdk`/sonnet: `full-pipeline` 1.00 in 93 calls (401s,
~$2.6), `review-catches-overrun` 1.00 in ~25, `brief-constraints-hold` 0.91 in
97. The SDK throws on its turn cap rather than stopping, so a low cap scores
the whole case zero — `--max-iterations 220` clears the full case. The suite
costs real money.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval creative-pipeline \
  -p claude_agent_sdk -m sonnet --max-iterations 220 --no-find-model
```

`scripts/dump-creative-run.ts` runs one case and writes the work itself —
concepts, style-frame prompt, shot list, the assembled cut with timings, review
notes, phase snapshots and the full tool transcript — to
`nodetool-debug/creative-<case>.{md,json}`. The eval report gives pass/fail and
call counts, which is right for a scoreboard and useless for seeing what the
model made.

```bash
IS_SANDBOX=1 npx tsx packages/agents/scripts/dump-creative-run.ts \
  full-pipeline claude_agent_sdk sonnet 220
```

**Live media (`--live`).** The suite fakes every generate/render, which is what
makes it a CI-priced eval. Pass `--live` and the same tool calls additionally
hit fal, so the run leaves real stills and clips in
`nodetool-debug/creative-<case>-media/` without changing a tool contract or a
predicate. One run's output is checked in at `docs/evals/creative-pipeline/`
so the suite's media can be inspected without paying for a run. `MediaBackend` is an interface in the bridge; the fal wiring lives in
the script, because `packages/agents` has no fal dependency and should not grow
one for an opt-in path.

Stills default to `openai/gpt-image-2`, clips to
`ltx-2-19b/distilled/image-to-video`; override with `CREATIVE_IMAGE_MODEL` /
`CREATIVE_VIDEO_MODEL`. The first draft used `flux/schnell` at $0.003 per
megapixel on cost grounds and it was the wrong trade — flux mangles hands and
the brief requires them in three of four shots. Video stays cheap at $0.0008
per megapixel; the agent loop driving the run is still the dominant cost at
~$2.60.

Three caveats. The timeline still lays clips at the simulated overshoot, so the
scored runtime is not the runtime of the files on disk — LTX returned 4.84s
takes for 3s requests, a 1.61× overshoot against the 1.35× modelled, so the
planted defect is conservative. The provider reads `FAL_API_KEY`, not
`FAL_KEY`. And no predicate can see the pixels: `forbiddenAvoided` reads shot
text and layer names, so a run passed it while gpt-image-2 branded a bottle
with lettering the brief forbade. The suite grades the plan; grading the
artifact needs a human or a vision model.

```bash
FAL_API_KEY=$FAL_KEY IS_SANDBOX=1 npx tsx \
  packages/agents/scripts/dump-creative-run.ts full-pipeline claude_agent_sdk sonnet 220 --live
```

#### Interactive escalation (`workflow-escalation`)

Every other tool-loop case is fully specified: the prompt carries everything the
model needs, so guessing is never required and never penalized. This suite
removes that guarantee. Each case withholds something only the user can supply
— the names for an input and output, permission to delete a node, a choice
between two node types that fit equally well, a capability the catalog does not
have — and hands the model an `ask_user` tool wired to a **scripted user**
(`src/evals/escalation.ts`). The question is matched against the case's reply
script, the matching reply comes back as the tool result, and every exchange is
recorded.

That makes the score a pair, not a single judgement: `escalation.mustAsk` names
the reply the model has to trigger, and the case's `finalState` predicates check
that it then built what the answer said. A model that guesses fails on the ask;
one that asks the right question and ignores the reply fails on state. An
off-script question gets a deliberately useless fallback answer and trips
`allQuestionsMatched`, and `askBefore` is the confirm-before-you-act constraint
— `ui_delete_node` must not precede the first `ask_user`.

The fifth case, `no-escalation-needed`, guards the opposite failure: the
objective pins every value, `ask_user` is on the table, and reaching for it is
itself the failure. Without it the suite would reward a model that asks about
everything.

Escalation is a property of the generic runner, not of the graph surface — any
tool-loop case on any surface can declare `escalation` and get the same tool and
the same checks.

```bash
npm run dev:nodetool -- eval workflow-escalation --list
npm run dev:nodetool -- eval workflow-escalation -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval workflow-escalation -p openai -m gpt-5.4-mini --min-success 0.8
```

Measured on `claude_agent_sdk`/sonnet (`--max-iterations 40 --no-find-model`,
5/5 accepted, $0.80 for the suite, scored before check weighting landed):
`ask-for-missing-names` 1.00 in 13 calls, `ask-which-step` 1.00 in 7,
`no-escalation-needed` 1.00 in 9, `escalate-missing-capability` 0.92 in 30 (24
of them `ui_search_nodes`, hunting for an image node the catalog doesn't have
before accepting it isn't there), and `confirm-before-delete` 0.62 — it read the
graph, deleted the dead branch, and never asked. The destructive-confirmation
case is the one models fail here.

Harness tests, including a golden transcript per case so no case can be
unsatisfiable: `tests/escalation-tool-loop.test.ts`.

`thread-memory-tools` is the odd one out: instead of reimplementing a browser
surface, its bridge executes the **real backend tools** (`thread_memory_save`/
`list`, `asset_search`) plus a stub `generate_image` against an in-memory DB
(`initTestDb`), so it exercises the actual persistence + resource validation a
chat turn does. It scores the creative loop: generate media → remember it with
an asset reference → recall it.

Bridges reuse the pure packages where the real logic already lives —
`@nodetool-ai/timeline` (`splitClip`, `ANIMATION_PRESETS`, subtitle assembly,
clip/track factories) — rather than reimplement. The sketch surface reimplements
its layer-stack ops directly (the image-editor package carries only types, no
reusable layer logic).
Browser-only tools (image/asset capture, WebGL viewport render) are scoped out:
`ui_sketch_get_layer_image`, `ui_sketch_render_to_asset`,
`ui_timeline_get_clip_frames`, `ui_3d_capture_view`. Storyboard cannot import
`@nodetool-ai/llm-nodes` (it depends on `@nodetool-ai/agents`), so its
generate/render jobs are faked by flipping shot status. The app-builder surface
reimplements only the Puck *layout* ops (nested slot tree: top-level content plus
slot-valued props on Panel/Columns) headlessly — those live in `web/`
(`puckDataOps.ts`), which a backend package can't import. Its operation,
variable, resource, and binding-target tools call the shared doc-ops in
`@nodetool-ai/app-runtime` (`src/doc-ops.ts`), the same module the browser
handler calls, so that half of the contract cannot drift. The widget types it
offers come from `WIDGET_CATALOG` in the same package — every widget the editor
ships, with the fields each accepts — so `ui_app_list_component_types` reports
the same catalog headlessly that the browser reads off the live Puck config.

```bash
npm run dev:nodetool -- eval timeline-tools --list
npm run dev:nodetool -- eval script-tools -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval sketch-tools -p ollama -m qwen-3.5:4b --cases compose-layers
npm run dev:nodetool -- eval model3d-tools -p openai -m gpt-5.4-mini --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/tool-loop-eval.test.ts`
plus one per surface (`tests/{script,sketch,timeline,storyboard,model3d,app,creative-pipeline}-tool-loop.test.ts`).
A live check against a local Ollama model runs when a daemon is reachable:
`tests/tool-loop-eval.ollama.test.ts`.

**Running against the `claude_agent_sdk` provider.** Two gotchas, both from the
SDK's own agent loop (not the harness):

- **Turn cap throws.** The SDK raises `error_max_turns` when it reaches its turn
  limit, so a run that would merely *stop* under a stateless provider (Anthropic,
  Ollama) instead errors and the case scores `accepted=false`. Its turn
  accounting also counts each tool round, so the default `--max-iterations 12`
  is easily exhausted by an over-searching model. Pass a higher cap
  (`--max-iterations 40`) when driving these suites with `claude_agent_sdk`.
- **`uid=0` refusal.** The tool path runs the CLI under `bypassPermissions`, which
  it refuses as root; set `IS_SANDBOX=1` (or run non-root). It must be **exactly
  `1`** — the SDK's sandbox check is value-sensitive, so an ambient
  `IS_SANDBOX=yes` (as in Claude Code on the web) does **not** satisfy it and the
  child exits with code 1 and zero tool calls, which looks like an auth/spawn
  failure but isn't. Override it explicitly: `IS_SANDBOX=1 npm run …`. See
  [docs/AGENTS.md § Claude Agent SDK](../../docs/AGENTS.md) for the full
  nested-session recipe.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval timeline-tools \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

### Sub-agent execution eval (`subtask`)

Where the tool-loop suites score a model on one flat tool surface, the
`subtask` suite scores `RunSubtaskTool` — the primitive that lets an agent
decompose work by spawning a fresh child agent that inherits the parent's
toolset. It runs a real `CodeActExecutor` parent equipped with `run_subtask` plus
six instrumented worker tools (`calculate`, `kv_write`, `kv_read`,
`lookup_fact`, `slugify`, `flaky_fail`), each objective written to force
delegation. The tools are shared instances at both levels; each records the
`SUBTASK_DEPTH_KEY` it ran at, so the scorer distinguishes "the parent did it
itself" (depth 0) from "the parent delegated and the child did it" (depth >=
1). Scoring is structural (`checkSubtaskExpectations`): required parent tools,
required *child* tools, forbidden tools, subtask-count and depth bounds, no
failed subtasks, required store keys, and answer/subtask-result substrings.
Cases + tools live in `src/evals/subtask-cases.ts`, the runner in
`src/evals/subtask-eval.ts`.

```bash
npm run dev:nodetool -- eval subtask --list
npm run dev:nodetool -- eval subtask -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval subtask -p openai -m gpt-5.4-mini --cases all-tools
IS_SANDBOX=1 npm run dev:nodetool -- eval subtask \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

Its cases do not use `find_model`, so `--no-find-model` does not skip them —
the primary `-p` provider runs both the parent and every subtask. A low score
with `subtasks=0` is a real finding, not a harness bug: a capable model often
does trivial single-step work inline instead of delegating. Harness tests
(scripted provider, no network): `tests/subtask-eval.test.ts`.

### Mini-app build eval (`app-build`)

The only suite that scores a whole product loop rather than one stage:
`buildApp` (`src/app-build/`) takes a prompt through spec → plan → author →
check → run → judge, repairing what the oracle complains about, and the suite
counts how often that ends green and how much repair it took. Cases in
`src/evals/app-build-cases.ts`, runner in `src/evals/app-build-eval.ts`.

Metrics per `docs/mini-app-build-harness-design.md` §5.3: **one-shot rate**
(green with zero repair rounds — the PRD's north-star number), **green-within-
budget rate** (the suite's `successRate`, what `--min-success` gates on), repair
rounds, cost, and duration.

A case is green only when the build's own verdict is ok **and** its target-shape
checklist holds — operations, workflows, widget count, a widget nested in a
container, a `persist: true` variable, a streaming output shown by a display
widget, an operation reading a variable another wrote, and a widget carrying a
condition. Without the checklist a build that shipped one operation and three
widgets would score as a success. Each of the eight prompt cases declares which
of the six medium-complexity traits (PRD §4) it exercises;
`uncoveredAppBuildTraits()` names any trait that lost its last case, and the
harness test fails on a non-empty answer.

The two deterministic cases (`greeting-card`, `draft-then-publish`) pin the
spec, bind template graphs (text transforms — no model in the app under test),
author from a scripted list of `ui_app_*` calls, skip the judge, and assert
exact widget values. They call no provider, so they run on every PR as the
Quality Gate's `app-build` leg; what they regress is the harness, not a model.
The full suite runs nightly (`.github/workflows/app-build-eval.yml`), reports,
and gates nothing — a model's off night is not a broken build.

```bash
npm run dev:nodetool -- eval app-build --list
npm run dev:nodetool -- eval app-build -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval app-build --cases greeting-card,draft-then-publish \
  -p ollama -m none --no-find-model --min-success 1   # no API key needed
```

Harness tests (scripted authoring, stub kernel runner, no network):
`tests/app-build-eval.test.ts`.

## Observing LLM Steps and Planning

### Execution Tree (CLI)

The CLI renders a real-time tree view during agent execution:

```
✓ initialization    Starting parallel task planning...
✓ generation        Generating parallel plan...
✗ validation        Plan validation failed: duplicate step IDs
✓ generation        Retry attempt 2/3...
✓ complete          Plan created: 5 tasks, 5 steps, 5 parallelizable

◆ Plan  (3/5 tasks)
├─ ✓ Task 1: Search sources            3.2s (1/1 steps)
├─ ◐ Task 2: Analyze findings
│  ├─ ✓ google_search(query: "AI trends")
│  └─ ◐ llm_call
└─ ○ Task 3: Write report              waiting
```

### Message Types

All execution events are yielded as `ProcessingMessage`:

| Type | Description |
|------|-------------|
| `planning_update` | Planning phase progress (initialization, generation, validation, complete) |
| `task_update` | Task lifecycle (task_created, step_started, step_completed, step_failed, task_completed) |
| `tool_call_update` | Tool invocation with name and args |
| `step_result` | Step completion with result or error |
| `chunk` | Streaming text output |
| `log_update` | Informational log messages |
| `llm_call` | Full LLM call details (provider, model, messages, response, tokens, cost, duration) |

### Debug Logging

```bash
# Verbose logging to stderr
export NODETOOL_LOG_LEVEL=debug

# Log to file
export NODETOOL_LOG_FILE=/tmp/agents.log
```

### OpenTelemetry Tracing

Span hierarchy (an analyzer agent can read this tree to optimize prompts):

```
workflow.run
  node.process
    agent.execute
      agent.plan        (TaskPlanner.planMultiTask / GraphPlanner.plan)
        llm.chat        (BaseProvider.generateMessageTraced)
        llm.stream      (BaseProvider.generateMessagesTraced)
      agent.step        (CodeActExecutor.execute)
        llm.chat
        llm.stream
```

Span attributes:

- `agent.*`: `agent.kind` (execute/plan/step), `agent.objective`, `agent.provider`, `agent.model`, `agent.tools_count`, `agent.task` (for steps), `agent.plan.kind` (multi/single/graph)
- `llm.*`: `llm.provider`, `llm.model`, `llm.request.message_count`, `llm.request.tools_count`, `llm.request.max_tokens`, `llm.request.stream`, `llm.response.content` (first 2000 chars), `llm.response.tool_calls_count`
- `gen_ai.*` (OTel GenAI semconv): `gen_ai.system`, `gen_ai.request.model`, `gen_ai.operation.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.total_tokens`, `gen_ai.usage.cost_usd`
- `workflow.*` / `node.*`: `workflow.id`, `workflow.name`, `workflow.node_count`, `node.id`, `node.type`

Sinks (simultaneous, each on its own SpanProcessor):

```bash
# JSONL trace file — one span per line, analyzer-friendly
export NODETOOL_TRACE_FILE=/tmp/nodetool-trace.jsonl

# Stdout — pretty (human) or json (JSONL)
export NODETOOL_TRACE_STDOUT=pretty       # or "json"

# OpenTelemetry — console (legacy)
export OTEL_TRACES_EXPORTER=console
export TRACELOOP_DISABLE_BATCH=true

# OpenTelemetry — Traceloop cloud
export TRACELOOP_API_KEY=your-key

# OpenTelemetry — custom OTLP backend (Jaeger, Grafana, etc.)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

CLI flags pass these through:

```bash
nodetool-chat --trace-file trace.jsonl
nodetool-chat --trace-stdout pretty
nodetool --trace-file trace.jsonl run workflow.ts
```

Telemetry must be initialized before use:

```typescript
import { initTelemetry } from "@nodetool-ai/runtime";
await initTelemetry({
  traceFile: "trace.jsonl",   // optional
  stdout: "pretty",            // optional: "pretty" | "json" | false
});
```

The CLI calls `initTelemetry()` at startup automatically. The WebSocket server requires env vars to be set before starting.

### Web UI

The web UI renders the same tree view in the chat panel (`ExecutionTree` component). The `TracePanel` provides a detailed event inspector with token counts, costs, and full request/response payloads.

## Evaluation and Optimization

### Cost Tracking

`CostCalculator` in `@nodetool-ai/runtime` tracks per-call costs based on provider pricing:

```typescript
provider.trackUsage(model, { inputTokens: 100, outputTokens: 50 });
console.log(provider.getTotalCost()); // USD
```

Costs are logged via `logProviderCall()` and included in `llm_call` messages.

### Model Selection

Use separate models for planning vs execution to optimize cost/quality:

```typescript
const agent = new Agent({
  model: "claude-haiku-4-5",           // Fast/cheap for step execution
  planningModel: "claude-sonnet-5",  // Better for plan decomposition
  reasoningModel: "claude-opus-4-6",   // Best for complex reasoning
  ...
});
```

### Tool Result Truncation

- Tool results are truncated to 20,000 chars (`MAX_TOOL_RESULT_CHARS`) before being added to history.
- Step executors delegate the tool-calling loop to `provider.generateLoop`, so each provider manages its own context window (the Claude Agent SDK compacts internally; stateless providers send the full transcript). There is no NodeTool-side per-step token budget, compaction, or eviction.

### Plan Validation

Plans are validated before execution:
- Step/task IDs must be unique across the entire plan
- Dependencies must reference valid IDs
- No circular dependencies (DAG validation via DFS)
- On failure, error is fed back to LLM for retry (up to `maxRetries`)

### Output Schema Validation

Steps can enforce structured output via JSON schema:
- `additionalProperties: false` enforced automatically
- Schema'd steps finalize ONLY through the `finish_step` tool — there is no JSON-from-text extraction path. If `finish_step` is never called, the step fails on `maxIterations` and emits an explicit error result.
- Unstructured steps (no schema) finalize when the model emits a no-tool-call assistant message; that text becomes the result.

### Skills System

Skills inject domain-specific instructions into the agent system prompt:

```
.claude/skills/my-skill/SKILL.md
~/.claude/skills/shared-skill/SKILL.md
```

Skill format:
```markdown
---
name: data-analysis
description: Analyze CSV datasets and produce summary statistics
---

When analyzing data:
1. Load the dataset using read_file
2. Identify column types
3. Compute summary statistics
```

Control via environment variables:
```bash
NODETOOL_AGENT_SKILL_DIRS=/path/to/skills   # Additional skill directories
NODETOOL_AGENT_SKILLS=skill-a,skill-b       # Explicitly enable skills
NODETOOL_AGENT_AUTO_SKILLS=0                # Disable auto-matching (default: enabled)
```

### Tuning Checklist

1. **Reduce cost**: Use cheaper `model` for execution, better `planningModel` for decomposition
2. **Improve plan quality**: Increase `maxRetries` on `TaskPlanner`, use custom `systemPrompt`
3. **Speed up execution**: Decompose into more independent tasks (maximizes parallelism)
4. **Control scope**: Set `maxSteps` and `maxStepIterations` to prevent runaway execution
5. **Validate output**: Use `outputSchema` to enforce structured results
6. **Restrict tools**: Per-step `tools` arrays limit which tools a step can call
7. **Observe**: Enable tracing (`OTEL_TRACES_EXPORTER=console`) to see every LLM call
8. **Iterate on skills**: Add domain-specific SKILL.md files to improve agent behavior

## Authoring Agent Nodes — Pitfalls

When building a node that wraps an agent (e.g. the `code-nodes` tool-agents, or
`llm-nodes` `AgentNode`):

- **Every tool named in an agent's system prompt must actually be registered in
  its toolset.** `BrowserAgent`/`HttpApiAgent` prompts instructed the model to call
  `browser`/`take_screenshot`/`http_request` tools that were never registered (only
  `execute_bash` was) — a prompt-referenced-but-unregistered tool is a silent
  no-op. Resolve real builtin tools (`resolveBuiltinAgentTool`) and don't reference
  tools you didn't wire.
- **Every declared prop must be consumed by `process()` or injected into the
  prompt.** A declared-but-unwired prop (`max_output_chars`, `url`, `output_dir`)
  does nothing — inject node props via a `promptContext()` hook.
- **`yield` structured results so the kernel routes them to dynamic output
  handles; don't `return` them from a generator** (`yield*` discards the return
  value). Keep structured-output emission consistent across modes (loop vs plan).
