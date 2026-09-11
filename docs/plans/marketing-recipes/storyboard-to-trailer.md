# D4. Storyboard to Trailer: asset production plan

## TR0. Assignment

Read [MASTERPLAN.md](MASTERPLAN.md) first. Produce the asset package for `storyboard-to-trailer` when dispatched. Use the actual Storyboard guided flow to create the project, then finish through the script, storyboard and timeline editors. Do not create a node graph or modify the marketing pages.

Produce an original 40-second mystery trailer titled **The Next Tide**, with six generated shots, recurring character/location entities, a linked editable script, three voiced lines, an original score, finished exports, posters, and complete guided-flow captures.

Read `.claude/skills/short-film/SKILL.md` and `.claude/skills/script-video/SKILL.md` after storyboard-core. Follow the actual guide's ordering for the recorded production. The screenplay review precedes Entities. Do not skip that visible stage because reference assets were prepared earlier.

Owner directory: `<run-root>/storyboard-to-trailer/`. This recipe is independent of the other production tasks and is the first pilot for the common Storyboard capture procedure.

## TR1. Fixed creative brief

Logline: A lighthouse keeper finds a message in a bottle dated forty years in the future, written in her own handwriting.

The trailer is a quiet mystery. It should suggest a specific story through a small number of clear images. No monster reveal, disaster footage, frantic montage, or generic action sequence. There is one visible adult character and one coastal location with an interior. Speech is voiceover, so none of the selected shots requires lip sync.

Production brief for the Idea screen:

```text
The Next Tide: a 40-second mystery trailer. A lighthouse keeper finds a message
in a bottle dated forty years in the future, written in her own handwriting.
Six shots: establish the coast, discover the bottle, examine the letter,
watch the keeper's reaction, return to the lighthouse beam, end close on her
recognition. Blue-hour sea light and a warm practical lamp inside. One keeper,
one lighthouse. Quiet, restrained, photographic. Three voiceover lines:
"The tide brought it in." "The date is forty years from now."
"And the handwriting is mine." No generated on-screen text.
```

Select **Mystery** and **6 shots** in Story choices. The Director may draft a different structure. Review it in the real UI and edit it toward TR4. Record the draft and final reviewed version rather than pretending the Director generated this exact plan unchanged.

Board style:

```text
Restrained photographic coastal mystery at blue hour. Cold blue-gray sea and
sky, weathered stone, damp surfaces with believable reflections, warm amber
practical light only in the keeper's room. Natural skin detail, moderate
contrast, fine film grain, no fantasy glow, no exaggerated teal-orange grade.
Camera movements are slow and deliberate. No generated lettering, titles,
logos or subtitles. Lighthouse architecture, keeper identity and wardrobe
remain consistent across shots.
```

Final format: 1920×1080, 24 fps, 40 seconds including a two-second title card. These are final edit specifications. Record the native provider output dimensions, lengths and frame rates separately.

## TR2. Entity package

Generate source references only after reviewing authorization. Prepare them before the recorded Entities screen if needed, but select them visibly at that stage. If references already exist and the execution instruction authorizes reuse, inspect their provenance and suitability before creating anything new.

| Entity ID | Name / kind | Reference direction | Assignment |
| --- | --- | --- | --- |
| TR-E1 | `Elin` / character | Original woman around forty, short dark hair with a few gray strands, lightly freckled face, calm direct expression, neutral soft daylight casting portrait. No resemblance request for a real person | TR-S2, TR-S4, TR-S6 |
| TR-E2 | `North Point Lighthouse` / location | Modest cylindrical weathered white lighthouse on a low rugged headland, dark lantern roof, a small keeper's cottage beside it, blue-gray sea and a narrow stone path. Consistent building proportions | TR-S1, TR-S2, TR-S5 |
| TR-E3 | `Keeper's Room` / location | Small stone-walled room with a weathered wooden table, a simple amber-shaded lamp on the left, one small window showing blue twilight, restrained maritime details without text | TR-S3, TR-S4, TR-S6 |
| TR-E4 | `Message Bottle` / prop | Small clear weathered glass bottle, simple cork, folded cream paper inside, no label or embossed brand mark, photographed against a neutral background | TR-S2, TR-S3 |

For Elin, keep the canonical descriptor about face, hair and build. Wardrobe is fixed in shot text: a dark navy wool sweater under a faded mustard raincoat, no hat, scarf or visible logos. Use the same wardrobe wording whenever she appears. Do not invent alternate outfits or wet/dry identity changes.

Use an explicit entity list on every shot. The exterior location must not automatically apply to the interior shots. The bottle must not appear in the final close-up unless the shot asks for it. Save one accepted visual reference per entity plus its full entity export and descriptor.

Reference acceptance checks: recognizably original adult face, consistent lighthouse silhouette, usable room geometry and a simple bottle without implausible glass or paper. Generate at useful inspection resolution, preferably at least 1536 px on the long edge when the model supports it. Do not present a collage of alternate character candidates as a single accepted entity.

## TR3. Script and voice

Use a single speaker, `Elin`, delivering the lines quietly as voiceover. The pictures should not show her mouth forming these words. Choose an actual available English voice with a natural, measured delivery. Keep a small amount of breath and pause without turning the lines into a theatrical whisper.

| Line ID | Text | Intended placement | Direction |
| --- | --- | --- | --- |
| TR-L1 | The tide brought it in. | Over the discovery, approximately 7–10 s | Matter-of-fact, just beginning to question it |
| TR-L2 | The date is forty years from now. | Over the letter, approximately 14–18 s | Slower on “forty years,” with controlled uncertainty |
| TR-L3 | And the handwriting is mine. | Over the final close-up, approximately 33–37 s | Quiet recognition, a short pause before “mine” if natural |

These windows are editorial targets. Voice the lines, measure the actual takes, and place them without cutting a word or forcing unnatural speed. Keep the lines as editable script resources with a stable mapping to the shots. If the Studio host already creates a linked script on Story review, use it instead of creating a duplicate. In the workspace, use the real Extract script action if the board is unlinked.

The final on-screen title is `THE NEXT TIDE`. The two-second end card contains that title only. Do not invent a release date, distributor, award badge, review quote, or streaming-platform logo.

Do not ask a model to draw the letter's exact date or readable handwriting. The voice establishes the date. The letter image may show plausible marks, but any exact text necessary to the scene must be authored as editable text through a supported editor and recorded as a finishing operation. No claim about accurate generated handwriting belongs on the page.

## TR4. Shot and final edit plan

Use keyframe mode for all six shots. The stills carry the chosen look. Each motion instruction contains physical events rather than an abstract emotional label.

| Shot ID | Final edit slot | Action for the still | Motion | Entities |
| --- | --- | --- | --- | --- |
| TR-S1 | 0–6 s | Wide view of North Point Lighthouse from the stone path at blue hour. Lighthouse on the left third, gray sea behind it, keeper's cottage visible, one warm window. No people, signs or lettering | Slow 20 cm push along the path. Sea moves gently. The building stays rigid and the beacon rotates slowly without changing architecture | TR-E2 |
| TR-S2 | 6–12 s | Medium view from behind Elin at the edge of the headland. She wears the navy sweater and faded mustard raincoat. Message Bottle rests on wet stone near her. Lighthouse is recognizable but distant. Hands positioned naturally and not obscuring the bottle | Elin bends slightly and reaches toward Message Bottle once. A small wave recedes. No repeated reaching, disappearing bottle or extra fingers | TR-E1, TR-E2, TR-E4 |
| TR-S3 | 12–19 s | Close view of the wooden table in Keeper's Room. Message Bottle lies on its side beside unfolded cream paper, warm lamp glow from left, blue window reflection in glass. No hands. Marks on paper are not relied on for readable words | Slow 5 cm push toward the paper. One corner moves slightly in a draft and settles. Bottle stays still. No self-writing text | TR-E3, TR-E4 |
| TR-S4 | 19–25 s | Close side view of Elin in Keeper's Room, navy sweater and faded mustard raincoat, face lit by warm lamp with blue twilight on the far side. She looks down at the table. Mouth relaxed and closed | Elin lifts her eyes once toward the window and holds. Tiny breath movement, no speech, head morphing or dramatic expression change | TR-E1, TR-E3 |
| TR-S5 | 25–32 s | Wide view of North Point Lighthouse across the dark water, same tower and cottage silhouette as TR-S1. The lantern beam points into the empty blue-gray horizon. No boats or new buildings | Locked camera. One slow lighthouse-beam sweep across the water, low natural wave movement. No flashing, lightning or additional lights | TR-E2 |
| TR-S6 | 32–38 s | Frontal close-up of Elin in Keeper's Room, same face and wardrobe. Warm lamp catches one side of her face, background falls softly out of focus. Her gaze is just below lens, as though reading the paper | A small eye movement toward the camera, one restrained inhale, then stillness. Mouth does not speak. Hold the final second with stable identity | TR-E1, TR-E3 |
| TR-TITLE | 38–40 s | Editable timeline title on a dark blue-gray field derived from the film's palette | Quiet fade or cut, fully readable hold | No generation |

Provider clips may run 5, 6, 8 or other supported lengths. Select a model/duration that can cover the intended slot. Keep source handles where possible. Do not stretch a short clip into a seven-second slot without inspecting the result. Prefer a supported longer render or a deliberate editorial adjustment approved within the plan's total running time.

Narration links can alter assembly timing. Set intended manual holds where the current document contract supports them, then inspect the assembled timeline. Trim and place the final clips explicitly to achieve the table. Do not assume requested shot duration controls the generated file length.

## TR5. Guided-flow production and captures

| Capture ID | Actual surface | Required visible content and action |
| --- | --- | --- |
| TR-C0 | New project | Storyboard entry, no node canvas |
| TR-C1 | Idea | TR1 brief or a concise logline entered. Continue |
| TR-C2 | Story selection | Mystery and 6 shots selected. Generate screenplay and actual estimate if present |
| TR-C3 | Story review | Six reviewed shots, action/dialogue/duration fields. Make one real creative correction. Set up entities |
| TR-C4 | Entities | Accepted Elin, lighthouse, room and bottle references. Show per-shot assignments, including different interior/exterior casts |
| TR-C5 | Look | 16:9, selected art style and reference-capable still model. Generate your storyboard |
| TR-C6 | Storyboard | All six loaded stills, coherent grade and continuity |
| TR-C7 | Shot inspector/takes | A genuine single-shot revision if needed, with old and chosen take visible and recorded |
| TR-C8 | Script editor | Three voiced lines, Elin's voice and the link to the board |
| TR-C9 | Storyboard | Real clip generation and playable completed shots. Waits may be cut in the edited demo |
| TR-C10 | Timeline | Six picture clips, separate speech and music, editable title card, 40-second final duration |
| TR-C11 | Preview/export | The actual accepted final trailer playing |

If no still needs a revision, demonstrate an actual review selection or a text change from the first screenplay draft. Do not intentionally create a broken image just to manufacture a dramatic before/after. The capture log states what changed and why.

The guide uses four visible stages, even though Story has two screens. Preserve that structure in the edited video and screenshot filenames. Render clips and Assemble timeline belong after setup.

## TR6. Production sequence

| ID | Action | Evidence |
| --- | --- | --- |
| TR-G1 | Discover connected image, image-to-video, TTS and music models | Exact IDs, capabilities, estimated/unknown spend and authorized quantities |
| TR-G2 | Generate and review four entity references | Source images, descriptors, entity exports, review record |
| TR-G3 | Create the project through Storyboard setup | Real brief, initial screenplay, reviewed screenplay, every guided screen capture |
| TR-G4 | Select entities and look, then generate six stills | Shot-to-reference map, original stills, selected take IDs |
| TR-G5 | Review continuity at full size | Character, architecture, room light, bottle and wardrobe comparison sheet |
| TR-G6 | Open/extract the linked script and voice three lines | Actual script export, voice settings, takes and measured durations |
| TR-G7 | Render six clips from selected stills | Original clips, native durations and frame rates, visual review notes |
| TR-G8 | Assemble and edit the film | Timeline export, exact source ranges, deliberate final timing |
| TR-G9 | Generate and mix the original score | Music source, generation provenance, sound stems and measured final mix |
| TR-G10 | Add editable title, validate, and export | Validation output, 40-second master and web encodes |
| TR-G11 | Finish proof images and walkthrough | Capture log, posters, contact sheet, actual result playback |

Do not regenerate an accepted reference or all six shots to fix one scene. Apply the master plan's targeted iteration rules. If a selected still changes, invalidate and replace only the dependent clip and derived exports.

## TR7. Score and sound

Original score brief:

```text
Instrumental score for a restrained forty-second coastal mystery trailer.
Sparse low piano notes, a soft sustained bowed texture, a slow pulse that
becomes slightly more insistent near the last third, then a quiet resolved
tail for a two-second title. No vocals, no speech, no recognizable melody,
no imitation of a named artist or film score, no loud trailer impacts.
Leave space for three short, quiet voiceover lines.
```

Discover a real text-to-music route. If the board's screenplay music field is supported by the active tool family, set it through that contract and verify the resulting draft/generation. Otherwise add an actual generated music asset to a timeline track. Do not use the disabled generic Video Music control or pretend a draft audio binding is rendered sound.

Generate the bed as an original source, retain its native length, and trim/mix it deliberately to the final timeline. Create any silence, fades or ducking through timeline edits. Do not expect a prompt to produce an exact silent gap.

Add one restrained coastal room-tone/wind/water bed only if available within the approved production. It may be generated separately or taken from authorized source audio. Do not mix competing native audio from six video clips. Mute unwanted Shot Audio clips under the continuous score and voiceover, then listen through the full film for joins and clicks.

The score is required for the trailer package. Extra sound effects are optional. If music generation is unavailable, an explicitly authorized original/licensed score may be used with provenance. A silent trailer is partial unless the user accepts that changed outcome.

## TR8. Required deliverables

| Asset ID | Path or family | Requirements |
| --- | --- | --- |
| TR-A1 | `sources/entities/elin.<ext>`, `lighthouse.<ext>`, `keepers-room.<ext>`, `message-bottle.<ext>` | Four accepted references, originals and viewable derivatives |
| TR-A2 | `documents/entities.json`, `entity-descriptors.md` | Entity exports and explicit shot assignments |
| TR-A3 | `documents/brief.md`, `screenplay-draft.json`, `screenplay-reviewed.json`, `production-board.json` | Actual guide draft, reviewed plan and finished board |
| TR-A4 | `documents/script.json`, `voiceover.txt`, `shot-line-map.json` | Three accepted lines, voice settings and board links |
| TR-A5 | `selects/tr-s1.png` through `tr-s6.png` | Six selected stills at original resolution |
| TR-A6 | `selects/tr-s1-clip.<ext>` through `tr-s6-clip.<ext>` | Six accepted original motion takes |
| TR-A7 | `masters/audio/voice/`, `score.<original-ext>`, `voice-stem.wav`, `music-stem.wav` | Original and editing audio assets |
| TR-A8 | `documents/timeline.json`, `shot-map.json` | Editable final cut, source in/out points, selected takes, text and sound |
| TR-A9 | `masters/the-next-tide-clean.mp4`, `the-next-tide-captioned.mp4` | 40-second high-quality final versions with editable project sources |
| TR-A10 | `web/the-next-tide.mp4`, `.webm`, `the-next-tide.vtt` | Web delivery with sound and accurate captions |
| TR-A11 | `web/trailer-poster.webp`, `trailer-poster-960.webp` | A strong actual film frame, with title treatment derived from the editable title |
| TR-A12 | `web/storyboard-contact-sheet.webp` | Six selected frames in story order, short shot labels |
| TR-A13 | `web/entity-continuity.webp` | Source references paired with relevant selected frames |
| TR-A14 | `web/recipe-card.webp`, `social-preview.webp` | Common 1600×900 and 1200×630 derivatives from the film |
| TR-A15 | `captures/steps/tr-c0` through `tr-c11` | Every actual setup and finishing capture |
| TR-A16 | `captures/walkthrough/trailer-guided-flow.mp4`, `.webm`, `.vtt`, `poster.webp` | 45–60-second walkthrough using real assets and screens |
| TR-A17 | `evidence/continuity-review.md`, `timeline-validation.json`, `media-probes.json`, `mix-measurement.txt` | Full visual, structural and audio checks |

Retain originals and all required common handoff files. A contact sheet is a derived illustration of selected frames, not evidence of the UI itself. Keep it separate from the board screenshot.

## TR9. Walkthrough edit

| Segment | Approximate time | Picture | Caption |
| --- | --- | --- | --- |
| TR-W1 | 0–5 s | Lighthouse or keeper moment from final trailer | From a logline to a trailer. |
| TR-W2 | 5–11 s | Idea screen | Start with the story. |
| TR-W3 | 11–20 s | Mystery selection and real screenplay edit | Choose the direction. Review the shots. |
| TR-W4 | 20–29 s | Entities and per-shot assignments | Keep the keeper and locations consistent. |
| TR-W5 | 29–36 s | Look and loaded still board | Set the look before generating clips. |
| TR-W6 | 36–44 s | Script takes and completed clips | Voice the lines and animate the shots. |
| TR-W7 | 44–52 s | Timeline with score and title | Finish the cut on the timeline. |
| TR-W8 | 52–58 s | Final trailer/title | The storyboard, script, and cut stay editable. |

Use readable holds on the Story and Entities screens. Fast cursor movement cannot substitute for showing the decision. Keep the guide visually dominant and the finished film large enough to judge.

## TR10. Acceptance and handoff

| Check ID | Pass condition |
| --- | --- |
| TR-Q1 | Six shots communicate the premise, discovery and recognition without needing explanatory page prose |
| TR-Q2 | Elin's face, hair and wardrobe remain consistent. Exterior and interior references are assigned only where appropriate |
| TR-Q3 | Lighthouse architecture and keeper-room layout remain recognizable between shots |
| TR-Q4 | All clips pass full playback for object drift, hand defects, camera jumps and unwanted text |
| TR-Q5 | Three voiceover lines match the script, are intelligible, and are not falsely shown as lip-synced speech |
| TR-Q6 | Final cut is 40 seconds to within one 24 fps frame, including a readable two-second title card |
| TR-Q7 | Score is rendered, original/authorized and traceable. Speech and music are separate editable tracks with no overlapping unwanted shot audio |
| TR-Q8 | Real setup captures include Idea, both Story screens, Entities and Look, followed by clearly separate editor actions |
| TR-Q9 | Every TR-A item exists and the common M11 checks pass |

In `handoff.md`, identify the strongest wide poster and close-up frame, recommend a card crop, provide a one-sentence story synopsis and accurate captions, and list which document demonstrates each editing capability. Give the coordinator the capture procedure that worked so D1 and D3 can reuse its framing and pacing without reusing this recipe's content.

## TR11. Ready-to-dispatch task

```text
Produce D4 Storyboard to Trailer assets using the master plan and this recipe
plan. Make the original forty-second mystery trailer The Next Tide through
the real Storyboard guided flow: Mystery, six shots, reviewed screenplay,
character/location/prop entities, look and stills. Then voice the three linked
script lines, render clips, edit the timeline, add an original score and title,
and deliver masters, web encodes, posters, all setup captures, manifests and QA.
Pilot the common Storyboard recording procedure and share it with the
coordinator. Do not create node graphs, fake live generation, use unrelated
footage, or build marketing pages. Respect the supplied execution authorization.
```
