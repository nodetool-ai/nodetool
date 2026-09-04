---
name: seedance-2-prompting
description: Prompt ByteDance's Seedance 2 video line — the Subject/Motion/Environment/Look/Camera/Audio formula, how dialogue in double quotes gets voiced and lip-synced, writing the sound mix instead of leaving it open, cutting between shots in one generation, the JSON beat-sheet brief that holds an arc across a whole piece, and giving physics a consequence to chase. Use whenever the model id contains seedance-2 (bytedance/seedance-2.0 and its fast and mini variants, bytedance/seedance-2.5, kie's bytedance/seedance-2, seedance-2-fast, seedance-2-mini, seedance-2-5, in text-to-video, image-to-video and reference-to-video form) on generate_video, animate_image or a TextToVideo node. Not for Seedance 1.x.
---

# Seedance 2 → direct a scene, not a frame

Seedance 2 writes the picture and the sound in the same pass, and that one fact
changes the prompt. You are not describing a frame; you are directing a short
scene including the camera move and the mix, and the model has to hold all of
it together. It follows plain natural language, so the prompts that work read
like a short shot brief: who, doing what, where, shot how, and what it sounds
like.

That also decides how a multi-scene piece is built: the sound belongs to the
clip that generated it, so several Seedance clips cut together restart their
mix at every join. `video-audio-continuity` covers when the whole piece has to
be one generation, and the sound-design vocabulary that gets past the
copyright filter.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`. Duration set to auto lets the model pick a
length to fit the content; pin it anywhere from 4 to 15 seconds instead when
the cut matters.

## The formula

Two parts do the work:

- **Subject** — who or what is on screen, concretely.
- **Motion** — what it is doing, and how.

Everything after is optional, added as the shot needs it:

- **Environment** — place, time of day, weather, light.
- **Look** — the finished style, documentary realism through flat 2D.
- **Camera** — framing and move, briefed the way you would brief an operator.
- **Audio** — dialogue, ambience, score, or silence.

Loaded up:

> A glassblower in a leather apron pulls a glowing orange gather of molten glass
> from the furnace, turns the rod steadily to keep it from slumping, then lifts
> a blowpipe to his lips and breathes into it as the bulb swells and the glass
> deepens from orange toward red. A dim workshop lit almost entirely by the
> mouth of the furnace, tools and half-finished pieces on the bench behind him,
> a warm documentary look with the highlights blown out slightly. The camera
> opens on a slow push-in toward his hands, then arcs around to catch the
> molten glass against the dark of the room. Audio: the low roar of the
> furnace, the creak of the turning rod, a faint hiss as the surface cools, no
> music.

Every layer there is a decision the model no longer invents.

## Dialogue, sound and on-screen text

**Dialogue** goes in double quotes. The model voices it, matches lips to it and
times it to the cut. Keep lines short — a long monologue drifts out of sync, so
split a speech across two lines and let the cut carry it. Direct the delivery
too ("play her line dry and a little proud, his quiet and worn out").

**Subtitles** work by describing a voiceover and asking for the text along the
bottom edge, timed to the voice.

**Ambience** is a sound brief. Name the sounds you want in the mix, and write
"no music" when you mean it. An open prompt comes back scored like a car advert.

## Rules

- **Spend words on verbs.** Motion is what gets animated. "A stunning dancer"
  gives nothing; "a dancer dropping into a low spin, the skirt flaring, then
  snapping upright" gives a path to follow.
- **Use camera language.** Dolly, pan, tilt, crane, push-in, rack focus,
  locked-off all read cleanly. "Epic cinematic camera" goes a hundred
  directions.
- **Under-directed audio is the common failure.** Name the diegetic sounds, the
  room tone, and call for silence on purpose.
- **Physics needs a consequence.** "Leaves scatter on each impact", "the mug
  slides and tips" give the model something concrete to resolve toward.
- **Say "cut to" when you want a cut.** Spelled out, it honours a shot list far
  more reliably than it invents one.
- **Two clipped lines across a cut beat one long line** that loses sync
  halfway.

The vague-versus-specific gap is the same as everywhere else, and costs more
here because a bad clip costs seconds of render. "A beautiful cinematic video
of a dancer, stunning, 8k, masterpiece" returns a stock dancer under flat even
light. Set the dress, the spin, the heel strikes, the lone spotlight and the
guitar, and the model spends its effort rendering your scene instead of
inventing one.

## Patterns

- **Hard motion and real physics** — give weight and contact points: a vault
  with a hand planted on a ledge, gravel kicking up on the landing, a jacket
  flapping, the camera tracking alongside at chest height.
- **A spot that cuts between shots** — "built as three cuts in one take", each
  cut named, a title fading up on the closing frame in a named type class and
  colour.
- **When the sound is the scene** — a slow push-in, a naturalistic grade, and
  a mix of droplets, a far-off bird and branch creak with "no music at all".
- **Product hero shot** — one satisfying physical moment. A pour, a splash, a
  tab popping with a fine spray lifting off, macro, hard rim light on the
  droplets, then the line fading up in the lower third.
- **Spokesperson to camera** — vertical, phone-camera look, a short spoken
  line in quotes, a small physical beat on the last word, then a two-second
  insert cut and back.

## The structured beat sheet

Prose carries one shot. For a whole piece with a shape — a hook, a turn, a
drop, a peak — hand Seedance a JSON brief instead: global fields that hold for
the entire clip, then a timeline of beats, each one naming its function, its
picture and its sound. The function label (`fn`) is what keeps the model from
flattening the arc into eight equally-weighted shots.

Six global fields, then the beats:

- `duration` — the whole clip, within what the endpoint you called accepts.
- `camera` — one move across the whole clip, not one per beat. A single
  continuous push-in reads as a shot; a new move every three seconds reads as
  a montage.
- `light` — the source, its colour temperature, and how it changes over the
  clip. Name it once and every beat inherits it.
- `style` — genre, lens character, grain, palette, and one or two reference
  points for restraint.
- `negative_prompt` — the artifacts you actually see: jitter, bent limbs,
  morphing faces, flicker.
- `audio_note` — the rule the mix obeys across every beat. "One continuous bed,
  never full silence" is what stops the model resetting the sound at each cut.

```json
{
  "duration": "25s",
  "camera": "One continuous slow, steady push-in from extreme wide to close-up across the 25s; shallow depth by the end.",
  "light": "Single unseen source above; cold white-cyan 6500K key casts down, intensifying steadily from a whisper to a flood; deep blue 6000K twilight ambient; hard top key, soft fill.",
  "style": "Mysterious sci-fi first contact, withheld reveal, intimate awe; anamorphic, atmospheric haze, fine film grain, deep teal-twilight palette; Arrival / Close Encounters restraint.",
  "negative_prompt": "Avoid jitter and bent limbs; stable facial features, no morphing, no flickering.",
  "audio_note": "ONE continuous bed, never full silence; dips to sub-bass rumble at the DROP instead of cutting.",
  "timeline": [
    {"t":"0:00-0:03","fn":"Cold Open / Hook","visual":"Extreme wide, near-dark. A small child alone in a vast twilight field, tiny and still; wind begins bending the wheat toward one point, a faint unnatural tint at frame edge - source unseen.","audio":"Low sub-bass drone, faint wind, one distant detuned low-brass signal tone."},
    {"t":"0:03-0:08","fn":"Setup / World","visual":"Medium wide. The child looks up; ordinary dusk field established as a cold light starts to rise on them from somewhere above, still unshown.","audio":"The tone bends; sparse high harmonics enter; sub-rumble slowly grows."},
    {"t":"0:08-0:11","fn":"Inciting Incident","visual":"Medium. The 'but then': cold light intensifies on the child's face - curiosity dawning, not fear. The unseen presence is undeniable now.","audio":"First swell; a soft riser begins; a deep slow pulse enters."},
    {"t":"0:11-0:16","fn":"Escalation / Stakes","visual":"Push-in tightening on the face. Light climbing, hair lifting, eyes widening; the child steps forward, drawn in.","audio":"Layers stack - riser rising, pulses quicken, strings enter; tension builds."},
    {"t":"0:16-0:17","fn":"THE DROP","visual":"The hinge: everything stills for one beat, the face half-lit, breath caught, light pooled and waiting.","audio":"Bed dips to a low sub-bass rumble for one beat - near-silence, never fully out."},
    {"t":"0:17-0:22","fn":"Climax / Emotional Peak","visual":"Close-up. PEAK: the child slowly lifts one open hand toward the light, fingers spreading; the intensifying beam washes over the small palm and reflects in wide, wonder-filled eyes as a faint slender silhouette of light enters the top edge of frame, almost meeting the fingertips.","audio":"A warm resonant swell blooms - wordless choir and vast strings soaring into awe over sustained deep brass, a fragile high motif of wonder."},
    {"t":"0:22-0:24","fn":"Title Card","visual":"The light blooms to white across the frame; title fades in over the bloom (clean type in post).","audio":"Choir and strings resolve to one luminous sustained chord; a low sub-boom lands."},
    {"t":"0:24-0:25","fn":"Button / Stinger","visual":"After the title, one last beat: the light settles, the field dim again; a single held stillness.","audio":"One fragile high bell tone over near-silence; hard out."}
  ]
}
```

What makes it work, and what to keep when you adapt it:

- **Every beat has all three of `fn`, `visual` and `audio`.** A beat missing its
  audio line is where the mix drifts back to a generic score.
- **The drop is a beat, not a gap.** One second of the bed dipping to sub-bass
  reads as a hinge; actual silence reads as a dropout. Say which you want.
- **The peak beat gets the most words.** It is the only place worth spending
  detail on a hand, a reflection, an edge of frame. The setup beats stay short.
- **Camera and light are global, and the beats describe their state.** "Light
  climbing, hair lifting" is a state of the global light, not a new light.
- **Title cards belong in the timeline.** Give the bloom a beat of its own and
  add the type in post rather than asking the model to render it.
- **The stinger keeps the clip from ending on the peak.** One held beat after
  the title is what makes it read as finished rather than cut off.

Adapt the beat functions to the piece. A UGC ad runs hook, problem, product,
proof, call to action; a product film runs establish, detail, transformation,
hero, mark. The shape changes; the discipline of naming each beat's job does
not.

Grade the result with `analyze_video` and `detect_video_scenes` rather than
watching it, and `understand_video` when you need a written read of what
actually rendered.

Adapted from fal's Seedance 2.0 prompting guide:
https://fal.ai/learn/tools/seedance-2-0-prompting-guide
