# D1. Product ad variants: asset production plan

## AD0. Assignment

Read [MASTERPLAN.md](MASTERPLAN.md) first. Execute this plan with Sol when the user dispatches asset production. Deliver assets and evidence only. Preserve the recipe identifier `viral-video-ad-engine`. Do not edit the marketing page, its data, or the shipped recipe manifest.

Produce three finished 15-second vertical product ads, each with a different opening hook, using the same product, remaining footage, voice, and grade. Supply matching thumbnails, an editable script and storyboard, and a recorded walkthrough of the actual Storyboard guided flow.

Read `.claude/skills/product-commercial/SKILL.md`, `.claude/skills/launch-kit/SKILL.md`, and `.claude/skills/script-video/SKILL.md` after storyboard-core. The guided flow remains the demonstrated starting path. Use the script skill for voicing and timing after the reviewed board exists, not as a reason to replace the guided start with a different workflow.

Owner directory: `<run-root>/viral-video-ad-engine/`. Project name: `Marketing recipes / viral-video-ad-engine / <run-id>`.

## AD1. Required inputs and dependency

D3 owns the shared Olive Travel Cup reference package at `<run-root>/shared/product/`. Wait for its source acceptance before any product generation. You may prepare copy, capture instructions, model selection, and document structure while waiting.

| ID | Input | Use |
| --- | --- | --- |
| AD-IN1 | Accepted original cup reference and SHA-256 | Visual authority for every frame |
| AD-IN2 | Accepted product entity ID or entity export | The same cup attached to every product shot |
| AD-IN3 | Product descriptor and source disclosure | Prompt consistency and handoff provenance |
| AD-IN4 | Source cutout, if accepted and available | Reference/comparison asset, not an invented new product |
| AD-IN5 | Execution authorization, models, and capture session | Production controls from the coordinator |

If running in a different NodeTool instance, import the accepted bytes and recreate the entity from that image. Record the old and new IDs and the unchanged file hash. Do not generate a visually similar replacement.

The cup is unbranded and fictional. Use no price, discount, warranty, capacity, heat-retention claim, or implied customer testimonial. The ad demonstrates a production process rather than offering a real item for sale.

## AD2. Creative direction

Setting: a quiet morning kitchen, pale stone worktop, soft window light from the left, warm neutral surroundings, muted olive cup and charcoal lid. There are no people or hands in this first sample. This keeps the cup readable and avoids an unnecessary character-generation branch.

Board style:

```text
Photographic product commercial in a quiet morning kitchen. Soft warm daylight
from a window on the left, pale limestone and warm off-white surfaces, gentle
shadow falloff, accurate muted-olive and charcoal colors, restrained contrast,
clean product edges. The Olive Travel Cup keeps its reference geometry and
finish in every shot. No on-screen type, logo, lettering, watermark, or extra
product decoration. Camera and light move gently. The product stays still.
```

Use the accepted entity's geometry descriptor without embellishing it. The grade belongs on the board once. Shot actions specify composition and physical details that vary.

Final format: 1080×1920, 30 fps, exactly 15 seconds per variant after editing. Generate at the provider's supported resolution/duration and record those originals. Do not claim the provider generated exactly 15 seconds or that a low-resolution render was native 1080p.

Typography is added as editable timeline text. Use a bundled font, medium weight, with a small amount of text in a clear area. Keep important text within the middle 80% of width and away from the top/bottom 12% of the portrait frame. Produce a clean master without burned-in captions as well as the captioned delivery.

## AD3. Copy and script

Use a single calm adult narrator. Select an actual available English voice and audition it. Do not request an imitation of a public figure. Preserve one voice selection across all versions.

| Line ID | Section | Variant A | Variant B | Variant C |
| --- | --- | --- | --- | --- |
| AD-L1 | Hook | Make a little room for your morning. | Your morning, before the noise. | A quieter start looks like this. |
| AD-L2 | Moment | A warm cup. | Same accepted take as A | Same accepted take as A |
| AD-L3 | Moment | A moment to yourself. | Same accepted take as A | Same accepted take as A |
| AD-L4 | Close | Take it with you. | Same accepted take as A | Same accepted take as A |

Exact end-card text: `Take it with you.` No button, fake URL, price, or made-up brand mark.

Keep spoken words as four editable lines. Voice the three alternative hooks separately and reuse the accepted shared lines. Measure takes before cutting. Let pauses and product holds fill the 15 seconds. Do not force a long take into its slot with visibly or audibly excessive speed changes. If a hook cannot fit naturally, first choose a calmer but more concise delivery direction, then report any necessary copy change.

Save `documents/ad-copy.md`, three script exports, original speech files, and final subtitle files. Preserve source line IDs and their relation to each shot. Where a script-linked assembly derives duration from audio, inspect and adjust the final timeline deliberately to reach the 15-second delivery. Do not assume shot duration fields override speech timing.

Keep A as the canonical script linked to the production board. B and C are separate variant script documents and cuts. Do not repeatedly relink the same board to three scripts or overwrite A to produce B. Reuse accepted audio through supported copy/take operations when available, or reference the original shared audio assets from the variant timelines and manifest. Never invent a voiced status on a script line whose take was not actually attached. If the current tools cannot copy takes, document that limitation while still reusing the audio bytes in the finished cuts.

## AD4. Shot plan

Create four main shots through the guided flow, review them to this specification, and generate those stills first. Add the two alternative opening shots only after the main ad has a usable cut.

| Shot ID | Final cut position | Action for the still | Motion instruction | Entity |
| --- | --- | --- | --- | --- |
| AD-S1A | 0–3 s, opening A | Medium three-quarter view of Olive Travel Cup on a pale stone kitchen worktop. A soft rectangular window shadow falls behind it. Entire lid and base visible, cup on right third, clear space on left for a short caption. | Slow 5 cm push toward the cup. Window light remains steady. The cup and lid do not move or change. | Product only |
| AD-S2 | 3–7 s, shared | Close product detail of Olive Travel Cup's charcoal lid meeting the olive body. Both the rectangular drinking opening and matte finish remain recognizable. Shallow depth of field, no invented handle or seam. | Gentle rack focus from the lid edge to the front of the cup. No rotation, lid movement, steam burst, or liquid. | Product only |
| AD-S3 | 7–11 s, shared | Olive Travel Cup on the worktop beside a closed plain cream paperback. Cup fully visible. The book has no readable text and is smaller in visual emphasis. Warm diagonal light leads to the product. | Slow 8 cm lateral slide. The cup and book remain stationary, with stable perspective and contact shadows. | Product only |
| AD-S4 | 11–15 s, shared close | Front three-quarter hero view of Olive Travel Cup on pale stone. Cup below center with uncluttered space above. The lid opening faces the same direction as the reference. | Very small push for the first two seconds, then a stable hold. No object transformation or background movement. | Product only |
| AD-S1B | 0–3 s, alternate B | Olive Travel Cup on the same surface with its long soft shadow leading into frame. Wider composition than AD-S1A, entire object visible, same window direction. | Camera holds while a subtle exposure-stable highlight shifts along the background. The product does not move. | Product only |
| AD-S1C | 0–3 s, alternate C | Close view from slightly above Olive Travel Cup showing the charcoal lid and the upper olive body. Space below for the short hook caption. Same geometry and finish as the reference. | Slow 10-degree camera arc. The lid opening remains fixed on the product. No full orbit or newly invented backside detail. | Product only |

The time ranges above are final edit slots. A provider may return longer clips. Trim the accepted usable section in the timeline and record source in/out points. Keep the full original clip.

## AD5. Guided production and capture sequence

Capture each screen before advancing. Use the same project for production and the recording. Do not prefill successful media into a fresh empty guide and portray it as a real generation.

| Capture ID | Surface and action | Required visible content | Result |
| --- | --- | --- | --- |
| AD-C0 | New project | Storyboard entry card and the short brief | Establish the actual entry |
| AD-C1 | Idea | Paste the brief below and click Continue | Saved production brief |
| AD-C2 | Story selection | Commercial and 4 shots selected. Show Generate screenplay and its estimate if available | Director writes the initial screenplay |
| AD-C3 | Story review | Four shots, useful action text, dialogue and durations. Make one real text edit before continuing | Reviewed four-shot plan |
| AD-C4 | Entities | Select the accepted cup entity, or create it from the shared reference. Show per-shot assignments | Cup reference attached to each product shot |
| AD-C5 | Look | 9:16, chosen style, reference-capable still model, actual estimate, Generate your storyboard | Stills start in the real board |
| AD-C6 | Storyboard | Four loaded stills with the same cup. Open one shot for inspection | Visible selected takes |
| AD-C7 | Script editor | Four lines, narrator voice, a selected voice take, and the link to the board | Editable spoken copy |
| AD-C8 | Storyboard | Render clips followed by completed playable clips | Real motion assets |
| AD-C9 | Timeline | Four shots, voice on its own track, editable end-card text | Finished 15-second sequence |
| AD-C10 | Agent/editor continuation | A real request for two alternative openings and the resulting extra shots/copy | Variant work is identified as a continuation |
| AD-C11 | Finished work | Play A, then show the three opening frames together | Clear result of the recipe |

Brief for AD-C1:

```text
Make a 15-second vertical product ad for the Olive Travel Cup. Four shots:
a quiet morning opening, a close look at the lid and finish, the cup beside
a plain book, and a clean hero ending. Warm window light in a pale kitchen.
The cup must follow the product reference I will choose in Entities.
Use these spoken lines: "Make a little room for your morning." "A warm cup."
"A moment to yourself." "Take it with you." No price, logo, or product claims.
```

The Director's first draft may differ. Review and edit it through the actual Story screen to match AD4. Film that as a normal creative edit. Do not claim the unedited output matched a hand-authored shot list.

Save a raw screenshot of each capture ID. AD-C2 and AD-C3 share the Story step but need separate images. The edited walkthrough should use the visible four-stage guide, then a brief script/board/timeline continuation.

## AD6. Generation instructions

| ID | Operation | Constraints and verification |
| --- | --- | --- |
| AD-G1 | Discover image, image-to-video, TTS and optional music models | Use connected models and record exact IDs. The still model must accept the cup image |
| AD-G2 | Attach the cup to the board and every product shot | Verify actual entity IDs and source image. Do not re-describe an imagined cup |
| AD-G3 | Generate the four main stills | One initial take each. Inspect the entire cup at full size against the source before accepting |
| AD-G4 | Extract/open and voice the script | Create real editable lines. Set a voice for the narrator before voicing. Generate only required lines |
| AD-G5 | Generate the four main clips | Keyframe mode. Start from selected stills. Inspect every frame for lid drift, duplicated objects, crawling texture, and moving contact shadows |
| AD-G6 | Assemble and finish A | Inspect the resulting duration. Use a separate voice track, mute unwanted native shot audio, add editable end-card text, and trim to 15 seconds |
| AD-G7 | Create B and C openings | Add two new storyboard shots and two hook lines. Reuse shared shots and accepted shared speech. Do not pay for another full board |
| AD-G8 | Finish B and C as separate editable cuts | Use supported timeline copy/version/create operations. Record source asset IDs and in/out points for the shared footage. Do not reassemble all six board shots into every ad |
| AD-G9 | Produce thumbnails and derivatives | Derive them from the selected stills, not another image-generation call. Keep clean and captioned versions |

Music is optional for this recipe. If used, one original understated instrumental bed is reused across all variants, with voice intelligibility checked. Do not add music through a disabled guided control. The ads must be complete with voice and room for silence if no music model is available.

## AD7. Required deliverables

Filenames below are relative to this recipe's directory. The manifest must enumerate each actual file, including encoded siblings. Do not mark a family complete if only the master exists.

| Asset ID | Path or family | Requirements |
| --- | --- | --- |
| AD-A1 | `documents/production-board.json` | Exported board including four main shots and two alternate openings, with source IDs |
| AD-A2 | `documents/script-a.json`, `script-b.json`, `script-c.json`, `ad-copy.md` | Exact accepted copy, voice selections, line/take IDs |
| AD-A3 | `documents/timeline-a.json`, `timeline-b.json`, `timeline-c.json` | Editable 15-second cuts, asset map and source in/out points |
| AD-A4 | `selects/ad-s1a.png`, `ad-s1b.png`, `ad-s1c.png`, `ad-s2.png`, `ad-s3.png`, `ad-s4.png` | Six full-quality selected stills |
| AD-A5 | `selects/<shot-id>-clip.<original-extension>` | Six accepted source clips, original native resolution and duration |
| AD-A6 | `masters/ad-a-clean.mp4`, `ad-b-clean.mp4`, `ad-c-clean.mp4` | Clean high-quality portrait masters with voice |
| AD-A7 | `masters/ad-a-captioned.mp4`, `ad-b-captioned.mp4`, `ad-c-captioned.mp4` | Same cuts with legible caption/end-card treatment |
| AD-A8 | `web/ad-a.mp4`, `ad-b.mp4`, `ad-c.mp4` and `.webm` siblings | Web deliveries, plus one WebP poster per variant |
| AD-A9 | `web/thumbnail-a.webp`, `thumbnail-b.webp`, `thumbnail-c.webp` | One portrait thumbnail per hook, source reference and exact caption documented |
| AD-A10 | `web/hooks-contact-sheet.webp` | Three hooks and their corresponding opening frames, labels readable |
| AD-A11 | `web/recipe-card.webp`, `social-preview.webp` | 1600×900 and 1200×630 compositions of real output |
| AD-A12 | `masters/voice/` and `web/ad-a.vtt`, `ad-b.vtt`, `ad-c.vtt` | Original voice takes, editable stems, accurate captions |
| AD-A13 | `captures/steps/ad-c0` through `ad-c11` | PNG originals and required WebP derivatives |
| AD-A14 | `captures/walkthrough/ad-guided-flow.mp4`, `.webm`, `.vtt`, `poster.webp` | 35–60-second setup and finishing demonstration |
| AD-A15 | `evidence/product-consistency.webp`, `evidence/variant-reuse.json` | Reference versus selected frames, and proof of shared footage/takes |

Also deliver the common manifest, capture log, handoff, and QA files from the master plan. Do not create sample analytics or conversion results.

## AD8. Walkthrough edit

Target a 45–55-second silent demonstration with concise captions. Keep the raw recording complete.

| Segment | Approximate time | Picture | Caption |
| --- | --- | --- | --- |
| AD-W1 | 0–4 s | Best moment of ad A | A product ad, with openings to compare. |
| AD-W2 | 4–10 s | Idea entry | Describe the ad. |
| AD-W3 | 10–18 s | Commercial choice and real Story review | Review the shots and words. |
| AD-W4 | 18–25 s | Cup entity and assignments | Use the same product reference. |
| AD-W5 | 25–31 s | Look selection and loaded board, with wait cut disclosed | Choose the look and review the stills. |
| AD-W6 | 31–39 s | Script takes, completed clips, timeline | Voice it and finish the cut. |
| AD-W7 | 39–47 s | Alternate opening shots and three previews | Change the opening. Keep the rest. |
| AD-W8 | 47–52 s | Finished ad held large | Editable shots, script, and timeline. |

These are edit allocations, not a claim about production speed. Avoid a montage so fast that the guided choices cannot be read.

## AD9. Acceptance and handoff

| Check ID | Pass condition |
| --- | --- |
| AD-Q1 | The same accepted cup appears in all six stills and clips. Lid opening, taper, color and proportions agree with the source |
| AD-Q2 | All three ads are 15 seconds to within one delivery frame, with no black gaps or clipped words |
| AD-Q3 | Only the opening copy/shot differs between variants unless a documented timing adjustment is necessary. The shared asset map proves reuse |
| AD-Q4 | The scripts, selected takes, board and timelines can be reopened and relate to the exported videos |
| AD-Q5 | Captions remain readable on a phone-size playback and do not cover the cup or lid detail |
| AD-Q6 | The walkthrough contains the actual Entities stage and both Story screens, with no node graph |
| AD-Q7 | The package describes a fictional unbranded demonstration and makes no sales, performance, virality, or speed claims |
| AD-Q8 | Common M11 checks pass and every AD-A asset is accounted for |

Recommend ad A as the initial hero unless the evidence favors B or C. Explain the choice in `handoff.md` using visible composition and readability, not predicted advertising performance. Supply one sentence of alt text for each thumbnail and one factual caption for the comparison sheet.

## AD10. Ready-to-dispatch task

```text
Produce the asset package for D1 Product ad variants using the master plan and
this recipe plan. Use the accepted shared Olive Travel Cup reference from D3.
Create three 15-second portrait ads with different opening hooks, shared
remaining shots and voice takes, editable scripts/board/timelines, thumbnails,
real guided-flow captures, web derivatives, and the complete evidence handoff.
Use Storyboard > Commercial as the guided entry. Do not use node graphs,
invent product claims, replace the shared reference, or build marketing pages.
Respect the execution authorization supplied by the coordinator. Wait only on
the shared source or a required approval/capability, and finish independent work.
```
