# Tutorial focus and animation plan

Make each tutorial direct attention to the component being explained. The camera should arrive before an action, hold while the viewer reads or watches the result, and widen when the relationship between components matters.

This plan covers every tutorial registered in `demo/src/tutorials.ts`, `chatTutorials.ts`, `timelineTutorials.ts`, and `docTutorials.ts`, cross-checked against `web/src/components/tutorials/tutorialsData.ts`. It proposes implementation and editorial changes. No video changes have been implemented or visually verified by this plan.

## D1. Scope and starting point

The graph composition already uses `demo/src/camera.ts`. It frames nodes from their position and width, assumes a 1920×1080 frame, moves for 750 ms after a step begins, and pulls back at the end. It does not frame individual controls or account for node height. The other tutorial compositions render their players without a camera.

`TutorialShell` already owns title, step indicator, captions, and outro timing. Preserve that shared entry point. Cookbook and workflow-gallery compositions also use the graph tutorial, so preserve their existing focus behavior when introducing the new shot format. Their editorial redesign, the promo, and the landing-page hero are outside this tutorial rollout.

Use the real production components and existing synthetic casts. Reframe and retime their demonstrated behavior. Add cast actions only where they are necessary to demonstrate what the tutorial already promises.

## D2. Shared motion rules

| Code | Rule | Starting treatment |
| --- | --- | --- |
| M1 | Establish location | Hold the full surface for about 1 second before the first close-up. |
| M2 | Arrive before the action | Move for 500–750 ms, then settle for 200–300 ms before the relevant event. |
| M3 | Hold for comprehension | Keep framing fixed during typing, streaming, and result inspection. Allow at least 2 seconds for a short result, longer for code or multiple lines. |
| M4 | Fit the subject | Fit the complete target bounds inside the available picture area, with padding. Keep the label and immediate context visible. |
| M5 | Explain relationships | Frame both endpoints for connections and both the control and affected region when their relationship is the lesson. |
| M6 | Limit attention cues | Use one subtle outline or spotlight at a time. Fade it in after the camera settles and out before the next move. |
| M7 | Keep text stable | Captions and step indicators stay in screen coordinates. They do not scale or pan with the surface. |
| M8 | Close on evidence | Hold the completed image, answer, board, or test result before a short outro. Widen only if the wider view explains something. |

These are initial editing values, to be tuned on the pilot renders. Do not force every shot into the same duration. Avoid camera bounce, repeated pulses, continuous drifting, and zooming on every streamed token.

Prefer smooth easing without overshoot. For a long move between distant panels, briefly widen or use a short cut instead of sliding across a magnified interface. Do not animate the camera and the editor's own timeline zoom simultaneously.

Use a reading-budget check when authoring captions, initially allowing roughly 3 words per second plus a short settling interval. Shorten or split text that cannot fit. Extend the replay when the lesson needs more time. Preserve the result hold instead of using it to absorb an overlong caption.

## D3. Shot data and timing

Separate instructional steps from camera shots. One step can require several views, such as a connection's source, both handles, and its output. Do not create extra numbered steps solely to move the camera.

Each authored shot should declare:

| Field | Purpose |
| --- | --- |
| `id` | Stable name for inspection and frame exports. |
| `fromMs`, `toMs` | Presentation-time interval, relative to the replay. |
| `target` | Discriminated target: overview, node, component, or group. |
| `moveMs` | Transition duration within the interval. |
| `padding`, `maxZoom` | Framing limits, with shared defaults. |
| `emphasis` | Optional outline or dimmed surroundings. |
| `actionAtMs` | Optional alignment point for a demonstrated action. |

Keep a separate replay-time mapping for holds and compressed waiting. Camera, captions, cursor cues, and step labels use presentation time. Cast playback and its media use mapped cast time. Both must be pure functions of the requested frame, including backward seeks.

Begin with identity mapping. Add hold or speed segments only where a tutorial needs them. Do not shift assistant messages without their associated document patches. If timing affects a cast invariant, retime both tracks together and update its checks.

Existing `steps[].focus` and `zoom` remain supported when a composition has no explicit shots. Migrate the tutorial entries to shots without requiring cookbook or gallery edits.

## D4. Resolve component bounds reliably

Introduce stable focus identifiers through the demo surfaces. Prefer an existing semantic identifier, a component ref, or a narrow demo attribute over selectors based on text, styling classes, or DOM position.

Targets should resolve to rectangles in the untransformed surface coordinate system. A group resolves to the union of its member rectangles. Graph targets also retain graph coordinates so the existing controlled viewport can frame them without applying a second zoom.

Measure only after the frame's replay state, fonts, and required media are ready. Capture bounds at an authored shot anchor, then hold them through the shot to avoid chasing streaming text or growing cards. If content outgrows the view, author a deliberate scroll or another shot. Scrolled and virtualized targets must be mounted and brought into view before measurement.

The fixed-layout document, chat, and timeline surfaces should render at a known base size inside a clipped camera wrapper. Transform the wrapper without changing the layout size during zoom. Keep the caption and step layers outside it.

Use composition dimensions and reserved overlay rectangles to calculate the available picture area. Clamp zoom when a small control would otherwise become excessively large. Include the control's label in its focus target.

Missing targets should produce a visible diagnostic in Studio and fail final-render validation with tutorial, shot, target, and time. Validate that the checker resolves actual targets and deliberately test a nonexistent one.

## D5. Focus overlays and action cues

Render the highlight from the same transformed bounds as the camera. Use shared design tokens for its color, radius, and motion. A modest dimming layer should preserve the surrounding interface's location cues.

A cursor appears only for a represented pointer action. Its click pulse aligns with the state change. Assistant edits use a highlight on the changed component, without a cursor pretending to operate it manually.

Several existing casts start with populated inputs or connected graphs. Do not add typing or dragging decoration over an unchanged state. Either add a deterministic replay of the advertised interaction through the real surface or revise that beat to explain the existing state. In particular, the connection tutorial needs an explicit decision in A3 about showing graph construction.

## Tutorial shot plans

The sequences below describe the proposed edit in order. Durations are initial total-video targets, including a roughly 1–1.5 second introduction and 1.5–2 second closing card. They are not final event timestamps. During implementation, map each beat to the cast's actual events and lengthen the film if the content cannot be read at the proposed pace.

### T1. Build your first workflow (`first-workflow`)

Target length: 26–30 seconds.

Start wide with the full input → LLM → image → preview path. Frame the Text Input's value and label, then widen just enough to show its outgoing connection. Move to the LLM's generated text before streaming begins and hold through a short readable passage. Frame the image-generation node's status and preview area before generation completes. Finish on the completed image, then reveal the full connected workflow.

Add an explicit final preview shot. The existing step list ends on generation. Keep the provider/model title visible when it helps identify which node is running. Acceptance: viewers can identify the starting input, intermediate text, and final image without following a moving camera while reading.

### T2. Connect & run (`connect-run`)

Target length: 20–24 seconds.

Show the source value close up. Frame the source output handle and Uppercase input together. Show the connection being established only after adding a real replay action for it. Briefly frame the run control if the player exposes the genuine control and can demonstrate it. Hold on the Uppercase node's running-to-completed state, follow the second connection, and finish on `HELLO NODETOOL` in Preview.

The existing cast starts with nodes and edges already present and replays execution updates. Add the minimum graph-edit playback needed for its advertised construction lesson, or explicitly narrow the captions to tracing and running an existing graph. Do not imply that an edge activation is a drag interaction. Acceptance: source handle, destination handle, execution, and changed output are individually legible.

### T3. Generate a list (`list-generator`)

Target length: 22–26 seconds.

Frame the topic field. Show its connection to the list-generating node, then settle on the list as its first items arrive. Keep the camera stationary while items accumulate. Move once to Preview when the list is complete, using enough vertical space to show the output is a collection. End wide enough to show that Preview is downstream.

Choose a concise list that fits the close-up. If the cast's list overflows, add one deliberate scroll after a reading hold. Acceptance: the viewer can distinguish the input topic, individual generated items, and downstream list output.

### T4. Ask the AI (`ask-ai`)

Target length: 20–24 seconds.

Frame the question field, then show the question-to-LLM connection. Settle on the answer region before text starts appearing. Hold until a useful sentence is readable. Move to the completed Preview and finish with the LLM and Preview together.

Keep provider controls secondary because this lesson is about data flow. Acceptance: the completed answer stays readable before the closing card and the output's location is clear.

### T5. Combine two inputs (`combine-inputs`)

Target length: 22–26 seconds.

Open on both source nodes. Highlight the name and topic in sequence while keeping their framing stable. Show both connections entering the template node. Zoom into the template placeholders with their surrounding sentence. Move to the merged result and briefly highlight the substituted text. Close on the branch-and-merge layout.

Replace the first shot's single-node focus with a group target for both inputs. Acceptance: viewers can map each source value to its corresponding place in the finished sentence.

### T6. Summarize a document (`summarize-text`)

Target length: 22–26 seconds.

Frame the source field with enough visible text to establish that it is a long passage. Do not make the viewer read the whole source. Move to the summarizer's output region before streaming starts. Hold on the key points, then show the complete summary in Preview. End with source and summary visible together if both remain readable.

Avoid panning down the source merely to show volume. Acceptance: the final summary receives the longest reading hold and visibly differs in length from the input.

### T7. Describe an image (`describe-image`)

Target length: 22–26 seconds.

Open on the source image, framed without cropping its subject. Widen to show its connection into the Agent node. Move to the description area as text arrives. Finish with image and completed description together when the layout permits, otherwise hold each in consecutive shots.

Choose the description shot's bounds from the text region, rather than applying the image node's zoom to every node. Acceptance: viewers can compare the visible image subject with the words produced about it.

### T8. Ask the chat agent (`chat-agent-qa`)

Target length: 22–26 seconds.

Establish the whole chat panel. Frame the submitted question. Move to the web-search tool card before it changes state, showing the tool name and status. Hold through completion, then move to the answer and its source information where the cast provides it. Close with the question, completed tool call, and answer in context.

Extend the first caption's reading interval. If the composer interaction is not represented, describe the submitted question rather than showing a fake typing sequence. Scroll at shot boundaries so tool cards and messages do not slide underneath a fixed close-up. Acceptance: the viewer sees what the tool did and where the answer appears.

### T9. Cut a scene together (`timeline-trim-arrange`)

Target length: 30–36 seconds.

Establish preview, tracks, and inspector. Frame the opening clip as it is selected. Move to the inspector briefly to connect selection to settings. Return to the clip's right edge before its duration changes from eight to five seconds. Hold on the resulting gap and then the second clip landing at the five-second boundary. Frame the caption track as the caption is added. Widen and settle before the editor's own timeline zoom. End with playback showing the preview and relevant tracks together.

Give trimming its own beat, since it is a concrete cast event at 2200 ms that the existing steps do not isolate. A moving trim cursor requires a deterministic interaction track aligned to the actual duration change. Preserve the full playback interval. Acceptance: the trim, adjacency of clips, caption placement, and played result are all visible.

### T10. Edit a sketch by asking (`sketch-assistant`)

Target length: 26–30 seconds.

Open on canvas and assistant together. Frame the vignette request, then the relevant tool call. Move to the layers panel before the new layer appears. Keep its name and selection visible. Frame blend mode and opacity as their values change. Return to the canvas for a held final image, then briefly restore the complete editor.

Use shared framing for the before and after canvas views. Acceptance: viewers see that a new editable layer was added and understand which controls changed its appearance.

### T11. Write and voice a script (`script-assistant`)

Target length: 30–34 seconds.

Frame the request's length, speaker, and tone requirements. Move to the cast/speaker area as speakers appear. Frame the script lines with their speaker assignments. Hold on one line as its draft changes to a voiced take. Move to a second completed take only if it adds information. End on the populated script with speaker and take state visible.

Split the existing combined lines-and-voices beat. Show playback only if playable media is actually present and synchronized. Acceptance: speaker assignment, line text, and take availability can each be read.

### T12. Board a shot list (`storyboard-assistant`)

Target length: 32–38 seconds.

Frame the teaser brief, then widen to the board as planned shots arrive. Zoom into one shot's direction and camera description. Hold its planned state before moving to generation. Show that same card changing from pending to a completed still. Widen to include subsequent cards as they complete. End on the finished board.

Keep card positions stable across planned and ready states. Do not zoom individually into every still. Acceptance: the viewer sees direction written before rendering and can connect a planned shot to its generated image.

### T13. Write a JS script (`jsscript-assistant`)

Target length: 30–34 seconds.

Frame the requested input/output behavior. Move to the declared input and output ports. Show their names and types together. Frame the relevant code body with enough surrounding lines to understand its purpose. Move to the saved test's input and expected result, then hold on its completed status. Finish with ports and the successful test in context.

Split body and test into separate shots. Disable caret blinking or incidental scrolling through the demo's frame-driven mechanism. Acceptance: the ports, meaningful code excerpt, and verification result are readable at the app's video-player size.

### T14. Build a mini app (`app-assistant`)

Target length: 28–32 seconds.

Frame the request, then the assistant's workflow-binding tool result. Use the actual tool card for binding details because this cast renders `AppRuntimeView`, not a configuration inspector. Move to the topic input as it appears with its saved value. Show the button and output region arriving. End on the assembled app with its full input-to-output layout visible.

The cast builds the app but does not execute its bound workflow. Keep the closing shot about the assembled interface. Do not fabricate a generated headline or show a click that has no replayed result. Acceptance: the app's components and their roles are clear, and the camera never targets an editor panel that is not mounted.

### T15. Correct it without starting over (`sketch-correction`)

Target length: 30–34 seconds.

Frame the first request, then hold the strong wash on the canvas. Move to the correction message and allow time to read it. Frame the existing layer row and opacity control as the assistant adjusts them. Return to the canvas with precisely the same framing as before. Finish on a view that includes the unchanged layer stack and corrected image.

Use sequential before/after holds. Avoid a transition that obscures the actual visual change. Acceptance: viewers see the same layer being amended, a weaker effect, and no extra layer appearing.

### T16. It asks before it spends (`storyboard-ask`)

Target length: 28–32 seconds.

Frame the underspecified request. Move to the assistant's clarification question and keep it still long enough to read. Briefly widen to show that the board remains empty while the question is pending. Frame the answer, then move to the board as planned shots appear in the chosen format. Close on the planned state and unrendered cards.

Retain a visible waiting interval. Do not show a generation pulse or completion effect during the pause. Acceptance: the question precedes the answer, the board stays empty while waiting, and the final cards are visibly planned rather than rendered.

### T17. A test catches it (`jsscript-repair`)

Target length: 34–40 seconds.

Frame the suspected edge case. Move to the saved case before any code change. Hold the failing result with its NaN reason and a readable failure label. Frame the repaired code region without traversing the whole file. Return to the same saved cases for rerun and hold both successful results. Close with the retained cases and tool history in context.

Use the same camera framing for failure and success. Keep textual status alongside color. Acceptance: viewers can identify the original failure, the changed code, and the same cases passing afterward.

## Implementation sequence

| Code | Work | Dependencies | Reviewable output |
| --- | --- | --- | --- |
| A1 | Audit casts and target surfaces for T1–T17. Map each proposed shot to actual events, components, and scroll requirements. Record any missing demonstrated action. | None | Per-tutorial shot/event table and baseline contact sheets. |
| A2 | Add shot types, pure time mapping, bounds fitting, safe-area handling, and validation. Preserve legacy graph focus. | A1 | Deterministic camera tests and a Studio debug view showing target rectangles. |
| A3 | Build graph and fixed-layout camera adapters, target registration, and minimal action playback required by T2/T9. | A2 | T1 and T9 pilot renders, plus a T2 construction feasibility check. |
| A4 | Add frame-driven focus overlays and integrate captions, steps, and result holds. | A3 | Before/after pilots reviewed at full and embedded size. |
| A5 | Author and render T1–T7. | A4 | Complete graph tutorial set with readable connection and result shots. |
| A6 | Author and render T8–T14, including assistant-to-document moves. | A4 | Chat, timeline, and document tutorials with resolved component targets. |
| A7 | Author and render T15–T17. | A6 | Correction, clarification, and repair sequences preserving their causal order. |
| A8 | Verify every render, refresh posters and durations, and stage the complete asset set. | A5–A7 | Validated MP4s, matching posters, and catalog metadata. |

Keep implementation changes focused on the tutorial system and the demo surfaces needed to expose targets. Read applicable component overlays and design rules before touching production UI files. Shared component edits must follow the repository's primitives and token rules.

## File ownership

| Area | Expected changes |
| --- | --- |
| `demo/src/types.ts` or a focused sibling | Shot and target types independent of `StepIndicator`. |
| `demo/src/camera.ts` | Bounds-aware framing, dimension inputs, timeline validation, and legacy adaptation. |
| `demo/src/tutorialTiming.ts` | Presentation-to-cast time mapping and duration calculation. |
| `demo/src/components/TutorialShell.tsx` | Camera surface slot, fixed overlays, and explicit time delivery. |
| `demo/src/components/` | Focus overlay and optional pointer cue driven by frame time. |
| `demo/src/{Tutorial,ChatTutorial,TimelineTutorial,DocTutorial}.tsx` | Connect each player to its camera adapter. |
| `demo/src/{tutorials,chatTutorials,timelineTutorials,docTutorials}.ts` | Shot plans, revised captions, and timing for the full catalog. |
| `web/src/demo/` | Target exposure, deterministic scroll/action playback where required, and retimed casts. |
| `demo/package.json` and render scripts | Explicit complete-catalog rendering and revised poster frame selection. |
| `web/src/components/tutorials/tutorialsData.ts` | Duration labels matching the produced files. |
| `docs/assets/tutorials/` and `web/public/tutorials/` | Rendered videos and synchronized posters. |

## Verification and delivery

| Code | Check | Passing evidence |
| --- | --- | --- |
| V1 | Framing geometry | Tests cover tall nodes, small controls, groups, edge targets, overlay exclusions, and composition dimensions. |
| V2 | Time boundaries | Tests cover first/last frame, short replay windows, overlapping or unordered shots, holds, and backward seeking. Key times remain strictly ordered. |
| V3 | Target coverage | Every authored target resolves at its shot anchor. A deliberately invalid identifier fails validation. The audit asserts it inspected tutorials and shots. |
| V4 | Determinism | Selected frames match when rendered sequentially and sought directly, including streaming, scroll, and media readiness. |
| V5 | Visual review | Contact sheets show each shot's settled frame and result. Every video is watched for transitions and reviewed at the actual embedded-player size. |
| V6 | Lesson fidelity | Each action cue matches a represented event. Correction preserves the layer, clarification precedes planning, and failure precedes repair. |
| V7 | Shared consumers | Representative cookbook and gallery renders retain their legacy framing when no shots are authored. |
| V8 | Repository checks | Run `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main` after implementation. Resolve failures before declaring completion. |
| V9 | Asset delivery | Each catalog video and poster exists, duration labels match encoded duration, and app posters match the docs copies. |

Before final encoding, export inspection frames at transition start, midpoint, settlement, action, and result. Check that text remains legible, targets do not clip, highlights track the target, and overlays do not cover controls. Watch full renders to catch uncomfortable movement that still frames cannot reveal.

Use the existing renderer groups for graph, chat, timeline, documents, and steering tutorials. `render:tutorials` alone only invokes the graph group. A complete-catalog render command should enumerate the tutorial registries and preserve the special chat and timeline output filenames. Choose poster frames from settled result shots after retiming, rather than retaining the old numeric frame offsets.

Render final videos into `docs/assets/tutorials/`, regenerate JPGs there, then run `npm run sync:posters` from `demo/`. Update displayed durations from the encoded files. Keep MP4s out of the app bundle. Publishing is a separate deployment action after the implementation and assets are ready.

## Risks to resolve in the pilots

| Code | Risk | Planned response |
| --- | --- | --- |
| R1 | Streaming or lazy layout causes camera jitter | Measure after readiness, freeze framing for the hold, and use authored scroll boundaries. |
| R2 | Zoom makes captions readable but leaves product text too small | Inspect at embedded size and tighten the target or split the shot. |
| R3 | Extra movement makes tutorials harder to follow | Keep M3 reading holds and remove any move that teaches nothing. |
| R4 | Retiming breaks assistant/document causality | Use one mapped cast clock for both tracks and retain cast invariant checks. |
| R5 | Existing casts do not contain the advertised interaction | Resolve it explicitly in A1/A3 through minimal action playback or precise captions. |
| R6 | Camera changes alter cookbook and gallery output | Preserve the legacy path and verify representative existing compositions before rollout. |

Completion requires T1–T17 to have authored shots, resolved targets, reviewed renders, synchronized posters, accurate durations, and passing implementation checks. An animation framework alone does not complete this plan.
