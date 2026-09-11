# Marketing recipes: asset production master plan

## M1. Assignment and boundary

Produce the complete asset packages needed to redesign the four marketing recipe pages around NodeTool's guided flows and editable documents. This plan governs asset production. Page design, React implementation, metadata changes, publishing, and replacing existing samples happen after the asset gate in M12.

The instruction that created these plans authorized writing the plans. It did not start production or authorize provider spend. A later execution instruction determines the production authorization and spending limit. Do not treat a hypothetical budget in a plan as an approved budget.

The intended execution model is one Sol agent per recipe, with a coordinating agent reviewing shared requirements. Use `gpt-5.6-sol` when creating the requested execution tasks. Do not spawn those tasks merely because these files exist.

| ID | Recipe plan | Primary surface | Production responsibility |
| --- | --- | --- | --- |
| D1 | [Product ad variants](viral-video-ad-engine.md) | Storyboard, Commercial | Vertical ad, hook variants, thumbnails, narrated script, guided-flow demonstration |
| D2 | [Multilingual video](multilingual-video-dubber.md) | Script | Source presenter clip, translated script, voices, subtitles, dubbed versions, guided-flow demonstration |
| D3 | [Product catalogue assets](ecommerce-sku-visual-factory.md) | Storyboard, Commercial | Shared product reference, cutout, scene treatments, motion clip, print master, listing copy, guided-flow demonstration |
| D4 | [Storyboard to Trailer](storyboard-to-trailer.md) | Storyboard | Character and location references, screenplay, voiced lines, shots, score, trailer, guided-flow demonstration |

Keep the existing recipe slugs as identifiers. The display names above describe the proposed page direction and do not authorize route changes.

## M2. Read before executing

Read the root `AGENTS.md`, `docs/DEVELOPMENT_STANDARDS.md`, `docs/WRITING_STYLE.md`, `docs/BRAND.md`, this master plan, and the assigned recipe plan. Read directory overlays before changing source code in that directory.

For production, read `.claude/skills/storyboard-core/SKILL.md` and `.claude/skills/storyboard-core/references/tool-contract.md`. Each recipe names its additional skills. Use the callable tool schemas and checked-out implementation to resolve contract drift. Do not copy an obsolete model ID or a stale tool signature out of prose.

Use NodeTool to create the work being demonstrated. A generated image from a different service may be an explicitly disclosed source reference, but cannot serve as proof that a NodeTool flow generated that image. Source preparation and the recipe's resulting work must be distinguishable in the manifest.

Do not author, import, or display node graphs to produce these examples. Use guided setup, direct storyboard/script/timeline/sketch operations, and agent media tools. Encoding, probing files, making contact sheets, and packaging deliverables with ordinary local tools are permitted support operations.

## M3. Execution order and ownership

| ID | Work | Dependencies | Completion evidence |
| --- | --- | --- | --- |
| M3.1 | Coordinator creates a run ID, checks available NodeTool tools and connected providers, and records the execution authorization | None | Run directory and authorization record |
| M3.2 | D3 creates and reviews the shared product reference package | M3.1 | Product reference, descriptor, entity export, provenance, checksums |
| M3.3 | D4 validates the Storyboard capture sequence while producing its own assets | M3.1 | Real setup screenshots and capture procedure |
| M3.4 | D2 produces its independent source and language assets | M3.1 | Its recipe package |
| M3.5 | D1 produces ads using D3's accepted product reference | M3.2 | Its recipe package |
| M3.6 | D3 completes its product assets | M3.2 | Its recipe package |
| M3.7 | Coordinator reviews the four handoffs and resolves missing evidence | M3.3–M3.6 | Acceptance or a specific list of remaining assets |
| M3.8 | Marketing page implementation is commissioned separately | M3.7 and user direction | New page-build task consuming these assets |

D3 owns the shared product reference. D1 consumes it without changing it. D2 and D4 have no dependency on the product and can proceed independently.

Each agent owns its recipe directory, project, documents, and output files. Do not edit another recipe's files, shared page data, or the existing recipe generator. If an agent needs a change to the common contract, send it to the coordinator.

Only one agent may drive a shared browser tab or foreground app at a time. Separate NodeTool projects do not isolate a shared tab's focus. Coordinate a capture window, or use separate browser sessions. Do not race UI actions. Headless operations must carry explicit document IDs and stay inside the assigned project.

## M4. Recheck the flows before filming

The source inspection that informed these plans found the following paths. Recheck them on the execution revision and record differences rather than silently editing the story to fit.

| ID | Flow | Real screens | Landing |
| --- | --- | --- | --- |
| F1 | Storyboard | Idea, Story selection, Story review, Entities, Look | Board with stills queued |
| F2 | Script | Idea, Format selection, Format review, Voices | Script editor with speech queued |
| F3 | Video | Idea, Beats selection, Beats review, Look | Timeline with text-generated video and optional speech |
| F4 | Image | Idea, Brief selection, Brief review, Look | Text-generated variations and sketch editor |

Sources: `web/src/components/setup/storyboard/useStoryboardSetupFlow.ts`, `web/src/components/setup/script/useScriptSetupFlow.ts`, `web/src/components/setup/video/useVideoSetupFlow.ts`, `web/src/components/setup/image/useImageSetupFlow.ts`, and `web/src/components/setup/SetupFlow.tsx`.

Story selection and review share one visible stepper label. The Storyboard progress bar is **Idea / Story / Entities / Look**. Script uses **Idea / Format / Voices**. Capture both selection and review screens even though they share a progress step.

| ID | Boundary to verify | Consequence for the assets |
| --- | --- | --- |
| F5 | Storyboard setup generates stills, not a complete movie | Show Render clips and Assemble timeline as editor actions after setup |
| F6 | Imported Script words are preserved | Translation must happen separately before the translated import. The Voices language selector is not a translation command |
| F7 | Generic Image generation uses text-to-image bindings | Do not advertise preservation of a real SKU through that path |
| F8 | Image's Image to video handoff opens a workflow canvas | Do not use it in these recipes |
| F9 | Generic Video generation uses text-to-video bindings | Product reference-conditioned production belongs on Storyboard here |
| F10 | Video setup's Music control was disabled | Generate or add music through a supported finishing surface. Do not film a working toggle unless it actually works on the execution revision |
| F11 | Studio and workspace have different handoffs | Pick one edition for each demonstration and record it. Do not splice buttons from different editions into one supposed session |
| F12 | Storyboard's composer carries entity IDs but not arbitrary reference attachments into setup | Add new product/character photos in Entities, or pre-create entities and select them. Do not film a dropped photo silently becoming an entity |

These are product constraints to respect, not authorization to fix the app. A required unsupported operation gets a blocker entry with the exact failed surface, input, and missing capability. Finish independent assets and report the remaining gap. Never replace it with a graph or a fabricated screen.

## M5. Creative defaults and shared product

Use the briefs in the recipe plans without another creative interview unless an execution instruction supplies a different subject. These are original demonstration projects, not client work or endorsements.

D3 produces an unbranded **Olive Travel Cup** for both D3 and D1: a matte muted-olive cylindrical travel cup, slightly tapered toward the base, with a charcoal flat lid and a small rectangular drinking opening. No handle, lettering, logo, measurement marks, badges, or decorations. The reference image is the visual authority. This is a fictional demonstration object. Do not invent capacity, insulation performance, materials certification, pricing, or availability.

Keep the product shape readable and consistent. D1 uses a warm kitchen/daylight treatment. D3 uses clean commercial light with one seasonal variation. Their grades may differ, but the cup and lid cannot become different objects.

D2 uses a synthetic adult presenter and a short English explanation translated into Spanish. D4 uses the original fictional film **The Next Tide**. Each plan gives its exact source text and visual direction.

## M6. Output directories and durable sources

Create a new run directory under `marketing/recipe-assets/<run-id>/`. A run ID is a short unique name chosen at execution, such as a date plus descriptive suffix. Keep all raw assets out of `marketing/public/` until the page-build phase chooses the delivery assets.

```text
marketing/recipe-assets/<run-id>/
  run.json
  shared/product/
  viral-video-ad-engine/
  multilingual-video-dubber/
  ecommerce-sku-visual-factory/
  storyboard-to-trailer/
```

Each recipe directory uses this structure:

```text
<slug>/
  sources/             original imports and synthetic source media
  documents/           exported entities, scripts, boards, timelines, shot map
  generation/          original model outputs and generation ledger
  selects/             chosen full-quality takes, with stable names
  masters/             full-quality finished videos, audio and images
  web/                 delivery encodes, posters, still derivatives
  captures/raw/        original screenshots and uncut screen recordings
  captures/steps/      cleaned crops and compressed screenshot derivatives
  captures/walkthrough/ edited demonstration and poster
  evidence/            probes, comparison sheets, validation output
  asset-manifest.json
  capture-log.json
  handoff.md
  qa.md
```

Existing files under `marketing/public/recipes/samples/` belong to the old process. They can be inspected for context but must not be overwritten, relabeled as a new run, or cited as proof of the new flow.

Store production documents in a dedicated NodeTool project named `Marketing recipes / <slug> / <run-id>`. Export the documents as well as recording server IDs. A server ID or expiring signed URL alone is not a durable handoff. Download the underlying bytes and checksum them. Keep secrets and signed query parameters out of committed manifests.

Do not automatically commit raw binaries, push, upload to a CDN, or deploy. Keep the completed directory available locally and report its absolute path. If files exceed practical repository storage limits, the coordinator chooses a durable artifact destination before removing any local copy.

## M7. Model selection, authorization, and iteration

Before generating, discover callable NodeTool tools and actual connected models. Record the exact provider/model IDs and needed capabilities. Product and character stills must use an image model that accepts the reference images, not merely an unrelated model whose name sounds suitable.

Prepare all authorized non-spending work first: source inventory, text, shot plan, project organization, model lookup, and a list of generation calls. Read the actual UI estimate where available and record it as an estimate. If no estimator covers the operation, report quantities and mark cost unknown. Read actual spend after each generation phase where the environment supports it.

Honor the execution instruction's existing authorization. If it explicitly approves the complete production and a spending envelope, proceed within it without repeatedly asking for the same permission. If authorization stops at a phase boundary, present the concrete references or stills for the next decision. The storyboard skills require review between direction, stills, and clips unless the user's instruction overrides that wait. Quote and link the applicable skill if it causes a pause.

| ID | Review point | Check before continuing |
| --- | --- | --- |
| G1 | Source and plan | Subject, references, entity assignments, exact words, shot order, chosen models |
| G2 | Stills | Identity, geometry, scene continuity, framing, readable UI captures |
| G3 | Speech and clips | Pronunciation, semantic accuracy, motion, lip sync where applicable, measured duration |
| G4 | Final exports | Editable project matches the exported bytes, audio mix, delivery encodes, manifest completeness |

Plan one initial generation per required source/still/clip and reserve at most two targeted retries for an unsatisfactory asset. This is an iteration ceiling, not spending authorization. Stop earlier if the authorized budget is reached. Each retry needs a stated defect and a changed instruction. Do not rerender a whole board to fix one shot or silently change a model midway through the set.

Keep selected takes explicit. Read current tool support for take selection. Where only the takes gallery can select an older version, select it through that UI and verify the resulting state. Do not claim a previous take is active because its asset ID was copied into notes.

On a resumed run, read the existing manifest and NodeTool documents first. Reconcile pending job IDs with their actual state before submitting another generation. A timeout is not evidence that a provider job failed. Reuse accepted files by hash, preserve their source IDs, and generate only missing or rejected assets. Save the ledger after each completed batch so another Sol session can resume without repeating paid work.

## M8. Actual production and captured experience

Create a real project by following the guided flow for the core demonstrated work. Capture selection screens, reviewed text, references, and the generation handoff during that process. Agent tools can refine the real documents and do finishing work. Record those interventions as agent/editor work.

One content set must connect the whole demonstration: the same brief, product or cast, shot order, script, selected stills, rendered clips, and final timeline. A beautiful output from a different board is not an acceptable final frame for the walkthrough.

Generation waits may be cut from the edited recording. Record the cut in the capture log and mark the sequence `time-compressed`. Do not add a stopwatch, elapsed-time claim, or an impression of instant rendering.

The demo system in `demo/README.md` can render real document components from recorded state. Use it only when a clean replay is needed and the required surface is supported. A replay must use exported documents and real generated media from this run, be labeled `ui-replay`, and be separate from the raw recording. Do not invent tool success, cost totals, progress, UI buttons, or output provenance. Extending the demo system or changing product code is a separate scoped task unless explicitly authorized.

Prefer existing dedicated capture tools. If computer use is needed, use the available approved computer-use surface. Do not work around a blocked browser extension by injecting code or controlling the user's browser through another mechanism. A capture blocker does not stop independent headless asset production.

## M9. Capture and delivery specifications

| ID | Asset | Specification |
| --- | --- | --- |
| E1 | Raw screenshots | PNG, full application content viewport, target 1600×1000 or larger, browser zoom 100%. Record actual viewport and pixel ratio |
| E2 | Step screenshots | Lossless source crop plus WebP derivatives at 1600 and 960 pixels wide when the source supports them. Preserve complete relevant controls and step labels |
| E3 | Walkthrough | 35–60 seconds, 16:9, 1920×1080 where capture resolution supports it, 30 fps. Show the actual setup stages and a short finishing sequence |
| E4 | Walkthrough audio | Silent by default. Supply accurate WebVTT captions for step explanations and a clean poster. Any added narration must also exist as a script and audio source |
| E5 | Finished videos | High-quality master, H.264 MP4 with yuv420p and faststart, VP9 WebM, WebP poster. Preserve the recipe's native aspect ratio |
| E6 | Audio | Original provider output plus WAV at 48 kHz for editing where conversion is needed. Keep voice and music stems separate |
| E7 | Finished stills | Original resolution PNG or lossless original, WebP at full delivery size and 960 px wide, with alpha retained where required |
| E8 | Recipe card | 1600×900 WebP using the real finished work. For portrait ads, use an intentional two/three-frame composition or contain the frame. Do not crop away the product or subtitle |
| E9 | Social preview | 1200×630 image from the accepted assets, with room for page text to be added later. Do not bake a speculative page design into it |
| E10 | Comparison sheet | Legible labeled before/after or selected-take contact sheet. Labels are ordinary layout text, not generated pixels inside the footage |

Do not upscale low-resolution screenshots to meet a nominal size. Record the actual size and explain any exception. Preserve original generation dimensions, native frame rate, and duration in the manifest even if a delivery encode changes them.

For speech-led video, target approximately -16 LUFS integrated and true peak at or below -1 dBTP in the web delivery. Measure rather than assert. Keep music below intelligible speech. For silent loops, remove the audio track and mark `hasAudio: false`. Do not autoplay a sound-bearing file in later page work.

Optimize encodes through a visual comparison against the master. Suggested review targets are below 8 MB for a short portrait ad and below 15 MB for a 40-second trailer or walkthrough. They are delivery targets, not reasons to accept visibly damaged gradients, unreadable UI, or distorted speech. Report an exception instead of silently degrading the asset.

Title cards, offer text, language labels, and captions must remain editable timeline or composition text. Use a bundled font supported by the actual timeline renderer. Do not ask a video model to draw exact marketing text.

### M9.1. Local encoding reference

Use an installed trusted `ffmpeg`/`ffprobe` or the existing project media tooling. Verify the executable before planning a conversion. Do not install a new binary merely to follow an example command. The following commands illustrate the delivery settings for an already finished master, with paths relative to a recipe directory. Use a versioned destination when an accepted file already exists.

Probe each master and delivery independently:

```bash
ffprobe -v error -show_format -show_streams -of json masters/final.mp4
```

Encode H.264 while preserving the master's dimensions, frame rate and audio presence:

```bash
ffmpeg -i masters/final.mp4 -map 0:v:0 -map '0:a:0?' \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart web/final.mp4
```

Encode a WebM sibling:

```bash
ffmpeg -i masters/final.mp4 -map 0:v:0 -map '0:a:0?' \
  -c:v libvpx-vp9 -crf 30 -b:v 0 -row-mt 1 \
  -c:a libopus -b:a 128k web/final.webm
```

For a silent delivery, omit the audio map and use `-an`. These commands do not mix or normalize speech. Finish and measure the audio in the master first. Adjust compression after visual inspection and retain the exact successful command in the derivative's provenance. Avoid overwriting a source through an input/output path mistake.

Extract the poster at a deliberately selected, verified moment rather than automatically using a black first frame. Record its source video and timestamp. A thumbnail crop or contact sheet is a deterministic derivative and must retain its source mapping. If a transform stretches a portrait image into a wide card, reject it and use containment or a composed layout instead.

## M10. Manifest and handoff contract

The coordinator owns `run.json`. It records run ID, repository commit, app build/edition, NodeTool project host, assigned agents, execution authorization, spending envelope or absence of one, and the shared product revision. Do not put keys or personal account details in it.

Each `asset-manifest.json` contains `schemaVersion: 1`, `runId`, `recipeSlug`, `status`, `documents`, `assets`, `generationCalls`, `blockedItems`, and `supportedClaims`.

| ID | Record | Required fields |
| --- | --- | --- |
| M10.1 | Document | Stable role, document type, server ID, project ID, export path, SHA-256, linked document IDs |
| M10.2 | Asset | Stable ID, role, relative path, SHA-256, MIME type, width/height where applicable, duration/fps where applicable, bytes, `hasAudio`, alpha status, source IDs, producing document and shot/line IDs |
| M10.3 | Generation call | Call/job ID, tool name, provider/model, input asset IDs, prompt file, generation settings, output IDs, actual cost/currency or null, attempt number, failure reason if any |
| M10.4 | Provenance | `user-supplied`, `generated-in-nodetool`, `generated-source`, `derived`, `live-ui-capture`, or `ui-replay`. Derived assets list their parents and transformation |
| M10.5 | Review | Criterion, reviewer, result, evidence path, selected take ID, whether user acceptance is recorded or still pending |
| M10.6 | Blocker | Required asset ID, attempted operation, observed limitation/error, available partial result, exact next action needed |
| M10.7 | Supported claim | Proposed factual wording, evidence IDs, limitation, whether safe to use in page copy |

Use null for unknown facts and explain them. Do not substitute a zero cost for unavailable cost data. Do not mark a reference synthetic merely because it was found in an old sample folder. Trace its actual origin or treat the origin as unknown.

`capture-log.json` records each capture ID, recipe action ID, visible screen label, project/document IDs, app revision, viewport, capture mode, raw path, edited path, chronological order, and any time compression or redaction. Preserve the raw original separately.

`handoff.md` must give the absolute package path, the accepted hero candidate, all playable previews, document links/IDs, asset-role map, screenshot order, exact captions/alt text suggestions, generation totals, known limitations, and supported page claims. Explain how to reopen the project and which selected takes the timeline uses. Keep the next page agent from having to infer these from filenames.

`qa.md` records results against M11 and the recipe-specific checks. Do not fill it with unchecked boilerplate and call the package ready.

## M11. Verification

| ID | Check | Evidence to retain |
| --- | --- | --- |
| V1 | Every required deliverable exists and decodes | File inventory, MIME/probe output, dimensions, durations, hashes |
| V2 | The final picture belongs to the demonstrated project | Document exports, shot-to-asset map, selected-take map, timeline provenance |
| V3 | The UI sequence follows the actual flow | Raw captures of every required screen and the capture log |
| V4 | The whole film plays correctly | Watch every second at normal speed, inspect transitions, first/last frames, and listen with headphones |
| V5 | Still detail survives inspection | Inspect product geometry, faces, hands, reference continuity, alpha edges, and text at full size |
| V6 | Spoken text and subtitles agree | Final transcripts, reviewed script, cue timing checks, pronunciation/meaning notes |
| V7 | Editable documents remain usable | Reopen from the recorded IDs or exported copies, verify links, run the available timeline validation, check missing media |
| V8 | Page-use derivatives retain quality | Side-by-side master/encode inspection, no distorted aspect ratios, no missing audio metadata |
| V9 | Claims are supported | Each proposed claim maps to actual assets and observed behavior. No speed, identity, cost, or language claims inferred from a still |
| V10 | No graph appears in the user path | Inspect the full walkthrough and every screenshot, including finishing actions |

Probe files with the available media inspection tools or `ffprobe`. Download or open the actual bytes when checking a URI. A job marked complete is not evidence that a file is playable.

No application-code changes are requested in this phase. If an explicitly authorized capture change modifies code, read the relevant overlays and run the repository's four mandatory checks: `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main`. An asset-only export does not require running all application tests.

## M12. Asset gate and later page work

A recipe may be marked `ready-for-review` when all required files exist, pass technical checks, and have complete provenance. Mark `accepted` only when the coordinator/user acceptance required by the execution instruction has been recorded. Use `partial` for packages missing a required production or capture result. An optional variant may be omitted only when the recipe plan says it is optional.

Do not start page implementation until the user has accepted the asset packages and any reduced outcome caused by a capability gap. A folder of generated clips without guided-flow captures is not a completed asset package.

After acceptance, a separate page task will consume the manifests and build the recipe detail pages, recipe index, and homepage recipe cards. It will address the old workflow-derived data contract in `marketing/src/data/recipes.ts` and `marketing/scripts/generate-recipes.mjs`, preserve slugs, and use the accepted captions and supported claims. This plan does not authorize those changes now.

## M13. Dispatch template

Use this as the message to each separately requested Sol task. Fill the variables before sending it.

```text
Execute asset production for <recipe name> from the repository root.

Read docs/plans/marketing-recipes/MASTERPLAN.md and
docs/plans/marketing-recipes/<recipe slug>.md completely. Produce the required
assets, real editable NodeTool documents, guided-flow captures, manifests,
verification evidence, and handoff. Do not build or publish marketing pages.
Use guided flows and direct document/agent operations. Do not create or show
node graphs. Own only your recipe directory and project.

Run ID: <run ID>
Output root: <absolute run directory>
Shared product package: <accepted path/revision, or not applicable>
Execution authorization and spend limit: <actual user authorization>
Capture window/session: <coordinator assignment>

Resolve routine creative choices using the plan. Reuse accepted assets and
finish independent work when a capability is missing. Report a specific
blocker instead of inventing a screen, a successful generation, or a cost.
Stop at the asset handoff and report its path, previews, checks, and any
unaccepted or missing required deliverables.
```
