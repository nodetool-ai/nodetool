# JS Script Documents: a first-class, executable script type

Status: implemented (phases 1–3). Owner: code-nodes / agents / web. 2026-08-12.

Where the implementation differs from the design below, the difference is
noted inline under **Implementation note**.

## Problem

Reusable JavaScript exists in NodeTool in exactly two forms, and neither is a
document a user can open, edit, test, and share:

1. **A Code node body** — a `code` string inside one workflow's graph. It
   cannot be reused by a second workflow without copy-paste, it has no version
   history of its own, and editing it means opening the workflow that happens
   to contain it.
2. **A sandbox pack** — an npm-shaped artifact installed through the Package
   Manager. It is a distribution format, not an editing surface: changing one
   means republishing a package.

The gap shows up in three places. A mini app that needs ten lines of glue
(reshape an API response, format a date, merge two lists) must author a whole
workflow around one Code node. An agent that has debugged a useful body with
`run_code` has nowhere durable to put it. And two Code nodes that need the same
helper each carry their own diverging copy.

This design adds a **JS script document**: a named, versioned, user-owned
script with declared inputs, outputs, packages, secrets, and saved test cases.
It opens in its own workspace tab (Monaco editor plus an assistant chat panel,
the Code node assistant's layout as a full surface), runs and tests against the
QuickJS sandbox, and is invocable from mini apps (as an operation), from Code
nodes (as a linked body), from agents (belt tools), and from other scripts
(through the same belt).

Naming: the `scripts` table, the `script` tab type, and the `nodetool.scripts`
guest namespace are all taken by the video/voiceover script feature. This
feature uses **`js_scripts` / `jsscript` / `ui_jsscript_*` / `*_js_script`**
throughout.

## Document shape

One JSON document per script, stored whole and validated with Zod at the wire
boundary (schema in `packages/protocol/src/api-schemas/js-scripts.ts`, types
exported from `@nodetool-ai/protocol`):

```ts
interface JsScriptDocument {
  schemaVersion: 1;
  description: string;              // what it does — agents read this to pick a script
  code: string;                     // the body, emit/output contract only
  inputs: JsScriptPort[];           // { name, type }  — same TypeMetadata names nodes use
  outputs: JsScriptPort[];
  packages: SandboxModuleDeclaration[];   // sandbox packs the body may import
  secrets: string[];                // names readable via getSecret; [] = none
  timeoutSeconds: number;           // default 30, max 120 (MAX_TIMEOUT_SECONDS)
  tests: JsScriptTestCase[];        // saved cases, same shape test_code grades
}

interface JsScriptTestCase {
  name: string;
  inputs: Record<string, unknown>;
  inputStreams?: Record<string, unknown[]>; // staged items, for a `stream` body
  expect?: Record<string, unknown>;         // per-handle structural compare
  expectedStreamed?: { name: string; value: unknown }[];
}
```

Decisions baked into the shape:

- **Emit/output contract only.** Scripts are a new surface that launches after
  [docs/code-node-emit-design.md](code-node-emit-design.md); there is no
  legacy return-contract path to support. `validate_js_script` rejects a body
  that calls neither `emit` nor `output` while declaring outputs — no
  deprecation warning, an error.
- **Tests live in the document.** `test_code` already grades a case list; a
  script carries its own regression suite, so the editor's Test button, the
  assistant's repair loop, and the CLI harness all run the same cases. A saved
  script with zero tests validates with a warning.
- **Ports are declared, not inferred.** `validateCodeNodeBody` already takes
  `availableInputs`/`declaredOutputs` as lists; for a Code node the graph
  derives them, for a script the document declares them. Everything downstream
  (app input mapping, Code node linking, `run_js_script` argument checking)
  reads the declared ports.
- **The script pins its own execution envelope** (packages, secrets, timeout).
  A caller can narrow it — never widen it. Invoking a script does not grant it
  the caller's secrets; it runs with the intersection of its declared `secrets`
  and what the invoking context allows.

  **Implementation note.** A script declares no packages. Every installed
  sandbox pack and every `@nodetool-ai/sandbox-nodetool/<namespace>` module
  resolves by import; a `packages` field on an old save is dropped on parse.

## Storage and API

Copy the sketch pattern (`image_documents` + `image_document_versions`), the
full-featured reference for document types:

- `packages/models/src/schema/js-scripts.ts` — table `js_scripts`:
  `id, user_id, project_id, name, document (TEXT JSON), created_at, updated_at`,
  indexes on user/project/updated. Postgres mirror in `schema-pg/`.
- `packages/models/src/schema/js-script-versions.ts` — table
  `js_script_versions`: `id, js_script_id (cascade), user_id, name, version,
  save_type ("manual" | "autosave" | "restore"), document, created_at`, unique
  on `(js_script_id, version)`.
- `packages/models/src/js-script.ts` — `class JsScript extends DBModel`,
  `beforeSave` bumps `updated_at` monotonically and asserts the document
  validates; CAS save via `updateFieldsIfUnchanged`.
- Migration entries in `packages/models/src/migrations/versions.ts`
  (`create_js_scripts`, `create_js_script_versions`).
- tRPC router `packages/websocket/src/trpc/routers/js-scripts.ts`:
  `list / get / create / update / delete`, `update` carrying the read
  `updatedAt` as the CAS token, plus a nested `documentVersions`
  sub-router (`list / get / create / restore / delete`) copying
  `sketch.ts` — `restore` snapshots the current document as a `restore`
  version before overwriting, so a restore is itself undoable. Mounted as
  `jsScripts` in `trpc/router.ts`.
- One run endpoint for non-tRPC callers (mini apps, harnesses):
  `POST /api/js-scripts/:id/run {inputs, input_streams?}` executes the script and
  streams the same message shapes a workflow run streams (`node_progress`
  for `progress()`, per-emit output messages, a final output bag), so the
  app-runtime fold consumes it unchanged.

## Editor tab

New `WorkspaceTabType` member `"jsscript"` in
`web/src/stores/WorkspaceTabsStore.ts`; the exhaustive switch in
`TabContent.tsx` forces the new case, `JsScriptSurface.tsx`.

The surface is the Code node assistant dialog promoted to a document editor:

- **Left: Monaco** (`useMonacoEditor`), editing the persistent document — not
  a draft. Autosave through `useJsScriptServerSync` (copy
  `useScriptServerSync`: load on mount, 750 ms debounce, CAS on `updatedAt`,
  retry after 5 s, `registerDocumentSync` for cross-client `resource_change`).
- **Right: assistant chat panel**, the same panel component the Code node
  assistant uses, wired to the `ui_jsscript_*` tools below. Where the node
  assistant edits a draft and Apply commits to the node, the script assistant
  edits the document directly — undo is the document's own history plus the
  version snapshots.
- **Header/sidebar**: ports (inputs/outputs with types), secrets list, timeout
  — the same controls the Code node property panel renders for its dynamic
  slots. There is no packages picker: every installed pack resolves by import
  (see the implementation note above).
- **Bottom: run console.** A Run button (prompting for input values from the
  declared ports), a Test button running the saved cases, and a console
  showing logs, streamed emits, final outputs, and errors — the
  `run_code`/`test_code` result shapes rendered.

Threading a tab type through the shell touches the known list:
`PanelStore.LeftPanelView` (`"jsscripts"`) + `JsScriptListPanel` /
`CreateJsScriptButton` in `PanelLeft.tsx`, `OpenMenu.tsx`,
`openDocument.ts` (`OPENABLE_TYPES`), `uiContext.ts`
(`TAB_TYPE_TO_SURFACE`), `documentSync.ts` (`SyncedDocumentType`),
`resourceChangeHandler.ts`, `IconForType.tsx`, and `UiSurfaceType` in
`packages/protocol/src/api-types.ts`.

### `ui_jsscript_*` tools

Frontend tools in `web/src/lib/tools/builtin/jsscript.ts` (registered via
`builtin/index.ts`), executing against a per-document bridge
(`jsScriptAgentBridge.ts` + `useJsScriptAgentBridge`, mounted from the
surface — same seam as `scriptAgentBridge.ts`). Every tool takes the script
id; `ui_open_document` bridges "an id exists" → "the tools work".

| Tool | Effect |
|---|---|
| `ui_jsscript_get_state` | document + validation issues + last run/test result |
| `ui_jsscript_set_code` | replace the body |
| `ui_jsscript_set_ports` | replace inputs/outputs |
| `ui_jsscript_set_packages` | leftover no-op: scripts have no packages setting |
| `ui_jsscript_set_meta` | name, description, secrets, timeout |
| `ui_jsscript_set_tests` | replace the saved case list |
| `ui_jsscript_run` | run with given inputs, return outputs/streamed/logs/error |
| `ui_jsscript_test` | run the saved cases, return the grade report |

Run and test execute server-side (the browser calls the run endpoint /
capability, not an in-browser QuickJS), so the editor, the assistant, and the
CLI harness exercise one execution path.

## Execution semantics

Execution reuses `runCodeBody` (`packages/agents/src/capabilities/code.ts`)
— the same core `run_code`/`test_code` already share, with `withToolbelt`
on — parameterized by the script document instead of ad-hoc arguments:

- Globals: `{ inputs, state: {} }`. Fresh `state` per run; inputs JSON
  deep-copied.
- Limits: `secretScope` = the script's declared `secrets` intersected with
  the caller's allowance; `timeoutMs` from the document, capped by the caller.
- Packages resolve through the process `SandboxModuleCatalog`; an undeclared
  import fails validation before it fails at run time.
- **The Code-node toolbelt.** A script run prepends the same `tools.*` /
  `nodetool.*` prelude a Code node does, wired to
  `assembleSandboxToolbelt()` (`getAgentToolbelt()` plus
  `getAllMcpTools({ registry })`). Chat `ui_*` tools stay off this belt —
  they need a browser. `run_code` / `test_code` stay hermetic so an
  authoring probe cannot spend money. Tool-backed calls (media generation,
  workflow runs, `run_js_script`) use each tool's own permission gating;
  a script that calls `run_js_script` on itself still hits the cycle gate.

## Invocation

### By agents (and by other scripts)

One capability module `js-scripts` (`packages/agents/src/capabilities/`,
specs + implementation, registered in both halves of
`capabilities/registry.ts`):

| Tool | Effect |
|---|---|
| `list_js_scripts` | id, name, description, ports — description is the discovery surface |
| `get_js_script` | full document |
| `save_js_script` | create or update (CAS) |
| `validate_js_script` | static check of a document (inline or by id) |
| `run_js_script` | execute by id/name with inputs; returns outputs/streamed/logs/error |
| `test_js_script` | run the saved cases; returns the grade report |

Because these are belt tools, every existing surface reaches them with zero
new plumbing: agent JSON tool calls, CodeAct actions, MCP, and — the
"invoked by other scripts" requirement — a Code node body or CodeAct action
calling `tools.run_js_script({name, inputs})` through the existing tool
bridge. Guest→guest goes through the host, so budgets, depth, and secret
scoping stay host-enforced.

Recursion is bounded the way sub-agents are bounded: `run_js_script` carries
a depth counter on the ProcessingContext (the `SUBTASK_DEPTH_KEY` pattern)
plus the chain of script ids; a script id already on the chain fails the call
with the cycle named. Default depth cap: 4.

A direct guest `import` of another script (a `nodetool-script:<id>` specifier
served by the catalog, next to how `mountCapabilityModules` mounts platform
modules) is **deferred**: it would inline the callee into the caller's
capability envelope, so scoping and staleness need their own design. The tool
path covers composition until then.

### From Code nodes

A Code node can link a script instead of writing a body by hand. Linking
**materializes** the pinned version: its code, packages, secrets and timeout are
copied onto the node in one undoable edit, and the optional `script` prop
(`{ id, version }`) records where they came from. The editor offers:

- **Link script** — pick a script; its body, ports, packages, secrets and
  timeout are copied onto the node, whose code renders read-only while linked,
  with an "update to latest" affordance that re-copies and re-pins.
- **Extract to script** — lift the node's current body, ports, packages, and
  secrets into a new script document and link it. The inverse, **detach**,
  clears the `script` prop; the body is already inline.

At run time `CodeNode` executes its own properties — there is no resolution
step, no database read, and no resolver on the `ProcessingContext`. A graph
therefore runs wherever it is opened, and hydration answers the one question it
has to answer *statically*: `resolveStreamingInput` reads `node.properties.code`
to decide whether the node streams its inputs, which it can only do because the
body is right there. Resolve-at-run would have made a linked streaming script
hydrate buffered and fail on its first `stream` call.

**Implementation note.** The link is checked, not resolved. `validateGraph` is
synchronous, so it takes an injected `jsScriptLookup`: a caller prefetches every
link with `collectJsScriptLinks` and passes a lookup over what it found. The
materialized body is validated exactly like an inline one — streaming rules
included — and the lookup only answers the freshness question, comparing the
script's declared ports against the node's slots (`jsScriptPortMismatches` in
`@nodetool-ai/node-sdk`, `js-script-link.ts`). A link nothing can answer for is a
**warning** (`js_script_unverified` without a lookup, `js_script_missing` with
one): execution no longer needs the row, so a script that moved or was deleted
costs freshness, not the run. The models-layer resolver
(`createJsScriptResolver`) survives for the surface that still resolves a pinned
version — a mini-app script operation — and for the editor's link and
update-to-latest, which read it over tRPC.

### From mini apps

`OperationBinding` (`packages/app-runtime/src/document.ts`) today binds only a
`workflowId`. It gains a discriminated target:

```ts
type OperationTarget =
  | { kind: "workflow"; workflowId: string; workflowVersion?: number }
  | { kind: "script"; scriptId: string; scriptVersion: number };
```

(`workflowId` on the binding stays readable for one schema version;
`APP_SCHEMA_VERSION` bumps to 4 with a lift in `documents.ts`.)

**Implementation note.** The lift lives in `document.ts`, next to
`parseApplicationDocument` — `documents.ts` is the sketch/timeline ref reader
and has nothing to do with app documents. `workflowId` is not duplicated: a
workflow target stores its id there as it always did, and only a script target
stores a `target`. `operationTarget(binding)` is the normalizer that derives the
union, and it is the only place the two kinds are told apart.

A script operation maps widgets to the script's declared inputs and its
outputs to displays/variables exactly as a workflow operation maps input and
output nodes — the mapping layer already works on names. Execution goes
through the run endpoint above; because it streams the same message shapes,
the app-runtime fold (`fold.ts`), the `app debug` harness simulator, and the
web runtime consume script operations without a second code path. `nodetool
app debug` validates a script target the way it validates a workflow target:
a binding naming a port the script does not declare is an error.

**Implementation note.** The run endpoint still answers with plain JSON, so the
stream the fold consumes is synthesized from that result by one adapter,
`jsScriptRunMessages` (`@nodetool-ai/execution/app-debug`, `script-operation.ts`):
one `output_update` per emit in call order, one per final output, then the
terminal `job_update`. A script's ports stand in for node ids, since a script
has no nodes. Executing a body lives above `@nodetool-ai/execution`, so the
simulator takes an injected `runScript`; the hosts that own both wire
`createJsScriptAppRunner` (`@nodetool-ai/agents`) — the server's
`/api/applications/debug`, the `debug_app` capability, and `nodetool app debug`.
A host with no runner reports the operation as unexecutable rather than skipping
it. The browser runs one too: `useAppRuntime` loads the script document, derives
its IO from the declared ports, calls the run endpoint, and folds the
synthesized messages — so a script operation and a workflow operation differ
only in how the messages are produced. The pure half of the adapter
(`scriptRunMessages`, `scriptInvocationInput`, `scriptPortIO`) therefore lives in
`@nodetool-ai/app-runtime` (`script-run.ts`), which the browser can depend on;
`@nodetool-ai/execution` re-exports it and keeps the two parts that need a
parser — binding the pinned Zod document, and reading the body to decide whether
the mapped values are staged as streams.

The app builder authors one: an operation's **Runs** field picks Workflow or JS
script, and a script target picks from the user's scripts. Switching what an
operation runs clears its input and output mappings, in `updateOperation` rather
than in the panel, because they key on the old target's node ids or port names.
The draft always runs the script's **saved** document — the run endpoint takes
no version — so a target's `scriptVersion` records what the app was authored
against, not what executes. Pinning a release to an exact version needs a
version-aware run endpoint and is not built.

`ApplicationBundle.scripts` carries each pinned document under a bundle-local
key. Because a script row has its own version numbering, import snapshots every
carried script and re-pins the operations to the version it created
(`pinScriptVersions`); the number the export carried means nothing in the
importing database. `@nodetool-ai/app-runtime` stays dependency-free, so the
carried document is typed structurally (`BundleJsScriptDocument`) and parsed
against the pinned Zod contract wherever it is actually run.

`ApplicationBundle` gains `scripts: BundledJsScript[]` beside `workflows`,
with the same bundle-local key indirection, so an app that uses scripts stays
a single shareable file.

## Validation

`validate_js_script` wraps `validateCodeNodeBody`
(`packages/node-sdk/src/code-node-validation.ts`) with the document's declared
ports and `allowInstalledPackages` — the analysis (syntax, missing installed
packs, undefined names, undeclared `inputs.*` reads, unreachable output
handles) is shared, not forked. A script does not declare packages. On top of
the body check, document-level rules:

- duplicate or non-identifier port names; a port type the type system lacks
- a test case referencing an undeclared input, staging a stream for one, or
  expecting an undeclared output
- declared outputs with no reachable `emit`/`output` call (from the body
  check), and a body using the legacy return contract (error, not warning)
- zero saved tests (warning)
- a declared secret name that does not exist in the secret store (warning —
  the store is per-install)
- the streaming rules under [Input streaming](#input-streaming)

The check runs at save time (`beforeSave`), in the editor (issues panel), in
the `save_js_script` capability, and in the CLI harness.

## CLI harness and registry

Following the sketch/timeline pair, `packages/cli/src/commands/js-script.ts`
(registered in `nodetool.ts`; heavy deps imported lazily inside actions):

```bash
nodetool jsscript validate <id|file.json> [--json] [--warnings-as-errors]
nodetool jsscript run <id|file.json> --inputs '{"a":1}' [--input-streams '{"nums":[1,2]}'] [--json]
nodetool jsscript test <id|file.json> [--json]          # saved cases
nodetool jsscript debug <id|file.json> --interact '[{"tool":"set_code",...}]'
nodetool jsscript versions list|show|create|restore|delete <id> [...]
```

`debug` replays a scripted session against the headless `ui_jsscript_*`
bridge and validates the document the session left behind; `test` is the
selfcheck-friendly command (a fixture script with deterministic cases runs
keylessly). Report types live in `@nodetool-ai/execution/js-script-debug`;
the CLI keeps target resolution and the bundle, as sketch/timeline do.

Registry (`packages/cli/src/harness/registry.ts`): harness entries
`jsscript-validate`, `jsscript-run`, `jsscript-test` (selfcheck: cheap,
no-db on file targets), `jsscript-debug`, `jsscript-versions`; a `jsscript`
surface entry listing the paths above — the registry test fails without it.

Evals: a headless surface `packages/agents/src/evals/surfaces/js-script.ts`
mirroring the tool names/shapes, wired as `nodetool eval jsscript-tools`,
with cases covering authoring from a prompt, adding tests, and a repair loop
(a failing case the model must fix).

## Input streaming

A body reads its inputs one of two ways, and the body says which. The rules are
the Code node's — [code-node-input-streaming-design.md](code-node-input-streaming-design.md)
— reused whole, because a body that runs in a script must run the same way in a
node.

A script whose body calls `stream(name)` / `stream.any()` / `stream.first()` /
`stream.open()` is a streaming-input script, detected with
`usesStreamInputContract`. There is no document flag: adding the call is what
makes it one, and deleting it is what makes it buffered again.

```js
let total = 0;
for await (const n of stream("numbers")) {
  total += n;
  await emit("running", total);
}
await output("total", total);
```

**Callers stage the items.** A script has no inbox of its own — nothing upstream
produces into it — so whoever runs it supplies what the body will pull:

| Surface | How |
|---|---|
| `run_js_script` | `input_streams: {handle: [item, …]}` |
| `POST /api/js-scripts/:id/run` | `input_streams` in the body |
| `nodetool jsscript run` | `--input-streams '{"numbers":[1,2,3]}'` |
| The editor's Run dialog | one JSON array per declared input |
| A saved test case | `inputStreams` on the case |

Wire names are snake_case (`input_streams`) and the stored document field is
camelCase (`inputStreams`), matching `expectedStreamed` beside it. A staged
handle the script does not declare is refused by every surface rather than
silently yielding nothing. Staged items reach the guest through the same
pre-staged inbox `run_code` uses, so arrival order for `stream.any()` is
round-robin by index across the handles in declaration order.

**Validation** runs `validateCodeNodeBody` with every declared input passed as
both available *and connected*: a script has no node-configured property values,
so each declared input is fed by the caller, which is what the graph calls a
connected handle. Saying so gives the script exactly the rules it should have —
`stream("x")` on a declared input never warns that nothing feeds it, and reading
a declared input through `inputs.x` in a streaming body is the error naming
`stream("x")`. A streaming body on the return contract stays an error. Two rules
are the document's own, both warnings: a case staging `inputStreams` for a body
that never calls `stream`, and a streaming body whose cases stage nothing —
each case then proves only that the body survives an empty inbox.

**A mini-app operation stays buffered.** A widget holds one value per input, not
a stream of them. When the operation's script streams, each mapped value is
staged as a one-item stream and `inputs` is left empty
(`scriptOperationInvocation`) — the split a graph run makes, where a connected
handle is reachable through `stream` and never through `inputs`.

## Security

- A script executes as its **owner** for storage/versions, but its runtime
  capability envelope is only what the document declares: `secretScope` =
  declared `secrets` ∩ caller allowance, sandbox default fetch caps, no
  toolbelt, no filesystem beyond the workspace default.
- `run_js_script` across users is not a thing: scripts are scoped to the
  requesting user, same as sketches and timelines.
- Version restore re-validates against today's schema (the timeline/sketch
  rule): an old document is restored, then checked, and a failing restore
  exits non-zero / returns the issues.
- The script body is untrusted input to every consumer: the editor renders
  results, never `eval`s; the only executor is the QuickJS sandbox.

## Phases

1. **Document + editor**: model, migration, router, tab surface, server sync,
   Monaco + assistant panel, `ui_jsscript_*` tools, run/test console. A user
   can author, run, and test a script end to end.
2. **Agent + harness surface**: `js-scripts` capability module,
   `nodetool jsscript` commands, harness/surface registry entries,
   `jsscript-tools` eval. Agents and other scripts can invoke scripts.
3. **Attachment**: Code node `script` link (link/extract/detach, pinned
   version, graph validation), mini-app `OperationTarget` + bundle scripts +
   `app debug` coverage, the web app runtime's execution path, and the app
   builder's target picker. Landed.

Each phase lands green on its own; nothing in phase 1 depends on a later
phase's schema.

## Testing

- Model/router (`packages/models`, `packages/websocket`): CAS conflict on
  concurrent update; version restore snapshots first; document validation
  rejects bad ports/tests. New checks proven failable with inverted fixtures.
- Validation (`packages/node-sdk` + capability tests): each document-level
  rule red on a fixture built to violate it, green on the shipped fixtures.
- Execution (`packages/agents`): `run_js_script` exposes `tools` /
  `nodetool` and can call `list_js_scripts`; `run_code` stays hermetic;
  secret intersection, depth cap and cycle error (including a nested
  `tools.run_js_script` of the same id), emit ordering parity with
  `run_code`.
- Web (`web/`): surface renders, autosave CAS retry, bridge
  registration/teardown, tools against a mounted surface (Jest, RTL).
- Harness: `jsscript test` on a fixture with one deliberately failing case
  exits non-zero; `harness audit` passes with the new surface entry.
- E2E (phase 3): a mini app with a script operation runs under
  `nodetool app debug`; a workflow with a linked-script Code node runs under
  `nodetool debug`. In the browser (`useAppRuntime`): the ports become the
  bindable IO, a run reaches the endpoint with the mapped values keyed by port
  name and never touches a workflow runner, and a failed run lands as a failed
  invocation. Switching an operation's target drops its stale mappings
  (`doc-ops`), proven failable by inverting the check.

## Out of scope

- Guest→guest `import` of scripts (module specifier) — deferred, see
  Invocation.
- TypeScript bodies, npm dependencies beyond declared sandbox packs, and
  script sharing/marketplace.
- Mobile editing — mobile opens documents read-only per its architecture;
  script edits arrive through the chat agent's tools like other documents.
