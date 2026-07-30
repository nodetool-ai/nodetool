# Code Node AI Authoring — Simplified Plan

**Goal:** Let a user describe the result they want and get a working, typed
Code Node — instead of writing JavaScript or hunting the node catalog for a
chain of type-compatible nodes. Describing the result is faster than finding
and wiring the chain.

**Nothing is removed.** The Code Node keeps every capability it has today.
AI authoring is an additional way to write the code, not a restricted variant
of the node.

**Design rule:** No new persistence, no new node state, no contract layer.
Generation fills the fields the node already has (`code`, `dynamic_inputs`,
`dynamic_outputs`, `dynamic_properties`) and then gets out of the way. A
generated node is indistinguishable from a hand-written one.

---

## What exists today

The platform already has almost everything this feature needs. Two recent
changes removed most of what the earlier draft of this plan had to build:

- **Typed dynamic slots are persisted.** `DynamicSlotMeta`
  (`packages/protocol/src/graph.ts`) carries type, description, default, and
  required for each dynamic input; `dynamic_outputs` carries a type per
  output. Both round-trip through `reactFlowNodeToGraphNode.ts` /
  `graphNodeToReactFlowNode.ts`. There is nothing left to invent for "stable
  typed handles" — the generator just writes these fields.
- **The sandbox grew a real standard library.** `js-sandbox.ts` now bridges
  `format.*` (Intl number/date/relative-time/list), `data.parseCsv`
  (papaparse), `data.selectHtml` (cheerio), `crypto.*` (WebCrypto),
  `progress()`, binary helpers (`toBase64`/`fromBase64`/`toHex`/`fromHex`,
  `utf8Encode`/`utf8Decode`), extended `workspace`
  (bytes/stat/mkdir/remove), and per-run limit overrides. The old gap —
  prompts advertising libraries the sandbox lacked — is now mostly a prompt
  bug, not a missing capability.

| Existing capability | Where | How this plan uses it |
|---|---|---|
| Universal JS Code Node | `packages/code-nodes/src/nodes/code-node.ts` (`nodetool.code.Code`) | The only runtime node. Unchanged. |
| QuickJS sandbox + bridges | `packages/agents/src/js-sandbox.ts` | Export a serializable capability manifest; derive the generation prompt from it. |
| Typed dynamic inputs/outputs | `DynamicSlotMeta` in protocol, persisted by both graph converters | Generation output lands here. No new fields. |
| AST handle inference | `web/src/utils/codeOutputInference.ts` | Untouched. Handles keep tracking code exactly as today, for generated and hand-written code alike. |
| Monaco editor | `web/src/components/node_types/CodeBody.tsx` | Untouched. Ask AI is a button beside it. |
| Snippets | `web/src/config/codeSnippets.ts`, `snippetMetadata.ts` | Untouched. |
| Model preferences | `ModelPreferencesStore.ts` generic `defaults` map | Add a `code_model` key. No schema change. |
| Provider abstraction | `BaseProvider.generateMessageTraced` in `packages/runtime` | Reuse for the generation call. |
| Single-node / inline execution | `useRunSingleNode.ts`, `runInlineGraphJob.ts` | Preview runs through the normal execution path. |
| tRPC routers | `packages/websocket/src/trpc/routers/` | One new router with one mutation. |

## What the earlier draft built that this plan drops

The previous version of this plan added an explicit "contract" layer on top of
the node: a versioned `CodeTransformationArtifact` with schema, authoring-policy
and sandbox-runtime versions, `ui_properties.code_contract` with port ordering,
`ui_properties.code_transform` authoring history, contract-precedence rules that
disabled AST inference, a contract editor with edge-migration dialogs, runtime
contract enforcement in the kernel, and a three-table publish/version/draft
store. All of it is dropped:

- **No contract.** Typed handles are `dynamic_inputs`/`dynamic_outputs`,
  which already persist. Record insertion order is the display order. If the
  user edits the code and the returned keys change, handles update through
  the existing inference path — same as today. No precedence rules, no
  mismatch dialogs, no "Update Contract / Revert" flow.
- **No artifact versioning.** The generation response is transient. Nothing
  is saved on the node except the standard fields. No authoring history, no
  policy versions, no original-intent storage, nothing new in workflow
  export.
- **No authoring policy engine.** The prompt is derived from the sandbox
  manifest, plus a few lines of guidance (below). Static analysis checks
  syntax and declared outputs — it does not classify code as
  "transformation" vs "not".
- **No publishing / reusable definitions.** Deferred entirely (see Later).
- **No runtime type enforcement, no saved test cases, no snippet folding.**
  Deferred.

## Product scope

The generator writes code for the shapes users actually ask for: reshape,
merge/join, compute/derive, extract/parse, split, format/render, validate,
seed. Ordinary conditional logic (`if`/`else`, `switch`, ternaries, early
returns) is normal JavaScript and unrestricted. With the extended sandbox,
CSV parsing, HTML extraction, date/number formatting, and hashing are all
in scope without any library discussion.

Prompt guidance (guidance, not enforcement):

- Prefer pure data reshaping; use `fetch`, `workspace`, or `getSecret` only
  when the instruction asks for it.
- Don't use `state` or `yield` unless asked — they exist for streaming and
  are noise in a one-shot transformation.
- Emit every declared output on every return path. Conditional emission is
  workflow branching; point the user at `nodetool.control.If` / `Switch`
  instead of generating it.
- Preserve media/asset reference objects; never invent base64 conversions.

Out of scope (unchanged from before): calling arbitrary NodeTool nodes from
JS, replacing subgraphs/workflow nodes, new iteration models, user-installed
packages, and AI authoring for the other `nodetool.code.*` executors
(`ExecutePython`, `ExecuteBash`, …) — those run real interpreters with a
fixed `stdout`/`stderr` shape and need their own generator later.

---

## Design

### One generation service

A single protected tRPC mutation, `codeGen.generate`:

1. Accepts: instruction, input slots (name, type, description — seeded from
   connected handles), optional expected output (name + type, when launched
   from a destination handle), optional current code + slots (for edits),
   optional user-approved sample values, and the resolved model.
2. Builds the prompt from the sandbox capability manifest and the guidance
   above.
3. Calls the provider via `generateMessageTraced` with one required tool,
   `submit_code`, whose arguments are:

   ```ts
   interface CodeGenSubmission {
     title: string;                    // imperative, becomes the node title
     summary: string;                  // one sentence
     code: string;
     inputs: { name; type; description?; default?; required? }[];
     outputs: { name; type; description? }[];
   }
   ```

4. Validates the arguments with Zod (valid JS identifiers, NodeTool type
   metadata shapes, unique names, ≥1 output, bounded sizes), parses the code
   with acorn, and checks that every declared output is assigned on every
   statically visible return path.
5. On failure, makes one repair attempt with the errors attached.
6. Returns the submission or a discriminated error (provider unavailable,
   aborted, malformed response, invalid code, internal).

Prompt building and validation are pure functions in
`@nodetool-ai/agents/src/code-gen/` so they test without Fastify. The
frontend never scrapes code fences from chat text.

Telemetry keeps provider, model, tokens, cost, duration, and failure code;
it does not record instructions, samples, or generated code.

### Applying a result

The frontend applies an accepted submission as **one undoable graph action**:

- `data.code` ← code, node title ← title.
- `data.dynamic_inputs` ← input slots (as `DynamicSlotMeta`),
  `data.dynamic_outputs` ← output slots, defaults into
  `dynamic_properties`.
- When launched from a handle, create the edge(s) after `isConnectable`
  passes.
- On cancel or failure, no node or edge is left behind.

That's the whole persistence story. Reload shows the same typed handles
because the protocol already round-trips them.

### Samples stay local by default

Preview runs the node through `runInlineGraphJob` with the latest connected
values (or hand-edited samples) — locally, through the normal execution
path. Sample **values** are only included in the model prompt when the user
ticks "include sample values", and the exact payload is shown before sending.
By default the model sees names and types only. This replaces the earlier
consent/redaction machinery with a checkbox.

### Model selection

Add `code_model` to the existing `ModelPreferencesStore.defaults` map.
Resolution, centralized in `useCodeAuthoringModel`:

1. `code_model` preference, if set.
2. Active global chat model.
3. Default `language_model` preference.
4. Application default.

Skip any candidate without tool support (the submission is a tool call);
thread the existing `requireToolSupport` filter through
`LanguageModelSelect` → `LanguageModelMenuDialog`, which don't accept it
yet. Never store the model on the node.

### UI

- **Ask AI button** on the Code Node body (`CodeBody.tsx`), gated on
  `isCodeNode(nodeType)` — `nodetool.code.Code` only, not
  `isCodeBodyNode`, which matches all 19 `nodetool.code.*` executors.
- **One dialog** (`CodeGenDialog.tsx`): instruction field, detected typed
  inputs, expected output when known, effective model (with a link to change
  the preference), Generate, result review (title, summary, handles,
  collapsed code view), preview panel, Apply. Monaco lazy-loads only when
  the code view opens. Keyboard operable; `aria-live` for generation and
  preview status; focus returns to the opener on close.
- **Entry points:**
  - A searchable **"Write Code with AI"** palette entry (aliases: transform,
    convert, reshape, merge, join, split, extract, parse, format, compute,
    validate — following the `snippetMetadata.ts` search-term pattern).
  - **"Transform this output…"** on the output-handle context menu.
  - **"Create value with AI…"** on the input-handle context menu, seeding
    the expected output name and type.

No compact summary body, no contract editor, no mode indicator. A generated
node renders and edits exactly like any Code Node.

---

## Tasks

### 1. Sandbox capability manifest

**Files:** `packages/agents/src/js-sandbox.ts`, prompt construction,
`useChatIntegration.ts`.

- Export one serializable manifest of the sandbox surface — bridges, guest
  helpers, limits — built from the module's own exports, never restating
  values. Scope it to `nodetool.code.Code`; the other executors don't share
  this runtime.
- Derive the generation prompt and Code Node help text from the manifest.
- Fix `useChatIntegration.ts`, which still advertises `_` (lodash), `dayjs`,
  and a global `cheerio` — none exist as guest globals. CSV and HTML work
  goes through `data.parseCsv` / `data.selectHtml`; formatting through
  `format.*`.
- Add a test that fails when authoring instructions name an API the manifest
  doesn't contain.

### 2. Transport schemas

**Files:** `packages/protocol/src/api-schemas/code-gen.ts` + tests.

- Zod schemas for request, `CodeGenSubmission`, and the error union.
- Identifier-safe port names, NodeTool type metadata shapes, unique names
  per direction, ≥1 output, size limits on instruction/ports/samples/code.
- Transport validation only — no JS parser in protocol.

### 3. Generation core

**Files:** `packages/agents/src/code-gen/{prompt,parse,analyze,generate}.ts`
+ scripted-provider tests; add `acorn` to the agents package.

- Prompt builder (manifest + guidance + inputs + expected output + optional
  samples), `submit_code` tool definition, forced via `toolChoice`.
- Read only the named tool call; free text, code fences, and extra calls are
  invalid responses.
- acorn analysis: syntax, every declared output assigned on every visible
  return path. Ternaries, `if`/`else`, partitions into always-emitted
  outputs all pass; a branch omitting a declared output fails with a pointer
  to the control nodes.
- One repair attempt; typed failure codes; `AbortSignal` threaded through.

### 4. API mutation

**Files:** `packages/websocket/src/trpc/routers/code-gen.ts`, router index,
tests.

- Protected mutation; resolve provider through the existing registry and
  secret resolver; call `generateMessageTraced`.
- Suppress message/sample/code bodies from spans and failure logs for this
  endpoint while keeping usage metadata.
- Per-user in-flight cap with a stable rate-limited error. Non-streaming,
  with cancellation; no chat thread, no message history writes.

### 5. Model preference

**Files:** `ModelPreferencesStore` consumers, `DefaultModelsMenu.tsx`,
`LanguageModelSelect.tsx`, `LanguageModelMenuDialog.tsx`,
`useCodeAuthoringModel.ts` + tests.

- `code_model` preference labeled "Code Generation", empty state "Use chat
  model"; fallback chain in the hook; `requireToolSupport` threaded through
  the two select components; blocking selector with a Settings link when no
  tool-capable model resolves.

### 6. Dialog and apply

**Files:** `web/src/components/node_types/code_gen/CodeGenDialog.tsx`,
`web/src/serverState/codeGen.ts`, a NodeStore apply action, `CodeBody.tsx`
integration, component tests.

- The dialog described above; TanStack mutation; single undoable apply that
  sets code, slots, defaults, title, and edges; accessible states for
  loading, error, aborted, and offline.

### 7. Graph entry points

**Files:** palette config, handle context menus, connection handlers, tests.

- The three entry points above, seeding slot names/types from handle
  metadata; edges only after validation; collision suffixes for duplicate
  port names; nothing left behind on cancel.

### 8. Preview

**Files:** preview panel in the dialog, sample adapter, tests.

- Latest connected values where available, type-aware sample editors,
  "from latest run" vs "manual" labels; run via `runInlineGraphJob`; show
  each named output, logs, duration, errors; warn when an output value
  doesn't match its declared type; preview state keyed by job id.
- "Include sample values" checkbox with the exact payload shown before the
  first send.

### 9. Verification and rollout

- Unit tests: schemas, prompt, analysis, repair, model fallback, apply
  round-trip.
- E2E: source output → generate → preview → connect → save → reload → run;
  and the destination-handle variant.
- A `code-gen` live-provider eval suite beside `graph-planner`, registered
  with `nodetool eval` (`--provider`, `--model`, `--cases`,
  `--min-success`), reporting first-pass and post-repair acceptance
  separately. Scripted-provider tests cover mechanics, not model quality.
- Feature flag in the web config layer until the E2E journeys and the eval
  suite pass ≥90% (post-repair) on two configured providers.
- `npm run typecheck`, `npm run lint`, `npm run test`; `npm run
  build:packages` when decorator packages change.

### Exit criteria

- A user can go from "I have these values" to a connected, typed, working
  node without opening Monaco.
- Typed handles survive save/reload (already guaranteed by the protocol —
  covered by the apply round-trip test).
- No generation path leaves a partially configured node or dangling edge.
- Existing Code Nodes, snippets, inference, and every other `nodetool.code.*`
  node behave exactly as before.

---

## Phase 2 — Edit and repair (after Phase 1 ships)

- **Edit:** the same mutation with the current code + slots attached; the
  model returns a full replacement submission. Confirm before applying an
  edit that removes, renames, or retypes a connected handle (show affected
  edges: keep, remap, or disconnect). Per-dialog transcript in UI state
  only.
- **Repair:** after a preview or run failure, offer one-click Repair — the
  edit call with the error and the failing (local) sample attached. Preview
  before replacing working code; keep the last working code until accepted.
- **Connection adapter:** when a connection fails only on type
  incompatibility, offer "Create adapter with AI" beside the error, and
  "Insert transformation" on an existing data edge — both pre-fill exact
  source and destination types.

## Later, deliberately unscheduled

- Reusable published definitions with versions (the dropped Phase 3). If
  demand shows up, it can be added without a contract layer: publish
  snapshots a node's code + slots; nothing in this plan blocks it.
- Saved per-node test cases.
- Runtime output-type checking in the kernel.
- Declared per-node capabilities/libraries.
- AI authoring for `ExecutePython` and friends (needs per-runtime manifests —
  the manifest seam from Task 1 — and a typed-output convention for
  `stdout`-shaped nodes).
