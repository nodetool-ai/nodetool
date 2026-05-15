# Field Classification: inlineFields / inputFields / Inspector

**Status:** Ready to execute
**Branch:** `claude/t-20260513-0032-contentcardbody` (already checked out)
**Parent task:** T-20260513-0032 (PR 4: ContentCardBody scaffold + image variant)
**Plan location:** `docs/plans/field-classification.md`

---

## Goal

Replace `basic_fields` (single bucket) with a tri-state per-property
classification declared on the node class:

| Mode | Render location | Editable in body? |
|---|---|---|
| **inline** | Inside the node body | yes — full property editor |
| **input** | Left-edge handle on the node | no — handle + tooltip only |
| **inspector** (default) | Inspector panel only | yes, in Inspector |

`basic_fields` stays for fallback when the new fields aren't declared, so
unmigrated nodes keep working unchanged. New layout activates per-node
the moment that node declares `inlineFields` or `inputFields`.

### Concrete target for the Agent node (`nodetool.agents.Agent`)

- `inlineFields = ["prompt"]`
- `inputFields  = ["image", "audio"]`
- Everything else (`model`, `tools`, system prompt, etc.) → Inspector

---

## Decisions (locked in)

1. **Where the classification lives** — Static class-level lists
   (`static readonly inlineFields`, `static readonly inputFields`).
   Not per-`@prop` decorator.
2. **Default for unclassified properties** — Inspector-only.
3. **PR scope** — Folded into the current PR 4 branch.

---

## API contract

### `packages/protocol/src/api-types.ts` — `NodeMetadata`

Add two optional string arrays alongside the existing `basic_fields`:

```ts
export interface NodeMetadata {
  // ... existing fields ...
  basic_fields: string[];                 // kept for fallback
  inline_fields?: string[];               // NEW — rendered inline in body
  input_fields?: string[];                // NEW — rendered as edge handles
  // remaining properties → Inspector only
}
```

Both default to `undefined`. The frontend uses this rule:

```
if (inline_fields || input_fields) {
  // new classification — Inspector default for anything not listed
} else {
  // fall back to existing basic_fields behaviour
}
```

### `web/src/stores/ApiTypes.ts`

Mirror the protocol change. (This file is often re-exported from protocol;
verify the actual file by grepping for the `NodeMetadata` interface
declaration.)

### `packages/node-sdk/src/base-node.ts`

`BaseNode` already exposes:

```ts
static readonly basicFields: string[] | undefined = undefined;
```

Add two more static fields with identical shape:

```ts
static readonly inlineFields: string[] | undefined = undefined;
static readonly inputFields: string[] | undefined = undefined;
```

### `packages/node-sdk/src/node-metadata.ts`

Currently around line 240–290, the metadata builder reads
`nodeClass.basicFields` and writes it into `basic_fields`. Add the
parallel reads + writes for `inlineFields` → `inline_fields` and
`inputFields` → `input_fields`. Do **not** derive them from anything —
they're explicit per node.

### `packages/node-sdk/src/metadata.ts`

Around line 51 there's a TS type declaration with `basic_fields?: string[]`.
Add `inline_fields?: string[]` and `input_fields?: string[]`.

---

## Frontend rendering changes

### `web/src/components/node_types/ContentCardBody.tsx`

Today the body invokes one `<NodeInputs>` with `showFields={false}` (all
properties render as handle-only). Replace with two passes:

```tsx
const inlineFields  = nodeMetadata.inline_fields ?? [];
const inputFields   = nodeMetadata.input_fields  ?? [];
const useNewLayout  = inlineFields.length > 0 || inputFields.length > 0;

const inlineProps = useNewLayout
  ? properties.filter(p => inlineFields.includes(p.name))
  : [];

const inputOnlyProps = useNewLayout
  ? properties.filter(p => inputFields.includes(p.name))
  : properties;  // fallback: all properties render as handles, same as today
```

Render structure:

```
.content-card-body
  .preview-area                              (existing — image variant)
  .inline-fields  (in normal flow)           NEW — properties with full editors
    <NodeInputs properties={inlineProps} showFields={true} ... />
  .input-handles (absolute, left edge)       (existing handle column)
    <NodeInputs properties={inputOnlyProps} showFields={false} ... />
```

Drop the property-label hiding for `.inline-fields` — those labels are
wanted there. Keep the hiding for the `.input-handles` column (the
current behaviour).

### `web/src/components/Inspector.tsx`

Inspector should show **all** properties regardless of classification.
Verify this is already the case; today it likely shows `basic` + advanced
behind a toggle. Confirm advanced-toggle behavior is preserved.

### `web/src/components/node/NodeContent.tsx` (generic body)

Generic (non-content-card) body currently uses `basic_fields` via
`NodeInputs`. **No change in this PR.** Generic nodes keep their
existing behavior. The new classification only affects content-card
nodes for now. (If we later want generic nodes to honor the new fields,
that's a follow-up.)

---

## Node migrations (this PR — **all 621 classes**)

### Scope

- **621 node classes** across **110 files**
- **74** currently declare `basicFields`
- Hand-written node classes: `packages/base-nodes/src/nodes/*.ts` (70 files), `packages/elevenlabs-nodes/src/nodes/*.ts` (4 files)
- Factory-generated: `packages/replicate-nodes/`, `packages/fal-nodes/`, `packages/kie-nodes/` — change the **factory** once, every emitted node inherits the new fields

### Classification rubric (apply uniformly across all 621 classes)

For every property on a node class, decide its mode using this rubric in order:

1. **input** (handle on left edge, no inline editor): the property is
   typically wired from upstream rather than typed by the user. Types:
   - `image`, `image_mask`, `audio`, `video`, `model_3d`
   - `document`, `dataframe`, `tensor`
   - `list`, `dict`, `any` when used as data-flow inputs
   - Asset / file references (`AssetRef`, `ImageRef`, `AudioRef`, etc.)

2. **inline** (rendered as an editable input in the node body): the
   property is short, frequently typed, and central to what the node
   does. Types:
   - `str` / `text` properties named `prompt`, `system_prompt`,
     `query`, `text`, `template`, `expression`, `code`, `formula`,
     `name`, `title`, `path`, `url` (when typed by hand)
   - The single most-edited property of the node, when obvious

3. **inspector** (default, not rendered in body): everything else.
   - `model`, `tools`, `seed`, `temperature`, `max_tokens`, `top_p`,
     `top_k`, `n`, `steps`, `cfg`, `quality`, `size`, `width`,
     `height`, `format`, `style`, `voice`, `language`, `mode`, `enum`
     selectors, booleans
   - Anything an end-user would set once and forget

### Special cases

- **Utility nodes** (control flow `If`, `Loop`, `Map`, `Switch`,
  constants in `constant.ts`, input/output in `input.ts` and
  `output.ts`): declare `inlineFields = []` and `inputFields = []`
  explicitly. These keep the generic body layout.

- **Single-property nodes** (e.g. a node with just one `value` input):
  if the property is a data type → `input_fields = [name]`; if it's a
  short text → `inline_fields = [name]`. Don't leave both empty
  unless the node genuinely has no user-facing properties.

- **Output nodes** (in `output.ts`): properties are usually `value` of
  a specific type. Treat the displayed value → `input_fields = ["value"]`.

- **Dynamic nodes** (`isDynamic = true`): keep existing dynamic-property
  flow. `inline_fields` / `input_fields` only cover the static
  properties; dynamic ones still render via the existing add-property
  mechanism.

### Bucketing for parallel execution

Split 70 base-nodes files plus 4 elevenlabs files into ~10 buckets so
~10 Haiku agents can sweep in parallel:

| Bucket | Files |
|---|---|
| **B1 LLM providers** | `agents.ts`, `anthropic.ts`, `gemini.ts`, `mistral.ts`, `openai.ts`, `team.ts`, `tool-agents.ts`, `agent-tool-hydration.ts` |
| **B2 Image** | `image.ts`, `model3d.ts`, `compare.ts`, `lib-image-color-grading.ts`, `lib-image-draw.ts`, `lib-image-enhance.ts`, `lib-image-filter.ts`, `lib-image-utils.ts` |
| **B3 Audio / Video** | `audio.ts`, `video.ts`, `lib-audio-dsp.ts`, `lib-audio-effects.ts`, `lib-video-download.ts`, `elevenlabs-nodes/src/nodes/*.ts` (4 files) |
| **B4 Data / Text** | `data.ts`, `text-extra.ts`, `lib-nlp.ts`, `lib-markdown.ts`, `vector.ts`, `document.ts` |
| **B5 Documents / Office** | `lib-docx.ts`, `lib-doc-convert.ts`, `lib-doc-transform.ts`, `lib-epub.ts`, `lib-excel.ts`, `lib-pdf.ts`, `lib-pptx.ts`, `lib-ocr.ts` |
| **B6 Web / Network** | `apify.ts`, `lib-browser.ts`, `lib-http.ts`, `lib-rss.ts`, `lib-mail.ts`, `lib-html-parse.ts`, `lib-graphql.ts`, `search.ts` |
| **B7 Storage / External services** | `lib-s3.ts`, `lib-supabase.ts`, `lib-sqlite.ts`, `lib-notion.ts`, `lib-secret.ts`, `lib-twilio.ts`, `messaging.ts` |
| **B8 Code / Compute** | `code.ts`, `code-node.ts`, `sandbox.ts`, `lib-tensorflow.ts`, `lib-charts.ts`, `lib-svg.ts`, `lib-validate.ts`, `triggers.ts` |
| **B9 Utility / Framework** | `constant.ts`, `control.ts`, `input.ts`, `output.ts`, `workflow.ts`, `workspace.ts`, `lib-datetime.ts`, `lib-grid.ts`, `lib-os.ts`, `generators.ts`, `extended-placeholders.ts`, `kie-dynamic.ts` |
| **B10 Factories** | `packages/replicate-nodes/src/replicate-factory.ts`, `packages/fal-nodes/src/fal-factory.ts` + `fal-dynamic.ts`, `packages/kie-nodes/src/kie-factory.ts`, `packages/kie-codegen/src/node-generator.ts` |

### Per-node rule

For every class in your bucket:

1. Read the class's `@prop` declarations (and existing `basicFields`
   if present).
2. Decide each property's mode via the rubric above.
3. Add `static readonly inlineFields = [...]` and
   `static readonly inputFields = [...]`. Empty arrays are valid;
   include them explicitly so the intent is documented.
4. Delete the old `static readonly basicFields = ...` line for that
   class. (Keep the BaseNode-level default — only remove per-class
   declarations.)
5. If a property name appears in BOTH `inlineFields` and `inputFields`,
   that's a bug — fix.
6. Keep all other class members (`metadataOutputTypes`,
   `recommendedModels`, `supportsDynamicOutputs`, etc.) untouched.

### Factory updates (B10)

For `replicate-factory.ts`, `fal-factory.ts`, `kie-factory.ts`,
`kie-codegen/node-generator.ts`: the factory emits node classes
programmatically. Apply the same rubric inside the factory:

- Scan the property metadata at factory time
- Build `inlineFields` and `inputFields` arrays per the rubric
- Set them on the emitted class via `Object.defineProperty` (same
  mechanism the factory uses for `metadataOutputTypes`)

This single change migrates ALL replicate / fal / kie nodes at once.

---

## Work breakdown — agent dispatch plan

Spawn three agents in two phases. Use Sonnet for the foundation (touches
generated types and the protocol); Haiku is fine for the two node-class
sweeps and the verifier.

### Phase 1 — Foundation (one agent, **sonnet**)

Owner: protocol + node-sdk + frontend types.

Files touched:
- `packages/protocol/src/api-types.ts`
- `web/src/stores/ApiTypes.ts` (and any other place `NodeMetadata` is declared on the web side — grep first)
- `packages/node-sdk/src/base-node.ts`
- `packages/node-sdk/src/node-metadata.ts`
- `packages/node-sdk/src/metadata.ts`

Deliverables:
- New optional fields on `NodeMetadata` and the SDK `BaseNode`
- Metadata builder writes them when set
- `npm run build:packages` clean
- `npm run typecheck` clean across web + packages

Do **not** touch any node class or the frontend rendering yet —
Phase 2 picks up after this is green.

### Phase 2 — In parallel (~11 agents)

All Phase 2 agents run **after** Phase 1 lands and may run concurrently.

#### Phase 2.frontend — ContentCardBody two-pass render (**haiku**, 1 agent)

Files touched:
- `web/src/components/node_types/ContentCardBody.tsx`

Implementation:
1. Read `inline_fields` and `input_fields` from metadata.
2. Branch:
   - **New layout** (either array non-empty): two `<NodeInputs>` passes —
     one with `showFields={true}` for inline props, one with
     `showFields={false}` for input-only props in the absolute left
     column.
   - **Fallback** (both empty): keep current behaviour (single
     `NodeInputs` with `showFields={false}` over all properties).
3. Update CSS so `.inline-fields` shows labels normally (don't hide
   `.property-label` there). Keep label hiding scoped to
   `.input-handles` (left column).

Run `npm run lint` and `npm run typecheck` (web only).

#### Phase 2.B1 .. 2.B10 — Backend node migration (**haiku**, 10 agents in parallel)

One agent per bucket from the Bucketing table above. Each agent:

1. Reads every file in its bucket
2. For every `class X extends BaseNode` in those files:
   - Applies the classification rubric to the class's `@prop`s
   - Inserts `static readonly inlineFields = [...]` and
     `static readonly inputFields = [...]` (both required; empty
     arrays are valid)
   - Deletes any existing `basicFields` declaration
3. After all classes in the bucket are migrated, runs
   `npm run build --workspace=packages/<package>` on the affected
   package(s) to surface type errors. Fix locally.
4. Reports a brief summary: classes migrated, any judgment calls that
   were non-obvious.

The 10 agents should NOT step on each other — buckets are file-disjoint.

### Phase 3 — Verifier (**haiku**)

Owner: end-to-end validation.

Steps:
1. `npm run typecheck` (root) — must pass.
2. `npm run lint`      (root) — must pass.
3. `npm run build:packages` — clean.
4. Spot-check by reading the resulting Agent / CreateImage / EditImage /
   TextToImage node files plus ContentCardBody to confirm the
   integration is coherent (no orphan `basicFields`, no unused code).
5. Commit + push to `claude/t-20260513-0032-contentcardbody`.
6. Update PR #3130 description with a short paragraph about the field
   classification refactor.

---

## Anti-scope (do not do in this PR)

- Don't change the Inspector layout. Confirm it shows everything; don't
  redesign it (that's Track D / PR 8).
- Don't touch `@prop` decorators or property declaration syntax.
- Don't remove `basic_fields` from the protocol — it's the fallback for
  node packages that haven't been rebuilt yet.
- Don't expand `CONTENT_CARD_REGISTRY` in this PR. Adding nodes to it is
  a separate decision (different UI shape).
- Don't migrate node classes outside the bucket list (huggingface-nodes,
  mlx-nodes, apple-nodes — these are Python; they're out of TypeScript
  scope).

---

## Verification checklist (Phase 3)

- [ ] Protocol type has `inline_fields?: string[]` and `input_fields?: string[]`
- [ ] `BaseNode` has `static readonly inlineFields/inputFields` (undefined defaults)
- [ ] `node-metadata.ts` writes them through to the serialized metadata
- [ ] ContentCardBody renders inline fields with editors and input fields as handles
- [ ] Fallback path still works for nodes that haven't been migrated
- [ ] Every class previously declaring `basicFields` now declares both `inlineFields` and `inputFields` instead
- [ ] Factories (replicate / fal / kie) emit the new fields
- [ ] `grep -rn "static readonly basicFields" packages/base-nodes packages/elevenlabs-nodes` returns **zero** matches (factory-emitted nodes shouldn't have it anyway)
- [ ] `npm run typecheck` clean (root)
- [ ] `npm run lint`      clean (root)
- [ ] `npm run build:packages` clean
- [ ] Commit pushed to PR branch
- [ ] PR description updated with the field-classification summary

---

## Open questions for the executing agents (resolve as you go)

1. **Where is `NodeMetadata` declared on the web side?** Either
   `web/src/stores/ApiTypes.ts` re-exports from `@nodetool-ai/protocol`,
   or it's a hand-written mirror. Grep for `interface NodeMetadata` to
   confirm before editing.
2. **Does `node-metadata.ts` need both `?? undefined` *and* explicit
   include logic, or does the JSON serializer drop `undefined`
   naturally?** Look at how `basic_fields` is currently handled (line
   ~289–290) and follow that pattern exactly.
3. **Are there any tests that depend on the exact `NodeMetadata` shape?**
   Run the existing test suite after Phase 1; if anything breaks, fix
   minimally.
