# CodeAct Execution (`src/codeact/`)

**Navigation**: [Agents package rules](../AGENTS.md) → **CodeAct Execution**

Paths are relative to `packages/agents/` unless they name another package.

The action space of the step loop, and the only one. Each step acts by writing
JavaScript that runs in the QuickJS sandbox with the toolbelt exposed as
imports from `@nodetool-ai/sandbox-nodetool/<namespace>`, `finish(result)` for
host-validated completion, and memory (`nodetool.memory.*`) for results
a later action or turn needs — there is no cross-action variable bag. The
prompt tells the model to record each generate/speak result (an `asset://` uri)
with `nodetool.memory.save` and reuse it; local variables die with the action,
and `return` is the observation only. A step action runs with no guest
`fetch` and no secret scope: network and secrets are reached only through the
gated capabilities, the same rule the chat session's actions run under. Design
and the research it follows (CodeAct, ICML 2024): docs/codeact-design.md.

- `CodeActExecutor` keeps the message contract, memory writes, and failure
  semantics the step loop has always had — consumers work unchanged. Bridged
  tool calls surface as `tool_call_update` events (ids `codeact_<n>`).
- The core set goes top level. Every NodeTool tool that mirrors a Claude Agent
  SDK built-in (`CORE_TOOL_NAMES` in `@nodetool-ai/runtime` — the file set,
  `glob`/`grep`, `web_search`, `browser`/`http_request`/`download_file`,
  `todo_write`, `run_subtask`) is offered to the provider as an ordinary tool
  next to `execute_code`, for every provider. Those are the shapes models are
  trained on, so a tool call beats a sandbox round trip that only forwards one.
  They stay on the belt — `nodetool.web`, `nodetool.agents` and hand-written
  fan-out call them from code — but the prompt documents them once, under
  "Direct tools", instead of as a catalog signature. `splitCoreTools` /
  `buildCoreProviderTools` in `src/codeact/tool-api.ts`.
- Discovery goes top level with it. `DISCOVERY_TOOL_NAMES` (`find_model`,
  `list_models`, `list_provider_models`, `search_nodes`, `get_node_info`,
  `list_nodes`) answers which providers, models and node types this install
  has — one question with one answer, and a wrong answer is a hallucinated
  model id that fails at generation time, after the run was paid for. The two
  sets stay apart because only the core set has SDK built-ins behind it:
  `DIRECT_TOOL_NAMES` is their union and is what the four offer sites read
  (`splitCoreTools`, the CLI turn, the websocket runner, and the MCP mount),
  while `SDK_NATIVE_TOOL_REPLACEMENTS` still reads `CORE_TOOL_NAMES` alone.
  `nodetool.models.pick` and `nodetool.nodes.search` are unchanged — the belt
  keeps every tool, so an action still composes them.
- The MCP mount subtracts. It offers `DIRECT_TOOL_NAMES` **minus every key of
  `SDK_NATIVE_TOOL_REPLACEMENTS`**, because an MCP client (Claude Code,
  ChatGPT) *is* the host agent that table describes: offering NodeTool's
  workspace-scoped `read_file` beside the client's own would put two tools of
  one name and two different roots in front of one model. What survives has no
  host equivalent — discovery, the server-side reach that runs behind
  NodeTool's SSRF guard and secrets (`download_file`, `list_directory`), and
  `run_subtask`, whose child gets the NodeTool belt rather than the client's.
  `browser`, `http_request` and `todo_write` are also left off the mount
  (`MCP_SANDBOX_ONLY_TOOL_NAMES`) and stay reachable inside an action. It is a
  `belt.filter`, so a session
  missing an injected dependency (no node registry, say) advertises no node
  tools instead of a tool that cannot run. Before this the mount registered
  only `execute_code` and `view_image`: everything was still reachable as
  an import inside an action, but every discovery question cost a sandbox round
  trip, which is the tax the direct set exists to remove.
- On `claude_agent_sdk` the built-in wins outright. The provider drops every
  tool `SDK_NATIVE_TOOL_REPLACEMENTS` maps (`read_file`→`Read`,
  `write_file`→`Write`, `edit_file`→`Edit`, `glob`→`Glob`, `grep`→`Grep`,
  `web_search`→`WebSearch`) from its MCP toolset and lets the SDK's own tool
  serve the call. The path-scoped five are substituted
  only when the caller passes a `workspaceDir`, which becomes the session
  `cwd` — without it the SDK would resolve paths outside the run's workspace,
  so NodeTool's contained versions stay. `list_directory`, `browser`,
  `http_request`, `download_file` and `run_subtask` are never substituted: no
  built-in covers what they do (`Task` would hand the child SDK tools, not the
  NodeTool belt). Neither is `todo_write`: `TodoWrite` keeps the list inside
  the SDK session, and the chat's task list is drawn from the `todo_update`
  that NodeTool's version posts. See `packages/runtime/src/providers/core-tools.ts`.
- Progressive disclosure: resident tools (`CODEACT_RESIDENT_TOOL_NAMES` —
  the search family incl. `web_search`/`search_nodes`/`run_search`/
  `asset_search`/`grep`/`glob`, the Claude-agent file set
  (`read_file`/`write_file`/`edit_file`/`list_directory`), browser, HTTP,
  memory, `run_subtask`) are documented in full; past `CODEACT_DEFER_THRESHOLD` tools, the rest is name-only in the
  prompt and discovered in-sandbox with `await nodetool.searchTools("query")`
  (ToolSearch grammar). All tools stay callable either way. Discovery lives on
  the object model and nowhere else: the bare `searchTools()` global is gone,
  because a model that knows `nodetool.*` looked for it there and burned two
  rounds finding out it was elsewhere.
- Imports are discoverable too: `nodetool.packs.list()` reports every installed
  pack and whether this session allows it, `modules(pack)` the specifiers it
  declares, `exports(specifier)` the function names one module exports, and
  `docs(specifier)` the pack's SKILL.md. A pack installed but off the allowlist
  is listed as `allowed: false` rather than hidden — hiding it teaches the model
  the pack does not exist. The data reaches the guest as a tool
  (`list_sandbox_packages`, `capabilities/packs.ts`), which is the
  only path the object model has: it owns no host bridge. Exports are exact for
  host modules (`SANDBOX_HOST_MODULES`), WASM modules (the manifest contract)
  and platform modules (the capability registry); for a guest JS module they are
  read off its own `export` statements with acorn, and a module that re-exports
  with `export *` answers `complete: false` instead of a short list.
- Every step executor is one: `TaskExecutor`, `ParallelTaskExecutor`,
  `run_subtask`, and `run_search` all construct `CodeActExecutor`. `StepExecutor` — the older one-JSON-tool-call
  loop — is no longer exported; two callers keep it because they are one-shot
  structured verdicts on a fail-closed path where a sandbox error would only
  add a failure mode: `SupervisorAgent` and the app-build spec stage.
- Chat turns run in it too: the websocket runner swaps the toolbelt
  for `execute_code` (+ the core set, + `view_image`) via `createChatCodeActSession`
  (`src/codeact/chat-codeact.ts`), which routes every imported belt name to the chat
  runner's own tool router instead of `buildToolBridge` — permission gating
  and client (`ui_*`) round-trips stay where they are. When the belt carries
  the `ui_*` workflow document tools, actions also get the graph object model
  (`src/codeact/graph-model.ts`): `openWorkflow()` returns a model whose
  synchronous mutators queue ops against a local mirror and `commit()` replays
  them through the same `ui_*` contract.
  The CLI's local (no-server) turn runs the same session — `execute_code`,
  the core tools and `view_image` are what `processChat` sees, wired in
  `packages/cli-chat/src/chat-codeact.ts`.
- Both executors also load the `nodetool` object model
  (`src/codeact/nodetool-api.ts`): the platform as objects instead of raw
  imports — `nodetool.workflows` (list/get/run/start/debug/validate/
  create/open), `nodetool.batch(items, fn, {concurrency})` for bounded fan-out (run a
  workflow once per CSV row), `nodetool.models` (`pick(capability)` resolves
  one ranked model; `find`/`list` for the long form; `forProvider(provider)`
  for one provider's own catalog), and `nodetool.media`
  (`generateImage/editImage/generateVideo/animateImage/speak/transcribe/embed`
  plus the judge loop `critique/compare/scoreAdherence` and
  `understandVideo(video, prompt, model)`, which hands a whole clip to a model
  that reads video and answers as text — each taking a pick/find result or
  `"provider/model_id"`; plus `probe(path)` and `edit(operation, opts)`, the
  typed in-process media operations in `src/media-edit.ts` whose every path
  is confined to the workspace by `confineMediaPaths`
  (`src/host-binary-guard.ts`), and the host binary
  `downloadVideo(url, outputFile)`, whose argv is confined the same way and
  bounded on wall clock, captured output, artifact size and concurrency by
  `src/host-binaries.ts`), `nodetool.nodes`
  (`search/info/list` — the graph builder's discovery half),
  `nodetool.documents` (convert, PDF text/tables, markdown↔pdf),
  `nodetool.apps` (`build/debug`), `nodetool.agents` (`run(prompt)` spawns a
  `run_subtask` child with a fresh context; fan out via
  `nodetool.batch(prompts, (p) => nodetool.agents.run(p))`), the single-node harness on `nodetool.nodes.run(type,
  inputs)`, `nodetool.web` (the outside world:
  `search(query, {provider})`, `news` and `images` are all one routed
  `web_search` with a `search_type`, which picks the first configured
  backend host-side; `provider` pins one: `"default"`, `"serpapi"`,
  `"dataforseo"`, `"brave"`, `"apify"`, `"openai"`, `"google"` — plus
  `browse(url)`, `fetch(url)`, `download`, `screenshot`), `nodetool.memory`
  (`save/list/search/update/remove` over `memory_*`), `nodetool.shared`
  (`list/read/publish` over `list_shared`/`read_shared`/`share_result` — the
  run's own scratchpad, beside thread-scoped `nodetool.memory`),
  `nodetool.threads` (`list/get/last/message` over `list_threads`/`get_thread`/
  `get_message` — the chat history itself, read-only), `nodetool.style`
  (`profile/record`), `nodetool.email` (`search/archive/label`), plus `assets`
  (`list/search/images/get/save/read`), `jobs` (with
  `wait(id, {timeoutMs, pollMs})` polling a background job to settlement),
  `collections` (`list/query`; `index/indexBatch/search/hybridSearch` work
  only on a run with a bound collection, which no chat or CLI host binds),
  `timelines`, `sketches`, `scripts`, and `storyboards`. `workflows` also
  carries `resolve(sessionId, escalationId, action)` for interactive-run
  escalations and `example("<package>/<name>")` feeding `copyFrom`
  (`list({workflow_type: "example"})` enumerates the shipped examples). Every method wraps a
  belt tool, so gating and routing are untouched; a method whose backing tool
  is missing throws naming the tool, and the prompt section documents only the
  namespaces the belt can serve (`buildNodetoolApiPromptSection`). One surface
  per capability: tools the object model wraps
  (`nodetoolApiCoveredToolNames`, plus `GRAPH_MODEL_TOOL_NAMES` when the graph
  model loads) are filtered out of the prompt's tool catalog — they stay
  callable through the bridge and findable via `nodetool.searchTools()`, but the
  `nodetool.*` form is the only documented one. Workspace files are the
  deliberate exception: they are not wrapped, because the sandbox's own
  `workspace.*` API is in-process and costs no tool call — the action contract
  steers there.
- The belt carries only what a model cannot write itself. The pure-computation
  tools (`calculate`, `geometry`, `trigonometry`, `statistics`,
  `unit_conversion`) were deleted outright, MCP included, and so were the code
  tools `run_code` and `js` — `execute_code` is the code surface, and a second
  one only invited the model to run code without the sandbox's `nodetool.*`
  API. The nine provider-specific duplicates went next. The media four
  — `image_generation`, `openai_image_generation`, `google_image_generation`,
  `openai_text_to_speech` — were deleted, because `nodetool.media` covers them
  through the provider-agnostic `generate_image` / `generate_speech`. The
  search five — `openai_web_search`, `google_grounded_search`,
  `dataforseo_search`, `dataforseo_news`, `dataforseo_images` — were never
  duplicates at all: they are the backends the single `web_search` capability
  routes to, so they became plain functions with no wire name
  (`backend` still pins one). `google_news` and `google_images` later folded
  into it too, as `search_type: "news" | "images"` — three wire names and three
  routing tables for one question with a parameter on it, which also left
  Brave and Apify reachable from no tool at all. Image search split back out
  into its own `image_search` capability (`web.ts`'s `imageSearchImpl` is
  `webSearchImpl` with `search_type` pinned to `"images"` — one routing table,
  a second name): a model reaching for an image search reliably guesses a name
  like `images` before it guesses a parameter on a text-search call, and a
  guess against the "web" module's export list is exactly what
  `synonymHintSentence` in `codeact/capability-modules.ts` corrects. News
  stayed a `search_type`, since nothing observed a model reaching for a
  `news_search` import the same way. Every host therefore assembles the one
  belt `getBuiltinTools()` (`src/tools/builtin-tools.ts`) returns; a saved
  AgentNode naming a retired tool resolves to its replacement through
  `RETIRED_TOOL_NAMES` in `@nodetool-ai/llm-nodes`.
- Authoring a graph is a **package**, not a builder. `nodetool.graph()` — a
  builder taking every node type as a free-form string — is gone; a session
  authors with `@nodetool-ai/sandbox-dsl`, which ships one generated function
  per node type with that node's real inputs, one module per namespace. A type
  the catalog does not have has no export, so a hallucinated type fails at
  import instead of surviving into a graph nobody checked.
  `withGraphDslPackage` (`src/codeact/graph-dsl-package.ts`) is the wiring: it
  puts the pack on the session allowlist when the belt carries
  `create_workflow`, `validate_workflow` and `run_workflow` **and** the catalog
  serves the pack, so a machine without it installed is never told to import
  it. `CodeActExecutor` and `createChatCodeActSession` both call it, and the
  answer also gates `GRAPH_DSL_PROMPT_SECTION`. Consent is per pack: an
  allowlist entry covers that specifier's subpaths, which is what makes
  seventy-two namespace modules one prompt line. Tests:
  `tests/codeact-graph-dsl.test.ts`.
- Timeline authoring uses `@nodetool-ai/sandbox-timeline` for scene builders,
  loops, custom curves and `video(...).save(nodetool.timelines)`. `withTimelinePackage`
  (`src/codeact/timeline-package.ts`) adds the installed pack to chat and step
  session allowlists when their catalog serves it. Saving still goes through
  the session's timeline tools and their permission gates. Tests:
  `tests/codeact-timeline-package.test.ts`.
- Eval suite `codeact` scores the executor on offline instrumented cases:
  `nodetool eval codeact -p <p> -m <m>`. Beyond the four toy-toolbelt cases
  it covers the full `nodetool.*` API surface over two
  deterministic in-memory worlds (`src/evals/codeact-api-core.ts`,
  `codeact-api-surfaces.ts`) whose fakes are named like real belt tools so
  the object-model prelude lights up. `tests/codeact-api-coverage.test.ts`
  fails when a namespace loses its last case.
  Further cases (`src/evals/codeact-sandbox-pack-cases.ts`) cover sandbox
  packages: importing a pack the session allows and computing from what it
  parses, reading a pack's SKILL.md through `get_sandbox_package_docs` instead
  of guessing its API, reading the catalog instead of guessing what is
  installed, reporting a pack as unavailable rather than working
  around it, and using two packs in one action. A case names its allowlist in
  `sandboxPackages`, and the runner puts a catalog over the shipped packs
  (`shippedPackCatalog()`) on the context: the three host packs plus
  `@nodetool-ai/sandbox-dsl` and `@nodetool-ai/sandbox-flow`, whose modules are
  guest JavaScript the packs ship outright — a pack with an npm dependency
  would need
  `@nodetool-ai/sandbox-compiler`, which this package does not depend on.
  `requiredSessionTools` scores tools the
  executor adds rather than the case, which the recorder cannot see.
  `scripts/dump-codeact-run.ts <case> <provider> <model>` replays one case
  live and writes every action's code to `nodetool-debug/` — the tool to
  reach for before touching the action-contract prompt. Run it with
  `IS_SANDBOX=1 … --max-iterations 40`. The residual misses rotate with
  sampling, so judge a prompt change on the per-action dumps, not on one run's
  pass count.
- Tests: `tests/codeact-executor.test.ts`, `tests/codeact-eval.test.ts`,
  `tests/chat-codeact.test.ts`, `tests/nodetool-api.test.ts` and
  `tests/nodetool-api-*.test.ts` (scripted provider, real sandbox, no network).
