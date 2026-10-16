# Apps and creative document protocols

This page is for the coordinator. Never give it to a participant. See
[README.md](README.md) for how to use a protocol.

The fake runtime completes still images and text. It has no video, speech,
or music model, and a video or audio output from a faked node is not
playable media. Each protocol below says which part of its journey the fakes
can complete. A failure past that point is a fixture artifact.

## `build-app`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Make a small tool of your own in this app: a box where someone
types a sentence, a button, and a place where a changed version of the
sentence appears. Then use your tool with a sentence of your own."

**Pass.** In the tool's own run view, the participant's sentence produced a
visible output.

**Checks.**

- Record whether the participant built the tool's screen and its logic in
  one place or had to make a workflow first.
- Compare the output with the input. Only the guided planner's Code step
  changes the sentence on the fakes.
- After any reload, check that the tool's input, button, and output are still
  on its screen.

**Routes.**

- "+ New", then "New app". The header toggle (aria "App view") reads Design,
  Run, "Preview draft", and Settings. The App Data panel's "Operations"
  section has "Add operation", whose "Runs" field binds a workflow or a
  script. A button does nothing until an operation is bound.
- The "Workflow" guided flow, whose result opens as a mini app with run
  history.
- Apps are listed under the Documents panel's "Apps" group.

**Fakes.** A model step answers with the fixed reply whatever the input.

**Regression.** `web/tests/journeys/mini-app.spec.ts` runs a seeded app with
a typed value. `recipe-builder.spec.ts` saves an App Builder edit.

## `sketch`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |

**Goal.** "Make a simple drawing of your own in this app, for example a house
or a face, by drawing it yourself. Then leave the page, come back, and open
your drawing again."

**Pass.** After a reload, the participant opened the same drawing with its
strokes.

**Checks.**

- Compare the drawing before and after the reload. Missing strokes are a
  persistence finding.
- Record each tool the participant tried and whether its effect matched its
  icon or label.
- Record which surface listed the drawing after the reload and which said it
  was empty.

**Routes.**

- "+ New", then "New sketch". This makes a blank `Untitled.png` in the
  Library and opens it in the editor. It is not listed under Documents.
- The "Sketch" guided flow (card title "Image"), whose result is a sketch
  document under Documents, "Creative documents".
- Tools include Brush, Pencil, Eraser, Fill, Shape, and Gradient. Edits
  autosave. "Save" (Ctrl+S) and "Save as Asset" are in the toolbar.

**Fakes.** Drawing by hand needs no provider. Generation returns the
gradient.

**Known behavior.** "New sketch" opens a white canvas with white ink, so the
first stroke is invisible until the participant picks a colour (round 7).

## `storyboard`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Plan a short video as a series of scenes, with a picture for each
scene. Then leave the page, come back, and find your plan with its pictures
again."

**Pass.** After a reload, the board opened with more than one shot and a
still on each shot.

**Checks.**

- Count the shots and the stills before and after the reload.
- Read each shot card. "No still yet" after a render that reported success
  is a feedback finding.
- Record the cost or confirmation the render dialog showed.

**Routes.**

- "+ New", then "New storyboard…", then "Blank storyboard" or an example
  ("N shots, stills included").
- The "Storyboard" guided flow: Idea, Story, Entities, Look, then "Generate
  your storyboard".
- On the board, "Render stills" opens a dialog with a "Still model" picker.
  Stills appear on the shot cards.
- Boards are listed under Documents, "Creative documents".

**Fakes.** Stills are the gradient. The guided flow's story text has "fake"
in every field, because forced tool calls get schema-shaped arguments.
"Render clips" needs a video model, which the fakes do not list, so the goal
stops at stills.

**Regression.** `web/tests/journeys/storyboard-design.spec.ts` saves board
edits without generation.

## `timeline`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Assets | Two photos of different scenes, for example `beach.jpg` and `forest.jpg` |

**Goal.** "You have two photos of your own. Use this app to put them one after
the other in a short video, and play the video from the start."

**Pass.** A timeline with both photos in order, and a screenshot during
playback that shows the second photo after the first.

**Checks.**

- Record the order and length of the clips on the track.
- Compare the preview at two playback times with the clips under the
  playhead.
- Record how the participant got the photos onto the track.

**Routes.**

- "+ New", then "New timeline". Media reaches a track by dragging from the
  app's own Library grid, so a photo is uploaded to the Library first. The
  "Add track" button and a track's context menu ("Add generated clip here…",
  "Add text") add more.
- Preview: "Play" or "Pause" (Space), "Stop", and "Step back one frame". The
  timeline editor has its own shortcut sheet on "?".
- "Save" and "Export video" are in the timeline's top bar. Export renders in
  the browser. The goal does not ask for it, because the runner cannot
  inspect a saved file.
- Timelines are listed under Documents, "Creative documents".

**Known behavior.** Until UX study 6, a photo dropped on an empty timeline
landed one track-header width (3.4 s at 100 %) after the drop point, because
the header column had no width with no tracks. Fixed in the study 6 PR. A
Library drop in the second half of a clip now lands at that clip's end, so the
first clip keeps its length (study-6-I4). In Overlap mode, and in a clip's
first half, the drop keeps the pointer's time. The guided flow's "Drop your media" places dropped photos
in order without a drag (study-6-I5).

**Fakes.** Uploaded photos are real files, so this goal can complete. The
"Timeline" guided flow and generated clips need a video model. A generated
video or audio clip from a faked node is a 1 × 1 PNG labelled as video or
audio and will not play.

## `game`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Make a small game in this app that you can play, and then play it
for a moment."

**Pass.** A game view that changed in response to the participant's keys or
clicks.

**Checks.**

- Record each key the participant pressed in play and the change it caused.
- Read the design text the flow shows before the build.

**Routes.** "+ New", then the "Game" guided flow: Idea (or "Start with a
blank room" and "Start a blank 3D game"), the design step's "Game template"
and "Write the design", the review, then the look step's "Build your game".
Examples has a Games tab.

**Fakes.** The designer's text has "fake" in every field and the art is the
gradient. The blank-room starts skip the language model, so they are the
likeliest path to a playable game on the fakes. Judge mechanics, not the
design.

**Known behavior.** The game editor shows a layout row and, on every panel,
"Drag", "Move … panel", "Position … panel" and "Hide" controls (round 7).

## `voice-script`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Write three short lines for a narrator in this app, and have the
app read them aloud."

**Fakes.** "Test Voice Model" voices each line as silence whose length
follows the text. The script writer's lines and speaker read "fake".

**Pass.** Each line shows a voiced clip with a duration. The runner cannot
hear audio, so judge the visible player, waveform, or duration.

**Checks.** Record the price shown on "Voice all" before the click, and the
spend afterwards (see [first-use.md](first-use.md#spend)).

**Routes.** "+ New", then "New script", or the "Script" guided flow (Idea,
Format, Voices, then "Voice your script"). In the editor, "Voice all" or a
line's "Voice line".
