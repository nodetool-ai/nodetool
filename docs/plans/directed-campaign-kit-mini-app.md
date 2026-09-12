# Directed Campaign Kit mini app

## Outcome

Create a campaign from one product reference, approve one visual direction and
hero, then compare one requested revision with the accepted original. The app
delivers a landscape hero, 4:5 and 9:16 compositions, editable SVG versions of
those compositions, and a campaign record that can reopen the accepted work.

App name: **Directed Campaign Kit**. Slug: `directed-campaign-kit`.
Opening copy: **One product. One direction. A campaign you can revise.**

The demonstration uses an olive travel cup on pale architectural stone at last
light. The revision changes the light to blue hour. Product geometry, camera,
surface, composition, headline, and CTA are preservation instructions that the
creator checks. The app preserves the original files exactly. It cannot guarantee
that an image model obeys every visual instruction.

### Decisions

D1. Create a new app. Keep Product Launch Kit unchanged. Its current operations
produce mockups and a video, and neither operation hands an approved result to
the other. Replacing it would change its existing job and leave irrelevant video
controls in this focused flow.

D2. Propose three written directions before any image generation. Render only
the selected direction. Allow another hero attempt before acceptance, but keep
one accepted hero and one revision in the completed campaign.

D3. Derive the social formats deterministically from the accepted hero. Use a
contained image area within each artboard so that resizing cannot crop off the
product. These are designed compositions using the same photograph, not two new
model interpretations of it.

D4. Keep exact text in SVG text elements and app fields. PNG exports are flat.
Do not describe these as native editable Sketch text layers. The current Sketch
schema supports raster, mask, and group layers, and CreateSketch creates one
raster layer.

D5. The app is an ApplicationBundle, not a standalone website. Ship it through
the existing example app generator and recipe catalogue. No publishing, public
generation, deployment, motion, aesthetic scoring, freeform editor, multi-product
batching, or functioning landing-page code is part of this implementation.

D6. Carry the full portable campaign record between layout runs as a document.
Code node string outputs are capped at 100,000 characters, below the 16 MiB
media bridge limit and below the size of a base64 campaign record. The `record`
string is therefore compact metadata only. `record_file` is the authoritative
portable artifact and the revision layout reads it through `media.text`.

## Current capabilities and sources

The implementation uses the [workflow-builder skill](../../.claude/skills/nodetool-workflow-builder/SKILL.md)
and follows [development standards](../DEVELOPMENT_STANDARDS.md),
[base-node example rules](../../packages/base-nodes/AGENTS.md),
[design tokens](../DESIGN.md), and the
[primitives strategy](../../web/src/components/ui_primitives/STRATEGY.md).
Product framing follows [Product](../../marketing/PRODUCT.md) and
[Narrative](../../marketing/NARRATIVE.md).

The source of widget identifiers is
[widgets.ts](../../packages/app-runtime/src/widgets.ts). It contains `Container`
(the palette calls it Panel), `Columns`, `Accordion`, `Tabs`, `RadioGroup`,
`ImageCompare`, and `Download`. Some are absent from the older
[reference](../mini-apps-reference.md). The current
[app-debug documentation](../harnesses.md#nodetool-app-debug-app-builder-debug-harness)
and runtime support conditions, formats, and seeded resources. The reference's
claim that these are not simulated is stale.

| Capability | Existing implementation | Consequence |
| --- | --- | --- |
| Several operations and variable handoffs | [operations.ts](../../packages/app-runtime/src/operations.ts) | A paid step is a separate explicit action. |
| Conditions | [conditions.ts](../../packages/app-runtime/src/conditions.ts) | One binding comparison per condition. Compute compound gates in workflows or use an explicit stage variable. |
| Button events | [actions.ts](../../packages/app-runtime/src/actions.ts) | `setVariable` events take literal strings. They cannot copy another binding's value. Approval snapshots must come from a workflow. |
| Image editing | [image.ts](../../packages/image-nodes/src/nodes/image.ts) | `nodetool.image.ImageToImage` takes `image: list[image]`, `prompt`, `model`, `aspect_ratio`, `resolution`, and emits `output`. |
| SVG composition | [lib-svg.ts](../../packages/text-nodes/src/nodes/lib-svg.ts) | `lib.svg.Document` and `lib.svg.SVGToImage` accept `elements`, `width`, `height`, `viewBox`. Both emit `output`. |
| Deterministic data work | [code-node.ts](../../packages/code-nodes/src/nodes/code-node.ts) | Use `inputs`, declared dynamic handles, and `await output(name, value)`. No legacy return-object contract. |
| Portable media | [sandbox-media-ref.ts](../../packages/agents/src/sandbox-media-ref.ts) | Code can use `media.bytes`, `media.text`, `media.info`, and `media.toDocument(bytes, {mimeType, filename})`. |
| Saved app | [bundle.ts](../../packages/app-runtime/src/bundle.ts) | App exports contain graphs and configuration, not live instance state. A campaign record is a separate artifact. |

The current example generator only exposes a subset of these widgets. Extend
its authored layout path for this app. Do not add widgets or expression syntax
to app-runtime to accommodate the recipe.

### Component and capability audit

This audit reads the catalogue, parser, builder configuration, web and mobile
renderers, and app-debug implementation. It establishes contracts, not completed
browser interaction tests. The limitations below override aspirational behavior
elsewhere in this design.

| Status | Surface | Evidence and consequence |
| --- | --- | --- |
| Fully supported | Document and mappings | [document.ts:27](../../packages/app-runtime/src/document.ts#L27) defines schema v4. Line 280 parses workflow operations and line 319 parses variable scope. The generator's v3 documents still upgrade correctly. Keep its compatible version for this app rather than migrating every other bundle. |
| Fully supported | Basic fields and display | [config.tsx:420](../../web/src/components/appbuilder/puck/config.tsx#L420), lines 786, 845, and 1060 register Heading, Text, Markdown, TextInput, Select, and ImageInput with actual renderers and builder fields. [mobile widgets.tsx:2778](../../mobile/src/components/app_runtime/widgets.tsx#L2778) registers their native equivalents. Use fixed A/B/C choices and Markdown directions. |
| Fully supported | Columns and Accordion | [widgets.tsx:1165](../../web/src/components/appbuilder/puck/widgets.tsx#L1165) stacks columns below a 700px container width. [config.tsx:1249](../../web/src/components/appbuilder/puck/config.tsx#L1249) defines Accordion title/defaultOpen/content. [mobile widgets.tsx:2650](../../mobile/src/components/app_runtime/widgets.tsx#L2650) always stacks columns and line 2725 implements Accordion. Tabs also exists, but v1 does not need it. |
| Fully supported | Model Select | [config.tsx:1032](../../web/src/components/appbuilder/puck/config.tsx#L1032) defines modelKind values `language_model` and `image_model`, not `language` and `image`. [WorkflowInputWidget.tsx:317](../../web/src/components/appbuilder/puck/WorkflowInputWidget.tsx#L317) writes the reference. [ModelSelectWidget.tsx](../../mobile/src/components/app_runtime/ModelSelectWidget.tsx) supplies the native selector. The chosen model must still support the required editing/reference capability. |
| Fully supported | Variable handoffs | [operations.ts:45](../../packages/app-runtime/src/operations.ts#L45) resolves input mappings and [fold.ts:78](../../packages/app-runtime/src/fold.ts#L78) writes output values to display slots and mapped variables. These writes are incremental, not one atomic multi-variable transaction. Complete validation and processing before final output, and expose restore only in a fresh brief instance. |
| Fully supported | Visibility and formatting | [conditions.ts:109](../../packages/app-runtime/src/conditions.ts#L109) parses one comparison and treats invalid bindings as no condition. [conditionalWidget.tsx:40](../../web/src/components/appbuilder/puck/conditionalWidget.tsx#L40) applies web conditions. [mobile widgets.tsx:2842](../../mobile/src/components/app_runtime/widgets.tsx#L2842) applies native conditions. Compound condition objects and Boolean expression strings are unsupported. |
| Supported with limitations | Disabled edit fields | [conditionalWidget.tsx:60](../../web/src/components/appbuilder/puck/conditionalWidget.tsx#L60) dims controls and blocks pointer events. TextInput at [widgets.tsx:819](../../web/src/components/appbuilder/puck/widgets.tsx#L819) and ModelSelect at [WorkflowInputWidget.tsx:317](../../web/src/components/appbuilder/puck/WorkflowInputWidget.tsx#L317) do not consistently forward native disabled state. Hide inactive edit fields with visibleWhen and show captured read-only text. Do not rely on disabledWhen to prevent keyboard edits. |
| Supported with limitations | Gallery selection | [MediaWidgets.tsx:230](../../web/src/components/appbuilder/puck/MediaWidgets.tsx#L230) writes the original selected item to selectionBinding and emits change. [mobile widgets.tsx:938](../../mobile/src/components/app_runtime/widgets.tsx#L938) also supports selection. It selects images, not arbitrary direction cards. V1 omits Gallery. |
| Supported with limitations | ImageCompare | [config.tsx:738](../../web/src/components/appbuilder/puck/config.tsx#L738) exposes binding/compareBinding/label/height/placeholder. [ImageComparerWidget.tsx:95](../../web/src/components/appbuilder/puck/ImageComparerWidget.tsx#L95) resolves both images. [ImageComparer.tsx:170](../../web/src/components/widgets/ImageComparer.tsx#L170) moves the wipe by pointer, without keyboard wipe control. [mobile widgets.tsx:1048](../../mobile/src/components/app_runtime/widgets.tsx#L1048) shows stacked images. Always offer complete labelled images and downloads. There are no widget-level labelA/labelB fields. |
| Supported with limitations | DocumentInput | [WorkflowInputWidget.tsx:372](../../web/src/components/appbuilder/puck/WorkflowInputWidget.tsx#L372) maps it to the existing document property control. [mobile widgets.tsx:1513](../../mobile/src/components/app_runtime/widgets.tsx#L1513) uses the native media picker. The widget does not validate campaign JSON schema, MIME, or size. The restore workflow must. Verify actual JSON selection and upload before claiming reopening works. |
| Supported with limitations | Download and SVG | [widgets.tsx:779](../../web/src/components/appbuilder/puck/widgets.tsx#L779) resolves a URI and renders an anchor with a filename. It does not serialize arbitrary objects or raw base64 into files. [mobile widgets.tsx:668](../../mobile/src/components/app_runtime/widgets.tsx#L668) opens the URI through the OS, without a guaranteed save dialog. Promote documents to URI-bearing refs. Use PNG previews and SVG downloads. Native SVG preview/editing is outside v1. |
| Supported with limitations | Persistence | [variablePersistence.ts:45](../../web/src/components/appbuilder/runtime/variablePersistence.ts#L45) reads per-app localStorage and line 81 writes selected user variables. Quota failures are swallowed. This is not portable campaign storage. Keep explicit campaign records, nonpersistent instance state, and app bundle export separate. |
| Supported with limitations | Progress/activity/errors | [fold.ts:183](../../packages/app-runtime/src/fold.ts#L183) folds node_progress, node/job errors, and tool/planning/task activity. [config.tsx:570](../../web/src/components/appbuilder/puck/config.tsx#L570) and line 625 register Progress and Alert. Some providers supply no granular progress/activity. Show a fixed stage label and indeterminate progress when no ratio exists. |
| Supported with limitations | Action ordering | [useWidgetRuntime.ts:160](../../web/src/components/appbuilder/puck/useWidgetRuntime.ts#L160) dispatches matching event rows in order. [useAppRuntime.ts:937](../../web/src/components/appbuilder/runtime/useAppRuntime.ts#L937) starts run/cancel asynchronously. Literal variable writes are synchronous. Event rows cannot sequence dependent workflows or await cancellation. |
| Not currently supported correctly | Cancel button during a web run | [useWidgetRuntime.ts:115](../../web/src/components/appbuilder/puck/useWidgetRuntime.ts#L115) selects an operation from run or cancel events. [widgets.tsx:1111](../../web/src/components/appbuilder/puck/widgets.tsx#L1111) unconditionally sets disabled to showRunning. A cancel button therefore disables itself when its operation runs. A separate shared renderer fix is required, specified in A8. |
| Not supported | Native editable Sketch text, dynamic direction cards, binding-copy actions | [sketch.ts:84](../../packages/protocol/src/api-schemas/sketch.ts#L84) enumerates raster/mask/group only. The widget catalogue has no generic dynamic-card repeater. [actions.ts:113](../../packages/app-runtime/src/actions.ts#L113) maps setVariable event values as literals. Use SVG text, fixed choices, and workflow-generated snapshots. |
| Supported with limitations | App-debug coverage | [app-spec.ts:338](../../packages/execution/src/app-debug/app-spec.ts#L338) reads conditions/formats and line 630 validates bindings. [simulate.ts:1097](../../packages/execution/src/app-debug/simulate.ts#L1097) rejects hidden/disabled scripted interactions. Line 323 excludes DOM layout/focus, stored resource collections, and reactive subgraph execution. Passing headless checks does not prove downloads, uploads, decoding, or keyboard behavior. |

The smallest supported screen uses basic fields, fixed Select, ModelSelect,
Button, Image, Progress, Alert, Download, DocumentInput, Columns, Accordion, and
ImageCompare with complete-image fallback. It needs no new widget type.
Gallery, Tabs, Sketch, resources, and live reactive generation are omitted.

Native disabled forwarding across other input widgets, keyboard wipe control,
and native SVG editing remain optional follow-ups. Before claiming in-app
cancellation, reproduce and fix the Button issue in the explicit A8 workstream.
Before claiming portable reopen, verify JSON upload/download and a round trip.
Do not hide these changes inside the app bundle or invent properties to bypass
them.

### Guided-flow component decision

D7. Do not add a guided-flow widget in v1. The existing
[SetupFlow](../../web/src/components/setup/SetupFlow.tsx) implements useful focus,
step navigation, and awaited advancement, but its
[contract](../../web/src/components/setup/types.ts) accepts React render functions
and asynchronous callbacks. App event dispatch does not await those callbacks.
Wrapping it as JSON would require a new stage/action contract, not just exposing
a component. The image-specific
[useImageSetupFlow](../../web/src/components/setup/image/useImageSetupFlow.ts)
also depends on sketch stores and image setup state.

[OptionCardGrid](../../web/src/components/setup/OptionCardGrid.tsx) is reusable
and already supplies roving radio focus. Three Markdown descriptions followed
by Select achieve the required decision without adding dynamic option bindings,
a native renderer, and new headless selection semantics.
[PlanReview](../../web/src/components/setup/PlanReview.tsx) uses field callbacks
and commit behavior that would require a separate serializable editing contract.
The campaign does not need that contract. Keep these components unchanged.

The only shared UI work required here is correcting existing Button semantics.
It introduces no schema props, binding modes, or migration. A future stepper or
option-card widget is outside this implementation, not a hidden dependency.

## Screen and interaction design

Use one scrollable review surface. Show the accepted hero and comparison at the
largest available width. A narrow form precedes the preview in reading order.
Use short stage headings, plain version labels, and existing theme surfaces.
Keep models and reference details in an Accordion. Avoid repeated nested
control/result panels and a dashboard appearance.

The widget tree below uses exact catalogue type names. Node IDs in subsequent
tables are the implementation contract. Display heights and column gaps are
ordinary app layout data, using the generator's existing 4px-aligned defaults.

```text
Heading: Directed Campaign Kit
Text: One product. One direction. A campaign you can revise.
Text: current stage / next action; initially “Stage: Brief. Add the product reference and choose models, then propose three directions.”
Columns
  left
    Heading: Brief
    ImageInput: Product reference
    TextInput: Product name
    TextInput: Campaign message
    TextInput: Audience
    TextInput: Exact headline
    TextInput: Exact CTA
    Accordion: Models and optional reference, open by default
      ImageInput: Optional visual reference
      Select: Reference role [none, composition, palette, material, lighting]
      TextInput: What this reference contributes
      TextInput: What to ignore
      ModelSelect: Direction model
      ModelSelect: Hero model
      ModelSelect: Revision model
    Button: Propose three directions
    Accordion: Reopen a campaign
      DocumentInput: Campaign record
      Button: Reopen campaign
  right
    Heading: Direction
    Text: Three written directions will appear here before any image is generated. (brief only)
    Markdown: three proposed directions
    Select: Direction [A, B, C]
    Button: Generate this hero
    Text: selected direction and preservation instructions
Heading: Review the hero
Image: candidate hero, contain
Text: Compare shape, lid, logo, color, camera, and surface with the reference.
Button: Try the hero again
Button: Approve hero and build formats
Heading: Accepted campaign
Image: accepted original hero, contain
Columns
  left: Image 4:5 + Download PNG + Download editable SVG
  right: Image 9:16 + Download PNG + Download editable SVG
Heading: Direct one revision
TextInput: Change
TextInput: Preserve
TextInput: Allow to respond
Button: Make this revision
ImageCompare: accepted original / revised candidate
Text: Original and Revision 1 labels and requested change
Image: original + Image: revision as accessible comparison fallback
Button: Accept revision and build formats
Button: Keep original
Heading: Revision formats
Columns
  left: Image revised 4:5 + Download PNG + Download editable SVG
  right: Image revised 9:16 + Download PNG + Download editable SVG
Download: Campaign record
Text: App and linked workflows remain editable in Studio.
```

Every operation also gets `Progress`, an activity `Text`, an error `Alert`, and
a cancel `Button`. Place these with the operation's action. Errors use
`op:<id>/exec#error`. Run buttons use
`disabledWhen: {binding: "op:<id>/exec#running", op: "notEmpty"}`.
Cancel buttons use the same condition as `visibleWhen`.

Use explicit visibility conditions on interactive widgets. Do not assume
layout containers support condition fields: `widgetFields` excludes those on
layout widgets. Hide inactive action widgets while leaving accepted images
visible. Do not use generated direction titles as dynamic Select options.
Options stay A, B, C, and the Markdown pairs each letter with its title.

The default brief describes the Olive Travel Cup, an audience of commuters who
spend weekends outdoors, headline “Take the long way home.” and CTA “Meet Olive”.
Use an existing redistributable package product image only after verifying that
it depicts this product. Otherwise leave the upload empty and guard the first
paid run. Never ship a local path or unrelated image labelled as the olive cup.

## Workflow decomposition

Create these graphs in `packages/base-nodes/nodetool/examples/nodetool-base/`.
Graph Input node IDs are `in-<snake_case_name>`, Output node IDs are
`out-<snake_case_name>`. Preserve this convention so both Sol workstreams can
work independently. Names below are the exact `data.name` values.

| Key / example name | Inputs | Outputs |
| --- | --- | --- |
| `directions` / Propose Three Campaign Directions | `product_image` image, `product_name` str, `campaign_message` str, `audience` str, `headline` str, `cta` str, `reference_image` image, `reference_role` str, `reference_use` str, `reference_ignore` str | `directions` str, `plan` str, `phase` str |
| `hero` / Render a Directed Campaign Hero | `plan` str, `choice` str | `hero` image, `contract` str, `phase` str |
| `layouts` / Compose Directed Campaign Formats | `hero` image, `contract` str, `version` str, `original_record` document | `hero` image, `portrait` image, `story` image, `portrait_svg` document, `story_svg` document, `contract` str, `record` str, `record_file` document, `phase` str |
| `revision` / Revise an Accepted Campaign Hero | `hero` image, `contract` str, `change` str, `preserve` str, `allow` str | `hero` image, `contract` str, `phase` str |
| `restore` / Reopen a Directed Campaign | `record_file` document | `accepted_hero` image, `accepted_contract` str, `original_portrait` image, `original_story` image, `original_portrait_svg` document, `original_story_svg` document, `original_record` str, `revised_hero` image, `revised_contract` str, `revised_portrait` image, `revised_story` image, `revised_portrait_svg` document, `revised_story_svg` document, `record_file` document, `phase` str |

All results must pass through `nodetool.output.Output` with its `value` input.
Use the existing `nodetool.input.StringInput`, `ImageInput`, and `DocumentInput`
types. Model controls bind directly to the declared model property on the Agent
or ImageToImage node, so no extra model input nodes are necessary.

### Graph construction

A1. Directions: validate required brief fields and the reference role in a
Code node, build a role-labelled prompt and ordered image list, then call
`nodetool.agents.Agent` with no tools. Read its final `text` output. A second
Code node parses JSON and validates exactly three directions with distinct
IDs A/B/C, nonempty title, setting, composition, lighting, palette, and
preservation instructions. Emit a readable Markdown review and a serialized
plan containing the original brief and references. Malformed output produces a
visible error and no ready phase. Do not repair JSON through another paid call.

A2. Hero: validate the plan and choice, select the direction deterministically,
then send the product image first and optional reference second to
`nodetool.image.ImageToImage`. Use `aspect_ratio: "16:9"` and `resolution: "1K"`.
The prompt describes the selected direction, reference roles, deliberate copy
space, and prohibits added campaign text. Emit one candidate image and a
serialized creative contract. The finalizer depends on the image, so it cannot
emit a ready phase before generation succeeds.

A3. Layouts: generate SVG elements in Code from the supplied hero and exact
contract text. Send the same elements to `lib.svg.Document` and
`lib.svg.SVGToImage` for each ratio. Promote SVG bytes to document refs with
`image/svg+xml` MIME using `media.toDocument`. The finalizer waits for both PNGs
and both SVGs, then emits the snapshot, downloadable record, and next phase.
The `record` output is a compact metadata summary. The complete record is the
`record_file` document, which the revision run reads through `media.text`.
This operation calls no model. Use separate operation bindings to run the same
graph for original and revision.

A4. Revision: take only the accepted hero and accepted contract as its source.
Construct the edit instruction from Change, Preserve, and Allow to respond.
Send the accepted hero first to ImageToImage. Product reference can be appended
when supported, with identity as its only role. Never use the original product
photo alone as the editing source. Emit one revised candidate and a revised
contract containing its parent contract and the exact request. Do not generate
social formats until the creator accepts this candidate.

A5. Restore: `media.text` reads the uploaded record, Code validates its schema,
then restores every saved image/document as a correctly typed media ref. Its
`original_record` string is compact metadata, not a second copy of the portable
record. Validate and promote one media payload per gated Code node so the full
record never expands all ten accepted artifacts in one sandbox invocation. Pass
the already validated record document through a registered control node instead
of a Code output. Emit the ready phase only after validation and restoration
finish. It must execute without a language or image model. A damaged record must
leave the currently accepted campaign intact.

These are new graphs. Reuse the Agent pattern from
“A Campaign Concept from a Brief”, the ImageToImage pattern from
“Put a Product on a Studio Backdrop”, and the relighting intent from
“Relight a Product for a Seasonal Campaign”. None of those complete graphs
already implements the required contract, so do not bind them unchanged or
alter their existing behavior. Do not reuse Product Mockup Generator's image
fan-out or Product Video Generator.

## Variables and operation mappings

All campaign values are `scope: "instance", persist: false`. Persistence is
explicit through the campaign record. Do not put generated images in
localStorage or mistake app bundle export for a saved campaign.

| Variables | Type / default | Writers |
| --- | --- | --- |
| `phase` | str / `brief` | Successful operation finalizers, explicit navigation/cancel events |
| `productImage`, `referenceImage` | image / empty typed refs | Upload widgets |
| `productName`, `campaignMessage`, `audience`, `headline`, `cta` | str / example brief | Brief widgets |
| `referenceRole` | str / `none` | Select |
| `referenceUse`, `referenceIgnore` | str / empty | Reference widgets |
| `directions`, `plan` | str / empty | `propose` |
| `choice` | str / `A` | Select |
| `candidateHero`, `candidateContract` | image, str / empty | `renderHero` |
| `acceptedHero`, `acceptedContract` | image, str / empty | `acceptHero`, validated `restore` |
| `originalPortrait`, `originalStory` | image / empty | `acceptHero`, validated `restore` |
| `originalPortraitSvg`, `originalStorySvg` | document / empty | `acceptHero`, validated `restore` |
| `originalRecord` | str / empty | Compact metadata from `acceptHero`, validated `restore` |
| `revisionChange`, `revisionPreserve`, `revisionAllow` | str / defaults below | Revision widgets |
| `revisedHero`, `revisedContract` | image, str / empty | `reviseHero`, validated `restore` |
| `revisedPortrait`, `revisedStory` | image / empty | `acceptRevision`, validated `restore` |
| `revisedPortraitSvg`, `revisedStorySvg` | document / empty | `acceptRevision`, validated `restore` |
| `recordFile` | document / empty | `acceptHero`, `acceptRevision`, validated `restore` |
| `chosenVersion` | str / `original` | Keep-original or accept-revision action |

Input mappings use `{from: "variable", variableId}`. Output mappings use
`{to: "variable", variableId}`. The display slot remains available too.

| Operation | Workflow | Handoff |
| --- | --- | --- |
| `propose` | `directions` | Brief variables into corresponding inputs, outputs into `directions`, `plan`, `phase`. |
| `renderHero` | `hero` | `plan`, `choice` in, `hero` into `candidateHero`, `contract` into `candidateContract`, `phase` into `phase`. |
| `acceptHero` | `layouts` | `candidateHero`, `candidateContract` in and `version` constant `original`; leave the document `original_record` empty. Map hero/contract to accepted variables, formats to original variables, compact record metadata to `originalRecord`, and the portable file to `recordFile`. |
| `reviseHero` | `revision` | `acceptedHero`, `acceptedContract`, revision fields in. Only revised variables and phase are written. |
| `acceptRevision` | `layouts` | `revisedHero`, `revisedContract`, version constant `revision`, and `recordFile` into document input `original_record`. Only revised formats, revised contract, compact record metadata, record file, and phase are written. Original artifacts remain intact. |
| `restore` | `restore` | Widget-bound `record_file` in. Restore outputs map to their correspondingly named variables and `recordFile`. |

All policies are `replace`, with run buttons disabled while the operation runs.
No change event starts a paid operation. Suggested timeouts are 180000ms for
directions, 600000ms for image edits, 120000ms for layouts and restore.

ModelSelect bindings are `op:propose/prop:direction-agent#model`,
`op:renderHero/prop:hero-edit#model`, and
`op:reviseHero/prop:revision-edit#model`, with `modelKind` values
`language_model`, `image_model`, and `image_model` respectively.

## Approval and revision states

```text
brief
  → proposing → directions_ready
  → rendering_hero → hero_ready
  → composing_original → campaign_ready
  → revising_hero → revision_review
  → composing_revision → complete
```

The run event and a literal stage change may share a button's events array, but
do not assume this sequences dependent workflows. Only the workflow's finalizer
advances to a ready stage. Test event order through the real runtime.

Brief controls are visible and editable only in `brief`. Hide inactive input
widgets with `visibleWhen` instead of relying on pointer-only disabling. Show
captured values as read-only text. An “Edit brief” action from
`directions_ready` returns to brief and clears the plan and direction text with
literal setVariable events. The next proposal captures a new brief. No action
can select a stale plan while editing. Hero retry is available only before
acceptance. Once the original formats finish, accepted source variables cannot
be changed by ordinary generation controls.

The defaults for the revision are:

- Change: “Move the scene from late afternoon to blue hour.”
- Preserve: “Keep the cup, camera position, composition, stone surface, headline,
  CTA, and spacing.”
- Allow to respond: “Let reflections, shadows, and the sky respond to the light.”

On successful revision generation, show the comparison and remove the paid
revision action. “Accept revision and build formats” runs only deterministic
composition. “Keep original” leaves both images visible in the current session
and retains the original downloadable record. A rejected revision candidate is
not included in that record. Accepting the revision creates the combined record.
Both versions remain downloadable when their formats exist.

Each busy stage has a retry action visible when no run is in flight, with the
same inputs. Cancel dispatches only cancellation. A separate return action is
available after running becomes false and restores the prior ready stage. Do not
chain cancel and stage reset on one click. No automatic generation retry. A layout failure retries layout
only. A revision failure cannot clear the original. An accepted revision's
layout failure retains the revised source so the retry does not bill for a
second image. Wrong or missing model selection, missing product, invalid JSON,
and missing reference for a non-none role fail before the image provider call.

The phase is an interaction gate, not a security boundary. A graph invoked
directly still validates its own inputs. Operation policies are per-operation,
not an app-wide mutex. The UI must expose only one workflow-changing action set
at a time. Expose restore only in a fresh `brief` instance, before any proposal.

## References and exact text

The product reference always controls product identity, proportions, finish,
lid, and visible branding. One optional visual reference has exactly one role.
`none` ignores the optional image. Any other role requires an image and uses
the written contribution/ignore notes. The prompt numbers image references in
the same order as the supplied list. Palette does not transfer objects, lighting
does not transfer the depicted product, and composition does not transfer its
branding. These are instructions, not hard model constraints.

V1 artboards are 1080×1350 and 1080×1920. Use a fixed design shared by both:
product name, exact headline, a large contained photograph, and exact CTA.
Keep the complete hero visible. Use an olive accent against a dark slate
artboard, pale text, and one thin division between image and copy. Artboard
colors and dimensions are output content data, not overrides to Studio's UI
theme. System font fallback must be disclosed in the exported SVG metadata.

Generate `<text>` and `<tspan>` elements from validated literal strings through
the existing SVG serializer. It escapes XML content. Never insert untrusted
raw SVG, external image links, scripts, CSS URLs, or model-generated markup.
Embed the resolved hero bytes as the SVG image so the file is self-contained.
Headline/CTA remain selectable text. PNGs use the same element tree.

Set bounded text lengths and a deterministic wrapping rule before composition.
Reject overflow with an actionable message, rather than truncating or rewriting
approved copy. Test ampersands, quotes, angle brackets, accented characters,
newlines, and long words. Edits to copy require rerunning only the layout graph
from the linked workflow or editing the exported SVG. In-app freeform typography
and post-acceptance copy editing are outside this v1 screen.

## Campaign record and reopening

Use a versioned JSON document with `schemaVersion: 1`, the original brief,
reference-role assignments, selected direction, approved copy, original source
image, original PNG/SVG artifacts, and optional accepted revised source/artifacts
plus the revision request and accepted version. Store media as MIME-labelled raw base64 bytes,
not session URLs. Preserve the original section unchanged when adding revision.
Wrap the JSON through `media.toDocument` using `application/json` and filename
`directed-campaign.json`. This document is the authoritative campaign record.
The `record` and restored `original_record` string outputs contain bounded
metadata for app state and must not duplicate the base64 artifact payloads.

Keep the record within the existing 16 MiB media bridge limit. Validate the
combined export size before writing, surface an explicit size error, and never
drop artifacts silently. Hero generation stays at 1K. The restore graph validates
the version, allowed MIME types, dimensions, bounded text, media payloads, and
required original fields before emitting any output. It recreates image and
document refs through the media bridge. Promote output media to URI-bearing
stored refs or supported data URIs before binding ImageCompare or Download.
Do not bind raw base64 payloads directly. A restored original returns to
`campaign_ready`. A record containing a completed revision returns to `complete`.
It must not permit an extra revision accidentally through restoration.

The record is portable campaign data. The ApplicationBundle separately reopens
the mini app and its graphs. Do not name either file `.nodetool` unless it was
produced by the existing `.nodetool` workflow bundle codec. Do not claim that
an ApplicationBundle alone contains accepted live state.

## Recipe manifest

Add `packages/base-nodes/nodetool/examples/recipes/directed-campaign-kit.recipe.json`
using the current shape:

```json
{
  "schemaVersion": 1,
  "slug": "directed-campaign-kit",
  "name": "Directed campaign kit",
  "outcome": "Approve one product hero, build two campaign formats, and compare one directed revision with the original.",
  "audience": "Small brand and social teams",
  "summary": [
    "Choose one of three written directions before making the hero.",
    "Build campaign formats from the accepted image and preserve the original when you revise it."
  ],
  "caveats": [
    "Image edits can change product details. Compare every take with the product reference.",
    "SVG exports preserve editable text. PNG exports are flat images.",
    "Choose compatible language and image-edit models using your own provider keys."
  ],
  "hero": "Render a Directed Campaign Hero",
  "apps": [{"app": "directed-campaign-kit", "role": "Direct and revise the campaign from one screen."}],
  "steps": [
    {"example": "Propose Three Campaign Directions", "role": "Choose the direction", "handoff": "Review A, B, and C, then select one."},
    {"example": "Render a Directed Campaign Hero", "role": "Approve the hero", "handoff": "Check product identity and composition before accepting."},
    {"example": "Compose Directed Campaign Formats", "role": "Build the formats", "handoff": "Keep the accepted hero and exact copy together in 4:5 and 9:16."},
    {"example": "Revise an Accepted Campaign Hero", "role": "Direct one revision", "handoff": "Compare the revision with the original, then use the same composition workflow."}
  ]
}
```

Restore is a utility operation, not a recipe step. The primary app must carry
every step graph, as required by
[example-recipes.test.ts](../../packages/websocket/tests/example-recipes.test.ts).
Add workflow listing metadata for all new graphs in
`packages/base-nodes/nodetool/package_metadata/nodetool-base.json`.

Do not invent a recorded sample, provider bill, screenshot, or model attribution.
The marketing recipe generator requires separate presentation and sample
evidence. A new public marketing page and sample production are outside this
mini-app implementation. Existing generation scripts must still pass without
fabricated sample metadata.

## Model policy

Every shipped model object keeps its type but has empty `id`, `provider`, and
`name`. Image model `path` is also an empty string. Do this in source graphs and
generated app bundles. Do not copy hardcoded models from the older examples.
The app lets creators choose a language model capable of reading reference
images and an image-edit model for each paid image operation. Optional multiple
references require a provider/model that supports them. Do not silently discard
the second reference when a chosen provider cannot use it.

Generation is deliberately triggered, charged at provider rates, and cancellable.
The implementation must not select paid defaults for headless verification.
Use deterministic provider fakes for tests and clearly distinguish those results
from a real visual demonstration.

## Accessibility and mobile

Use native labelled inputs and buttons from existing widgets, a logical heading
order, visible focus, and explicit text for approved/original/revised states.
The wipe comparison is supplementary. Both complete images and labelled
downloads must be reachable without dragging. Verify the comparison's keyboard
path in the existing renderer and retain the stacked image fallback regardless.

At narrow browser widths, Columns must stack in source order without horizontal
scrolling. Check the brief, long direction text, comparison, and download actions
at 390px and 200% zoom. Reuse the existing mobile widget support, but do not claim
native mobile SVG editing. All AI and SVG rasterization work runs on a Node
backend. `SVGToImage` needs native sharp and does not run in an edge/browser-only
worker. Announce errors and active stage changes using existing feedback widgets.
Respect reduced motion and both Studio themes.

## Sol implementation workstreams

A6. Sol workflow implementation owns only the five new example graph JSON files,
their metadata entries, and a new focused test
`packages/base-nodes/tests/directed-campaign-kit.test.ts`. It implements and
tests direction parsing, contract capture, role ordering, deterministic
composition, record export/import, and preservation of the accepted source.
Use existing registered nodes. If a new runtime capability becomes necessary,
report the exact gap before broadening this workstream.

A7. Sol app implementation owns `scripts/example-apps/apps.mjs`, a new app
definition module if useful, the minimal generator support in
`scripts/build-example-apps.mjs`, the recipe manifest, generated app bundle and
preview files, and focused app wiring/state tests in an existing owning test
package. Extend the generator with an authored widget-tree option or equivalent
small declarative support for conditions, execution feedback, model controls,
ImageCompare, and Download. Preserve every other app's generated output.
Do not hand-edit the generated bundle as the only source of the new app.

A8. Sol shared Button implementation owns only
`web/src/components/appbuilder/puck/widgets.tsx` and focused renderer tests.
Reproduce the disabled-cancel defect before changing it. Respect the existing
native `disabled` prop and condition wrapper. Disable duplicate run actions
while their target runs, but leave an enabled cancel action operable during that
run. Derive behavior from existing run/cancel events, not a new schema property.
Preserve labels and accessible button semantics. Tests cover run, cancel, a
literal variable action, explicit disabled state, mixed events, keyboard
activation, and idle/running transitions. The native Button already forwards
`widget.disabled` to TouchableOpacity at
[mobile widgets.tsx:2582](../../mobile/src/components/app_runtime/widgets.tsx#L2582).
Check native parity without changing its schema. Headless app-debug continues
to dispatch existing events and honor conditions. A DOM test is mandatory
because headless simulation does not reproduce the web defect. Scope touched UI
migrations to repository standards. Do not add SetupFlow, OptionCards, PlanReview,
or a campaign-specific renderer.

A9. Integrator runs the generator after the three streams finish, reviews the visual
surface in the actual app renderer, runs the required checks, and verifies a
save/reopen cycle. Generator and metadata ownership stay separate. All streams
use the file names, IDs, and handoffs above. Existing generated files unrelated
to this app must not be reformatted or rewritten unnecessarily.

## Acceptance and verification

F1. The imported app starts in a useful empty state, names the required product
reference, and offers explicit model choices. It contains no machine-local
paths, paid model defaults, or silent automatic generation actions.

F2. Three validated written directions precede image generation. Choosing B
passes B's actual direction and the captured brief to the hero workflow.
Changing the draft cannot pair a stale direction with a new brief.

F3. Approving the hero produces 1080×1350 and 1080×1920 PNGs and self-contained
SVGs. Each SVG contains the exact approved headline and CTA as text. Both use
the same hero bytes and leave the complete product image visible.

F4. Revision reads the accepted hero. Its request records change, preserve, and
allowed response. Original image bytes, original layouts, and original contract
are unchanged after revision success, failure, cancellation, and layout retry.

F5. No accepted phase is emitted from partial work. A failed paid edit does not
erase an accepted image. A failed layout does not regenerate its paid source.
One completed revision removes the action that would create another.

F6. Campaign export/import restores the original and optional revision, their
formats, copy, and accepted version without any provider call. Malformed and
oversized records fail visibly. Restore is available only before work begins,
and validation precedes all output writes.

F7. The generated bundle passes real graph binding validation, all recipe steps
resolve, generator check mode reports no drift, and the shipped Product Launch
Kit retains its existing behavior.

F8. The app works with keyboard-only input, accessible comparison fallback,
narrow widths, both themes, and reduced motion. Capture the actual renderer,
using labelled fixture imagery for verification rather than claiming it is a
recorded AI campaign.

Run focused checks first. The graph tests should execute Code bodies and the
layout/restore paths with real node execution and fake provider boundaries.
Include malformed direction JSON, wrong reference role, missing product,
escaping/overflow cases, revision ancestry, export size failure, and portable
record restoration. State tests must drive button actions and fold real-shaped
completion/failure/cancellation events, not merely inspect a widget list.

```bash
npm run test --workspace=packages/base-nodes -- tests/directed-campaign-kit.test.ts tests/example-workflows-validation.test.ts
npm run test --workspace=packages/websocket -- tests/example-apps.test.ts tests/example-recipes.test.ts
npm run test --workspace=packages/agents -- tests/example-apps-regen.test.ts
node scripts/build-example-apps.mjs
node scripts/build-example-apps.mjs --check
npm run dev:nodetool -- app debug packages/base-nodes/nodetool/examples/apps/directed-campaign-kit.app.json --no-run --json
```

Run `nodetool validate` on each new graph after reading the validation entry in
[the harness reference](../harnesses.md). Empty model selections are expected in
shipped graphs. Any non-model validation error blocks completion. Exercise the
full app with injected deterministic providers and a scripted interaction
sequence. A live paid visual run is separate evidence and must use explicitly
chosen compatible models.

After implementation, the mandatory repository checks are:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

This design-only change requires checking its local links. It does not require
running code checks or changing AGENTS.md.
