# Music mode tracker

The orchestrator updates this file after each task changes state. It is the
single list of work for the `feat/music-mode` branch. Feature contracts are in
[contracts/](contracts/). The UI rules are in
[MUSIC_EDITOR_UI.md](../../design/MUSIC_EDITOR_UI.md).

Status values: `running`, `review`, `fix`, `queued`, `blocked`, `done`.

## Running now

| ID | Task | Model | Slot | Next step |
|---|---|---|---|---|

## Decisions accepted (user, 2026-11-22)

- D62-D68 (UI spec), D70-D104 (Step Sequencer), D105 (tool list by groups plus searchTools): accepted.
- Q20: nobody tests in Logic now; D74/D75 stand, and the keymap keeps them in one table so a later change is one edit.
- Q21: pattern regions on audio tracks come after the first version.
- Q22: factory patterns per instrument preset come after the first version.
- R15: keep the history; no rebase.
- D106 (orchestrator, per "do the most logical thing"): off macOS, Command = Ctrl, Option = Alt, Control = Ctrl+Alt. Where a Control chord collides with an Option-Command chord, the Option-Command entry keeps the key and the Control action stays in the menu only. Extension (accepted by the orchestrator): when two Control chords collide, the chord with the fewest macOS modifiers keeps the key and the other is menu-only.

## Queued

| ID | Task | Model | Depends on |
|---|---|---|---|
| P1c ([#7937](https://github.com/nodetool-ai/nodetool/issues/7937)) | Web tracks pass 5: muted Logic-like palette (current colours too saturated), thinner name band, Arp region shows no notes under the chord strip, master pan control (field done) | Opus | SQ2 (one web UI agent at a time) |
| P2 ([#7936](https://github.com/nodetool-ai/nodetool/issues/7936)) | Native polish: piano roll, automation, mixer, tracks (offscreen) | Opus | A10, D62-D68 |
| A17 ([#7941](https://github.com/nodetool-ai/nodetool/issues/7941)) | Native follow-up after A16 and A8 | Sol | A16 |
| LAB1 ([#7935](https://github.com/nodetool-ai/nodetool/issues/7935)) | Port the FableSynth LAB units (`/Users/mg/dev/fablesynth/juce/source/dsp/LabFx.h`, commit d2f68d8) as five devices: Crush, Resonator, Shifter, Spray, Glitch. Migrate old `fable:lab` documents to the enabled units. Compare each unit with a LabFx.h reference render (max error 1e-5 at 44.1/48/96 kHz). Until then LAB has a UI but no DSP. Partial work: [lab1-wip.patch](lab1-wip.patch). Prompt: [lab1-prompt.md](lab1-prompt.md) | Neon | none |
| DSP1w ([#7938](https://github.com/nodetool-ai/nodetool/issues/7938)) | Web parity for DSP1: master.limiter field and tool, clip indicator, 16-bit dither in web export (D21) | Neon | DSP1 |
| DSP3 ([#7939](https://github.com/nodetool-ai/nodetool/issues/7939)) | Pan law project setting 0/-3/-4.5 dB and stereo balance (F9) | Neon | DSP2 |
| SQ3c ([#7940](https://github.com/nodetool-ai/nodetool/issues/7940)) | Step Sequencer: hardware MIDI input for Learn and Step Input (S1), step-record CC values, live pattern recording (SQ39), MIDI Out audition, Step Input cursor stops at the last row | Sol, then Opus | native MIDI input |
| MOD2 ([#7930](https://github.com/nodetool-ai/nodetool/issues/7930)) | Modal synth: one shared table worker pool instead of one thread per modal track (WIRE1 F1) | Neon | none |
| MIX1 ([#7931](https://github.com/nodetool-ai/nodetool/issues/7931)) | tst_mixerhooks::expandsAndSilencesSegments fails: default master limiter gives 0.7356, test expects 1.0 unity DC | Sol | none |
| CHK2 ([#7932](https://github.com/nodetool-ai/nodetool/issues/7932)) | tst_tracksui: saveBannersFollowTheRealController fails; filmstripTexturesSurviveASceneGraphInvalidation needs a window label | Sol | none |
| SHOT1 ([#7934](https://github.com/nodetool-ai/nodetool/issues/7934)) | Opus screenshot pass of the DSP2 export dialog (bit depth, sample rate) | Opus | none |
| UI3 ([#7933](https://github.com/nodetool-ai/nodetool/issues/7933)) | Wide effect cards (EQ 1040 px) scroll sideways in the default dock: compact layout | Opus | none |
| CHK ([#7942](https://github.com/nodetool-ai/nodetool/issues/7942)) | Rerun lost native checks: A2, A2b, A5, A7 | Sol | none |
| CRV ([#7943](https://github.com/nodetool-ai/nodetool/issues/7943)) | Lost Codex second reviews: A14, A2b | Sol | none |

## Done

| ID | Task | Evidence |
|---|---|---|
| A6 | Native control bar and toolbar | My check passed |
| A8 | Native piano roll LP1-LP21 (LP14 skipped), fix rounds | UI 73, MIDI 51, ctest 3/3 |
| A11 | Web automation | 21/21 findings fixed |
| A12 | Native automation AU1-AU9; agy F1-F17 + Sol F18-F19 fixed in 2 Sol rounds (F4 rejection sound), closure: all closed, 1 new (F20 -> A16) | automation 21, automation UI 87, ctest 4/4; no audio-thread race found |
| A13-A15 | Chords, audio chords, web chord UI and tools | Jest, vitest, tsc clean |
| A18-A21 | CE1-CE3, CE5, CE8 and UI gaps | Reviewed by agy and Codex |
| A20 | CE4 section edits, `paste_range` (D61), 4 review rounds | timeline 3191, web, agents green |
| A22 | CE6 region params, CE7 auto crossfade, 2 fix rounds | timeline 216, web 46, agents 147 |
| A26 | Research: Step Sequencer manual (pages 724-760 + 15 related, 40 figures), model guidance | scratchpad logic-manual/, model-guidance.md |
| SQ0 | Step Sequencer contract, 57 items, D70-D104 | [step-sequencer-contract.md](contracts/step-sequencer-contract.md) |
| A25 | Agent parity: 109 actions, 62 covered before, 26 closed, 10 gaps, 11 excluded | [agent-parity.md](agent-parity.md); timeline 346, agents 407, web 186; agy review F1-F14 and Sol F15-F16 fixed by agy Neon in 2 rounds (agents 269, web 294) |
| A10 | Native Step Editor; A8 F20, F25, F26 fixed; agy F1-F18 + Sol F19-F21 fixed in 2 Sol rounds, closure review clean (MIDI Out removed) | tst_pianorollui 117, tst_midinotes 52, ctest 3/3 |
| P1 | Web tracks pass 3: D62-D68, note lines, loop repeats, menu, header, range token, mixer 72px, velocity lane 96 | 13 suites 135 tests, web tsc 0; polish-tracks3/ |
| SQ1 | Step Sequencer TS: model, seeded expansion, render parity, 24 factory patterns, 27 ops and agent tools; D105 | red per slice; vitest 799, web Jest 266, tsc 0 in 5 packages; agy F1-F37 + Sol F38-F42 fixed by Neon in 2 rounds, closure review: all closed, 2 new (F43, F44) fixed with master pan field (web 364, agents 249, timeline 93) |
| P1b | Web tracks pass 4: track colours, note contrast, 64px rows, mixer gaps | 12 suites 92 tests, web tsc 0; polish-tracks4/ |
| SQ2 | Step Sequencer web UI: SQ27-SQ38, SQ40, SQ43, SQ46; left: SQ39 recording, row assignment/reorder/marquee, browser folders and drag | Jest 42 + 12, web tsc 0; sq2-shots/ |
| P2a | Native piano roll and Step Editor polish 1: flat notes with velocity line, grid weights, octave labels, velocity lane 96, collapsible inspector | tst_pianorollui 118, ctest 3/3, check_design clean; polish-native-pr/after/ |
| SQ43f | Pattern library folder ops + `rowSort` field, all layers | protocol 21, timeline 195, agents 291, web 71, tsc 0 |
| SQ2 | Step Sequencer web UI, 9 rounds (agy F1-F46, Sol F47-F63), closure: 1 open + 1 new -> SQ2tail | commits 62a6054f2c, 00f13b6c17; stepSequencer suites 371-448 green |
| P2b | Native piano roll pass 2: keyboard seams, round velocity heads, selected tint, note names, Step Editor inspector sections | ctest 3/3, check_design clean; polish-native-pr2/ |
| SQ1c | Native Step Sequencer engine, agy F1-F26 fixed in 2 Sol rounds | f443b2f8a8 |
| A23 | Native clip editing part 1, round 2 after a dead Codex thread | f443b2f8a8 |
| P2c | Note Labels off by default, velocity scale | f443b2f8a8 |
| P3 | Opus native design pass: Step Editor, automation, clip loops | d6577a43b4 |
| P3b | Muted clip colours, software-backend note lines, fx badge, toolbar load fix (Sol) | musicui, midinotelines, automationui green; pushed |
| F2 | CMake explicit module and QML lists; new QML file builds with no regeneration | d7746c0f01 |
| MX1 | Mixer values change while dragging (native fix, web test); Neon F16-F23 fixed | 6643214478, 675873bd24 |
| VST1 | Agent VST tools (list, load, presets, parameters), TS/electron/web; Neon F1-F15 fixed; Sol closure clean | 70a68ffe6e, ae33ccadb4 |
| VST2 | Native VST: AU scan, presets, parameters, assistant tools; Sol F25-F34 fixed in 4 rounds; closure: 2 new -> VST3 | d6f92a9818..fbcb91a258 |
| A24 | Native clip editing CE5-CE8; Neon F1-F22, 2 Sol rounds; closure: 2 new -> SQ3b, F13 rest -> A24b | c81e8860f1, 393287395f, b7a0b07d4b |
| SQ3 | Native Step Sequencer panel, row model, 32 pattern tools; Neon F1-F26 (3 disputes upheld by Sol), F27-F30, 2 Opus rounds | same commits; tst_stepsequencerui 25, tst_patternops 41 |
| VST3 | VST state sync F35/F36, master fader preview F24; Neon V1-V10, 3 Sol rounds, closure: 2 new fixed | 80da682fb6; vst and automation ctest 9/9 |
| SQ3b | Step Sequencer 1/2-step lengths, effect rows, Learn, step input, user library; Neon S1-S18, Sol closure (S3, S18 disputes upheld), N1-N2 fixed; Opus visual pass | bdf3048a0c; ctest 6/6; sq3b-shots/after2/ |
| WEB-GRIP | Fade-in grip below the clip name; vst effect kind in web tables | 0bc0f014e8, 9bf8697655 |
| A16 | Native automation: F20, AU6, Neon A1-A8 in 2 Sol rounds; Opus UI AU1-AU5 (curve icon, mode fill, lane dot, whole-lane tint, name bar owns clip gestures) | f41f234e79; automation ctest 9/9 |
| A24b | Native set_clip_params parity: source window, group duration, style fields; Neon C1-C22, Sol closure N1-N2; A24n native follow-ups | d2eeb36270, 1534368a05; ctest 3/3, 215 checks |
| A24t | TS set_clip_params matches native: C1-C22, N1-N3; saved documents stay editable | 4cd81cec81; timeline 285, web 78, examples 0 schema failures |
| DSP1 | PDC (live, offline, voices, automation shift), master true-peak limiter with live toggle and clip latch, 16-bit TPDF dither, denormal guards; Neon D1-D20 in 3 rounds, 2 Sol closures; D5 -> DSP1b | c111511a18; audio ctest 25/25, vst-host 4/4 |
| A22r | CE6/CE7 second review: CE6 met; R1 stored zero fades, R2 short-overlap crossfade fixed in TS | 6d57939fd3; vitest 32 |
| A27 | Model routing rule | [agent-model-routing.md](../../agent-model-routing.md), check:agents-docs exit 0 |
| RA | Reviewer model analysis | [review-model-analysis.md](review-model-analysis.md) |
| UI | Music editor UI spec | [MUSIC_EDITOR_UI.md](../../design/MUSIC_EDITOR_UI.md) |
| PW1 | Web polish: tracks area passes 1-2, chord and automation 1-3, piano roll 1-4 | Screenshots in session scratchpad |

## Backlog (needs a decision before work)

- Later: sends, aux return tracks, buses and groups (DSP audit F2). Needs a contract first: document, protocol, both mixers, agent tools.
- Nice-to-have: 64-bit summing bus (DSP audit F10). No audible gain.
- Alias clips, bounce in place, audio glue, reverse, web normalize, comping, audio that follows tempo.
- Crossfades between internal repeats of a looped audio region.
- `dropResolve` and `rippleEdit` callers without the tempo offset (partly fixed in A22 round 2).
- Range menu keyboard shortcuts. Loop cursor. Translations of new strings.
- R1-R14 and Q1 (MPE) from earlier sessions.

## Decisions log

D27-D61 are recorded in the contracts. D60: section edits write
automation boundary points. D61: one atomic `paste_range` op. D69: a split
skips an unlinked clip that cannot be split and refuses only a linked group.
