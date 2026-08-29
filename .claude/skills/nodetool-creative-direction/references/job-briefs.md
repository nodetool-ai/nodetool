# Job briefs

One brief per message, after the standing orders. Replace `[PRODUCT]`, `[CITY]`,
`[TOPIC]`. Attach a pack shot, a face or a reference video, or name entities that
already exist.

Every brief that names a character or product assumes you cast it first: an image
asset, then `create_entity`, then `set_board {entity_ids}`. In the shot text below,
`Nova` and `[PRODUCT]` stand for the entity's **plain name** — that is what makes it
season the prompt.

---

## A — UGC review to hero end card, 30s 9:16

```
Direct a 30s 9:16 UGC-to-hero ad for [PRODUCT].

Cast: [PRODUCT] as a prop entity from the attached pack shot. Nova as a
character entity — generate the reference still first (early 20s, natural
skin, no beauty filter, front-camera light), then create_entity from it. After
I pick a face I like, update_entity to that crop.

Board style: handheld front-camera iPhone, bedroom or bright bathroom, mild
shake, autofocus hunt, compression grain, window daylight. Natural audio only,
no music, no burned-in captions.

Seven shots, then stop.
1a 0-4   hook. Nova touches untreated hair. "I wanted lighter hair..."
2a 4-8   she finds [PRODUCT] on the dressing table, autofocus hunts onto the
         label. "...without permanently dyeing it."
3a 8-13  she sections her hair, two short spray bursts. Physical coverage, not
         a magic glow.
4a 13-18 extreme close-up, untreated against treated. "Okay... that is
         actually a huge difference."
5a 18-23 mirror selfie, two head turns. "I actually love it."
6a 23-26 [PRODUCT] held beside her face. "Just spray and switch up your look."
7a 26-30 no talent. Studio hero of [PRODUCT], slow 8cm push-in, cream
         cyclorama, copy space right. Set this shot's entity_ids to the
         product alone so Nova's descriptor does not reach it.
```

## B — Luxury pack shot, 10s 16:9

```
Direct a 10s 16:9 luxury commercial. [PRODUCT] only, no talent, no type.

Style: black cyclorama, one warm key, gold rim, volumetric mist, 85-100mm,
24fps, no grain.

1a 0-2  macro. A light streak crosses the glass, two condensation beads run.
2a 2-4  the bottle rises onto black acrylic. The light moves, the pack does not.
3a 4-6  low 30-degree orbit, label readable at the midpoint.
4a 6-8  rack focus to the liquid, one ripple, then still.
5a 8-10 pull back to a centred hero, key lifts ten percent, last 1.2s dead hold.

Stop after the board.
```

## C — Street CPG walk, 30s 16:9

```
Direct a 30s 16:9 street commercial in [CITY] for [PRODUCT] with Nova.
Style: 90s print / 35mm commercial, hard noon sun, mild bloom. No other brand
marks, no on-screen type.

1a 0-4   fisheye on a boom, Nova walking cobbles, [PRODUCT] in hand, long shadow
2a 4-8   shoulder track, a bite or a sip
3a 8-12  POV from inside the cup or wrapper, a building cornice behind
4a 12-16 low wide at a crosswalk, one unbranded taxi
5a 16-22 she stops and turns, the pack reads
6a 22-27 she leans to the lens, a small late smile. One line, on this shot only.
7a 27-30 the pack on a cafe table, street bokeh, one-second push

Stop after the board.
```

## D — Pinterest-fail comedy, 30s 16:9

```
Direct a 30s 16:9 friend-shot phone comedy. Nova tries to get a perfect
Pinterest still of [ACTIVITY] with [PRODUCT] in frame; reality ruins every
attempt. Same face and wardrobe throughout. No score — wind and laughter only.

Cast Nova from text: generate the reference still, create_entity, and lock it
before any shot renders.

1a 0-5   she arranges the cloth and [PRODUCT]. Wind flips the plate.
         "...Okay, we'll pretend that didn't happen."
2a 5-10  deadpan. She does not chase it. A friend's laugh jolts the frame.
3a 10-15 serene profile, a bee, a swat, a whip-pan.
4a 15-20 hair-in-wind walk, cardigan over her head, [PRODUCT] still in one hand.
5a 20-25 thermos pour, a stain, off-camera "That's going to stain—"
6a 25-30 she flops onto the cloth, [PRODUCT] on her stomach. "This is the photo.
         This is the one we're posting." Thumbs up, cut mid-laugh.
```

## E — Ritual locker room, 19s 16:9

```
Direct a 19s 16:9 everyday phone video of Nova, cast from the attached photo:
save the photo as an asset, then create_entity with a descriptor that pins the
face and hair from it. The descriptor must not carry the photo's outfit.

Wardrobe in the shot text: black gym set, hair tied. Locker room, full-length
mirror, bag on the bench, no readable signage.
Style: old iPhone 1x, propped static angle, fluorescent green tint, heavy noise,
no music bed.

1a 0-4   she walks to the mirror, props the phone, adjusts her straps
2a 4-8   sits, double-knots her laces, bounce-tests the shoes
3a 8-11  earbuds in
4a 11-14 shoulder rolls, a quiet "okay... let's get it."
5a 14-17 arm swings, one glance at the camera
6a 17-19 picks up the phone, walks to the door, freeze mid-stride

Stop. Stills from the photo entity, then one clip pass.
```

## F — Night city vlog, 30s

```
Direct a 30s first-person night vlog in [CITY] with Nova in one outfit
throughout. Mix selfie, cockpit, aerial and street-level. Short landmark lines
for [LANDMARK A] and [LANDMARK B]. No text, no logos. Wind in her hair.

Board up to ten shots, then — before any render — propose a six-shot collapse
and tell me which four you would drop. Stop there.

1  rooftop selfie, the vehicle behind her. "I'm getting on this in [CITY]."
2  inside, harness on, a nervous smile
3  lift-off, wide city and water
4  open door. "there's no door."
5  POV, feet over the grid
6  selfie with [LANDMARK A]. "That's [LANDMARK A]."
7  aerial over [LANDMARK B], feet in frame
8  low pass along a bridge
9  she steps off, same outfit, walks to camera
10 crossing the street. "Alright everyone, bye."
```

## G — Spec ad, stills only

```
Do not render any clip.

Direct an eight-shot UGC-cinematic spec for [PRODUCT] with Nova as [NAME].
Open on a store walk, middle on use or taste, end on a verdict to camera plus a
pack hero. Style: polished UGC, [9:16 or 16:9], photoreal talent.

Write the board and render stills only. After I approve the stills, add the
motion to those same shots with update_shot — action, wardrobe, set and cast
stay exactly as they are, only `motion` changes.
```

## H — Short or trailer, 40s

```
Direct a 40-second [genre] short: [LOGLINE]. Six shots, opening wide, ending on
a close-up.

Write the full framing as well as the shots: title, brief, style, and the
narration and music prompt. Board narration and music only exist on the
screenplay, so if the board is open in a tab set them with
ui_storyboard_set_screenplay; otherwise say so and keep the words on the shots.
assemble_storyboard_timeline turns board narration and music into draft audio
clips, which is why they are worth setting.

If I gave no logline: a night courier loses the package. Wet asphalt, sodium and
cyan, and she whispers "That wasn't a drop."

Stop after the board.
```

## I — Clone a reference video

```
Read the attached reference video with understand_video (a Gemini model via
find_model — it reads the whole video, not sampled frames).

Extract: aspect, length, shot count, what the first three seconds do, then per
shot the clock, framing, camera height, move, who speaks and whether the product
is visible. Then the audio recipe, then one paragraph on why it works.

Rebuild it for [PRODUCT] with a new character. Keep the cut rhythm and the
camera heights. Change the room, the wardrobe and the lines. Do not copy any
trademark from the reference.

Cast from stills first: generate the character reference, create_entity, then
render the board. Slug every shot so I can say "fix 2a".

Stop after the breakdown and the rebuilt board.
```

## J — Launch kit

```
Launch kit for [BRAND] [SKU] from the attached flat and on-body photos.
Stop after each phase and wait.

A. Cast. A product entity from the flat: front, three-quarter, back, top, and
   on-figure references. A character entity from the on-body photo, with a
   descriptor that holds across front, three-quarter, profile, back, seated and
   mid-action. memory_save the grade — [cold film / warm daylight / black
   studio] — with both entity ids in `resources`.
B. Twelve still-only shots, mixed crops, on-figure and product-only. Logo
   geometry comes from the product entity, never from a prompt.
C. Three 9:16 clips, 6-8s, from stills I approved in B.
D. One 30s 16:9 film, slugged and timed, with narration and a music prompt.
   Assemble it, then put the narration on its own track and mute the Shot Audio
   clips under it.
E. Report shot count and model per phase before each render. Do not quote
   dollars; no tool prices a render. Report actual spend with get_cost_summary
   at the end.

Same board style A through D. Do not change the image model mid-kit unless a
still fails twice.
```

## K — Faceless explainer, 60s 16:9

```
Research [TOPIC], then direct a faceless 16:9 explainer. No on-camera talent.

Write the voiceover first, 150-165 words, as a script: create_script, then
edit_script to add the lines. Then derive_storyboard_from_script so each line
gets a shot, and rewrite the eight shots' action and motion as b-roll to that
voiceover. Style: [flat 2D / documentary macro / dark UI / paper-craft].

Stills on every shot before any clip. Voice the script with voice_script_lines
so the shots take their length from the takes. Then
assemble_storyboard_timeline — a linked board cuts words and picture together,
one voiceover clip per line. Finish by muting the Shot Audio clips under the
voiceover with edit_timeline set_clip_params.
```

## L — Reusable graph

Only when the user asks for a template they will re-run. A one-off piece does not
justify a graph.

```
Build a workflow named "UGC factory" that I can re-run from Chat.

Inputs: a product image, a brief, an aspect ratio.
Shape: nodetool.creative.Director (brief + style + shot_count) -> the shots'
prompts -> a text-to-image step per shot -> a gate I approve -> an
image-to-video step per shot -> timeline assembly.

Search the registry for every node type before you add it, validate the graph,
save it, and do not run the clip half.
```

---

## Follow-ups the loop already handles

```
Fix 3a only. Leave the rest.
Drop the contre-jour across the whole board — soft even daylight. Update the
  board style, do not rewrite the shots.
New still on 2a. Keep the old take.
revise_storyboard_clip 5a: darker, add rain, same blocking.
Add a reaction shot after 3a and re-slug from there. Do not re-render 1a-3a.
Collapse 8, 9 and 10 into one 8s shot, keeping the lean-in as the last second.
The face drifted on 4a. I picked take 2 in the gallery — regenerate the clip.
The label is unreadable on 2a. New macro still, then a clip from it.
Cut it. Assemble, validate, narration on its own track, mute Shot Audio on 1-6.
```

Note on takes: nothing in the tool surface selects a keyframe or clip version. The
user clicks it in the board's takes gallery, then asks for the clip. Regenerating
a still appends a version and makes the new one selected.
