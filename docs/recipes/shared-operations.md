# Shared Recipe operations and compilation

A Recipe remains a normal Application. `compileRecipeApplication` in
[`@nodetool-ai/app-runtime`](../../packages/app-runtime/src/recipe-compiler.ts)
turns a manifest and concrete operation bindings into the document edited by
the App Builder. It returns either that document or diagnostics identifying
the unsatisfied manifest field or operation. Compilation executes no provider,
workflow or script.

## Operation contracts

`RecipeOperationContract` declares the semantic ID and positive version, typed
named inputs and outputs, spend boundary, resource writes, preservation
guarantees, supported media strategies, idempotency and stale-input behavior.
`RecipeOperationSpec.intent` resolves that semantic ID. `version` defaults to
one for older manifests. `id` and `bindingId` retain their existing meanings.
The compiler requires one matching concrete `OperationBinding` with a pinned
Script or Workflow target. It does not introduce another execution graph.

The supplied contract describes an implementation's guarantees. It is not a
replacement for runtime enforcement. Source ownership and actual Timeline
fidelity still run through the existing Storyboard and finishing capabilities.
The compiler rejects unsupported preservation or media policy before execution.

The first shared library is
[`scripts/recipe-operations.mjs`](../../scripts/recipe-operations.mjs):

| Semantic operation | Inputs and outputs | Resource writes | Spend and rerun behavior |
| --- | --- | --- | --- |
| `plan_storyboard@1` | Typed Recipe inputs and a constant manifest, optional Storyboard ID, then Storyboard ID/revision, visual preview, plan, source fingerprint and approval state | Updates source Asset entity metadata and creates or updates a normal Storyboard | No generation spend. Upserts shots by stable semantic label and resets approval. A changed shot order or set causes an explicit conflict. |
| `finish_storyboard@1` | The same sources, approved fingerprint and Storyboard revision, optional Timeline ID/revision, then Timeline reference/revision and validation | Creates or updates a normal Timeline and its Storyboard link | Default deterministic mode has no model spend. Explicit agentic mode declares model spend. Requires approval, rejects stale source or policy changes, then uses existing revision-checked finishing and reconciliation. |

Both use exact source assets, text and colors. Both support
`still_motion_graphics`. Neither dispatches generative video or image editing.
The shared planner reads semantic shot and graphics intent from manifest data.
It does not contain Recipe-specific prices, copy or product selection.
The finisher invokes the existing `finish_storyboard` capability.

Planning tags product and logo assets through the existing `create_entity`
capability when they are not already canonical entities. Entities are Asset
metadata, so this does not duplicate uploaded media. Existing entity metadata
is reused. A changed entity reference image causes an explicit conflict.
Graphics and protected inputs retain their exact `asset_id` plus the entity
relationship. Graphics-only entities are not cast into generation prompt lists.

The planner invokes the read-only `preview_storyboard_design` operation and
exposes its inline Timeline envelope through the existing Timeline widget
before Approval. That is a composed visual preview, with no persisted Timeline
or new renderer. Its textual source list remains available alongside it.

To opt into agentic finishing, declare `strategy: "agentic"` and an existing
`model: {provider, id}` on the Recipe's finishing operation. Both become normal
constant input mappings. Compilation rejects an absent model. Execution
rejects a missing or changed strategy/model and stale approval before provider
dispatch. This allows normal Mini App script execution without requiring an
ambient chat session. Omitting the strategy retains deterministic finishing.
Agentic script execution uses the protocol's bounded 120-second timeout.
Deterministic planning and finishing retain 60-second timeouts.

Each Recipe specializes the shared scripts' declared input ports to its own
typed inputs. The implementation code and semantic operation version remain
the same. Normal script versions are carried in ApplicationBundle and pinned
by ordinary import and release machinery. No separate Recipe executor or
mutable runtime registry exists.

Model, generation and rendering operations supplied by an author must declare their
spend boundary and a separate approval input. Their implementation must reject
stale inputs or resource revisions. The compiler never folds them into an
automatic planning action. This library does not claim to supply generation or
export operations that have not been bound to actual implementations.

## Compiler mapping

| Manifest input | Existing widget | Variable type |
| --- | --- | --- |
| Text | TextInput | `str` |
| Text with declared choices | ChoiceCards | `str` |
| Number | NumberInput | `float` |
| Boolean | Switch | `bool` |
| Image, video or audio | ImageInput, VideoInput or AudioInput | Matching media type |
| Color | ColorInput | `str` |

Entity, generic Asset, Storyboard and Timeline inputs currently fail with an
unsupported-widget diagnostic. The existing ResourcePicker selects a resource
collection and does not write an input variable. The compiler does not emit a
control whose selection never reaches the operation.
Defaults preserve original values, including text whitespace. Named input
groups become normal headings and controls. Choice values must be unique and
their defaults must resolve.

Timeline outputs use Timeline. Asset outputs use Download. Storyboard and
structured value outputs use Json for review. Outputs are placed after the
operation that produces them, before the next approval or action. Operations
remain separate Buttons with ordinary run events and execution error bindings.
Shared production scripts also expose the existing Stepper state and Approval
control. UI and variables remain editable through the App Builder.

Semantic shot intent declares an ID, title, duration, source input references
and asset/text/shape roles. It can select an existing Storyboard aspect ratio.
It contains no tracks, clip IDs, keyframes, easing, masks or transforms.
Shared planning requires an appropriate exact-preservation rule for every
visible source. Compilation rejects protected inputs with no visible element.
Storyboard IDs and Timeline references remain ordinary durable resources.

## Authoring and verification

Call `compileRecipeApplication(manifest, {operations, title})` with contracts
and actual bindings. `compileSharedRecipeBundle` provides the shipped shared
plan/finish bindings and script documents. Its result passes ordinary document
and executable-bundle validation.

The manifests in
[`recipe-manifests.mjs`](../../scripts/example-apps/recipe-manifests.mjs)
compile without hand-authored UI:

1. Product Price Drop has two vertical shots, separate product/logo assets and
   exact headline, prices and CTA.
2. Testimonial Card has a portrait, exact quotation and attribution in one 4:5
   shot. It does not fabricate a generated spokesperson.
3. Catalogue Visual Set has three different product assets and names across
   three square product cards in an editable Timeline.

The existing example build script regenerates the shipped Price Drop bundle:

```bash
npm run build --workspace=packages/app-runtime
node scripts/build-example-apps.mjs --app product-price-drop --skip-validate
node scripts/build-example-apps.mjs --app product-price-drop --check
```

The compiler tests reject invalid contracts and bindings. Script tests run the
real `app debug --no-run` simulator validation for all three bundles, prove
determinism, verify normal imported pins, execute shared planning and reject
stale copy, asset and preservation-policy approvals. The Price Drop integration
test executes the actual sandbox scripts, renders the layered result and
checks reconciliation:

```bash
npm run test --workspace=packages/app-runtime
node scripts/run-vitest.mjs run scripts/__tests__/recipe-operations.test.mjs
npm run test --workspace=packages/websocket -- tests/product-price-drop.test.ts
```

Adding a new generative operation, new widget strategy or arbitrary layout
generator is separate work. It must provide an actual executable binding,
runtime policy enforcement and a headless proof before a manifest can use it.
