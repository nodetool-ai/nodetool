# Insight log

This page is for the researcher. Never give it to a participant.

Every insight from every study, with its current status. Read it before
planning a study and update it in the same change as a study's readout. See
[synthesis.md](synthesis.md#follow-up) for the statuses.

An insight keeps its first ID for life, prefixed with its study:
`<study>-I1`. A validation study updates the row. It does not add a new one
for the same behavior.

| ID | Insight | Severity | Status | Next step or evidence | Updated |
|---|---|---|---|---|---|
| `study-1-I1` | People cannot tell that Home lists their most recent work first | 3 | `validated` | Study 4: holds at 1440 × 900 in 5 sessions. At 1280 × 720 the card edit times are cut off (study 4 D7) | 2026-10-15 |
| `study-1-I2` | The first-run connection dialog is closed unread, even by people who will need a key | 2 | `decide` | Keep it, move it to first use, or give the API key route equal weight. Study 3: 7 of 9 key holders used its API key route, and the 2 who closed it needed it later (study-3-I5). Study 4: 15 of 19 used the API key route at once | 2026-10-15 |
| `study-1-I3` | Asking for a model at the moment of use leads straight to key entry | 0 | `accept` | Keep the model picker and send-time routes | 2026-10-12 |
| `study-1-I4` | The script run dialog's one-line field drops line breaks in a list input | 2 | `fix` | PR 6525 gives `str` ports a multi-line field | 2026-10-13 |
| `study-1-I5` | Rail icons need hovering and status-bar terms stay unexplained | 2 | `decide` | Rail labels, and whether developer terms belong in the status bar. Study 2 adds 6 of 6 sessions that hovered or guessed the rail. Study 3 adds 10 of 12 first looks. Study 4 adds 6 of 22 first looks. Study 6 adds 3 of 3 `keep-answer` sessions that hovered to find "Chats" | 2026-10-16 |
| `study-1-I6` | Most "+ New" blank documents are hidden at 1280 × 720 with no scroll cue | 2 | `fix` | PR 6525 grows the menu to the bottom of the window | 2026-10-13 |
| `study-2-I1` | People look for rename on the item, but it exists only on the open tab | 3 | `validated` | Study 4 `rename-item`: 3 of 3 renamed in 4 or 5 actions, ease 7, 7 and 7, all by double-clicking the open tab | 2026-10-15 |
| `study-2-I2` | "Ready-made" leads to example apps that ask for models before they run | 2 | `fix` | Study 4: badges read correctly, but Examples opens on Apps, where every card in view needs models, and C2 never ran anything. Chosen 2026-10-15: the study 4 PR lists "Runs as is" items first on the Apps, Workflows and Storyboards tabs. Validate with `run-example` | 2026-10-15 |
| `study-2-I3` | People who want larger text find only the light and dark switch | 2 | `validated` | Study 4 `change-look`: 3 of 3 set Text size in 4 to 6 actions, ease 7, 7 and 7 | 2026-10-15 |
| `study-2-I4` | Settings and Help live in the logo menu, where people do not look | 2 | `validated` | Study 4 `find-help`: 3 of 3 found Help or Tutorials, 2 through More. With a workflow open, More lists them low | 2026-10-15 |
| `study-2-I5` | "Costs" answers the spend question at a glance | 0 | `accept` | Keep. Retest finding it from a cold start | 2026-10-13 |
| `study-2-I6` | People undo a small change by redoing it by hand | 1 | `validated` | Study 3 `remove-restore`: 3 of 3 removed part of a timeline and restored it with undo (study-3-I7) | 2026-10-15 |
| `study-2-I7` | The Library's empty state leads straight to upload | 0 | `accept` | Keep | 2026-10-13 |
| `study-2-I8` | A model chosen in the message box gives no sign of where it applies | 2 | `decide` | Superseded by study-3-I1, which retested it with `ask-other-model` | 2026-10-15 |
| `study-3-I1` | No model is ever chosen for you, so every first request stops on a pick and nothing says which model answers | 3 | `fix` | Study 4: validated for language models (21 of 21 composers, 3 of 3 node fields). The picture flow's image model stayed blank in 3 of 3. The study 4 PR fills it from the default. Validate with `make-picture` | 2026-10-15 |
| `study-3-I2` | At 1280 × 720 the guided flows sit below the fold, so people ask the chat to make things | 2 | `validated` | Study 4: on an empty project at 1280 × 720 the flow titles are on the first screen in 4 of 4, with the cards cut. With documents present they drop below the fold | 2026-10-15 |
| `study-3-I3` | The picture flow's first picker is a language model captioned "Model", so people look there for a picture model | 2 | `validated` | Study 4 `make-picture` and `change-photo`: 0 of 5 looked for a picture model in the "Brief model" picker | 2026-10-15 |
| `study-3-I4` | Making a picture takes three stages, and the use-case choices do not fit an everyday picture | 2 | `research` | Retest `make-picture` with a real image provider or a fixture brief that echoes the description. Study 4: ease 3, 4 and 4 | 2026-10-15 |
| `study-3-I5` | A model picker with no provider offers large downloads, not a place for your key | 2 | `validated` | Study 4 `fix-broken`: D1 used the "Add an API key" row at once. The provider filter not filtering downloads is study-4-I1 | 2026-10-15 |
| `study-3-I6` | The default video export failed with encoder jargon and no way forward | 2 | `fix` | The study 3 PR turns MP4 off and chooses WebM where the browser cannot write MP4. Validate with `save-copy` | 2026-10-15 |
| `study-3-I7` | People remove a part and bring it back with undo | 0 | `accept` | Keep | 2026-10-15 |
| `study-3-I8` | A broken workflow's missing model reads from the empty field | 0 | `accept` | Keep. Study 4 `fix-error` answered the run-error question (study-4-I2) | 2026-10-15 |
| `study-3-I9` | People who set up a repeatable job look for their words in the plan | 1 | `research` | Rerun `repeat-job` with a real language model. The fake planner's fixed plan hid the answer | 2026-10-15 |
| `study-4-I1` | The model picker's provider filter left the downloads in the list, so people thought it was broken | 2 | `fix` | The study 4 PR limits downloads to the selected provider and hides them in Favorites and Recent. Validate with `fix-error`. 4 of 4 who clicked a provider | 2026-10-15 |
| `study-4-I2` | A run error is understood and fixed, but the node never shows the provider it needs | 2 | `fix` | O1 chosen 2026-10-15: the study 4 PR names the provider on every language and image model field and warns when its key is missing. Validate with `fix-error` | 2026-10-15 |
| `study-4-I3` | People ask the chat to change their photo, and the editing route is hard to find | 2 | `research` | Rerun `change-photo` with a chat model that calls tools. 1 of 3 made a version, in 33 actions | 2026-10-15 |
| `study-4-I4` | The home composer does not read as a place to ask a question | 2 | `fix` | O3 chosen 2026-10-15: the study 4 PR says on the home box that it answers questions, and gives the empty Chats panel a "New chat" button. Validate with `ask-file` | 2026-10-15 |
| `study-4-I5` | A text file attached with "@" showed as a reference image with a broken picture | 2 | `fix` | The study 4 PR shows a non-image file as a named chip outside the reference image count. Validate with `ask-file` | 2026-10-15 |
| `study-4-I6` | A video plan with a picture per scene is found and finished from the first screen | 0 | `accept` | Keep the separate render step. 3 of 3, ease 5, 5 and 5 | 2026-10-15 |
| `study-5-I1` | People extend a step with "Add output", and then its original Text output goes empty without a word | 3 | `fix` | O1 chosen 2026-10-16: the study 5 PR gives Text the submitted answer when the model writes no prose. 7 of 7 `add-step` used "Add output". Validate with `add-step` | 2026-10-16 |
| `study-5-I2` | An Output that a finished run sent nothing to looks as if nothing ran | 2 | `fix` | The study 5 PR shows "The last run sent nothing here". Validate with `add-step` | 2026-10-16 |
| `study-5-I3` | Speech is hard to find, and once found no speech model is chosen | 3 | `fix` | 0 of 3 got a clip in 20 actions. The study 5 PR seeds the speech default on connection and voices unvoiced Script speakers. Both entry points chosen 2026-10-16: a "Read aloud" card on home and in "+ New" opens a chat in speech mode with the typed line, and the composer mode is renamed "Read aloud". Validate with `read-aloud` | 2026-10-16 |
| `study-5-I4` | A new sketch starts with white ink on a white canvas, and again on every reopen | 2 | `fix` | Contrasting ink chosen 2026-10-16: the study 5 PR gives an image's sketch black ink on a light image and white on a dark one, and the color swatch shows the saved ink on reopen. Validate with `draw-by-hand` | 2026-10-16 |
| `study-5-I5` | People cannot tell what "Done" and "Save to image" each do in the sketch editor | 2 | `fix` | "Done saves" chosen 2026-10-16: the study 5 PR saves to the image before "Done" leaves the editor, and stays when saving fails. Validate with `draw-by-hand` | 2026-10-16 |
| `study-5-I6` | An old conversation is found by meaning in the Chats panel and continued in place | 0 | `accept` | 3 of 3 in 5 actions, ease 6, 6 and 6 | 2026-10-16 |
| `study-5-I7` | "Project" reads at once as the place for a client's work | 0 | `accept` | 3 of 3, ease 6, 6 and 6. Creating a project closes open tabs silently (defect) | 2026-10-16 |
| `study-5-I8` | At 1024 × 768 side panels crowd out the work | 2 | `research` | 4 of 4 sessions at 1024 × 768 that opened a side panel. Study 6 adds 4 of 4 at 960 × 1000 (study-6-I10). Retest at 1024 × 768 after a narrow-width pass | 2026-10-16 |
| `study-6-I1` | People who want a tool for someone else never reach a working app | 3 | `decide` | 0 of 3 `make-tool`. 2 of 3 never opened "+ New". The one in the builder read "This app binds no workflow yet." as "build a workflow elsewhere" and never found "App Data". Options: an action on the unbound app that makes and binds its workflow (favoured), an "App" guided flow, or routing app requests to the App Builder | 2026-10-16 |
| `study-6-I2` | The home box promises to build, so people send build requests to the chat first | 2 | `research` | 7 of 9 sessions with a making task asked the chat first. Rerun `make-tool` and `make-game` with a real language model, since the fake chat never calls a tool | 2026-10-16 |
| `study-6-I3` | A first photo dropped on an empty timeline landed 3.4 s late, out of sight | 3 | `fix` | 2 of 2 Library drags. The study 6 PR keeps the track header column's width with no tracks, so the lanes start at the ruler's zero, and the empty hint names the Library. Validate with `photo-video` | 2026-10-16 |
| `study-6-I4` | Dropping the second photo on the first cuts the first, and nobody notices | 2 | `decide` | 2 of 2 Library drags. Options: snap a drop in a clip's last part to its end (favoured), keep overwrite with a "Trimmed" notice and undo, or default to insert | 2026-10-16 |
| `study-6-I5` | The Video guided flow builds a photo sequence with no drag, but few find it | 0 | `research` | 1 of 3, in 15 actions. Called "Video" on home and "Timeline" in "+ New". Watch with `photo-video` | 2026-10-16 |
| `study-6-I6` | The game maker is found late, after the chat, a skill chip or an empty tab | 2 | `decide` | 3 of 3 looked elsewhere first. "More formats" is below the fold at 1366 × 768. Options: "Make a game" in the empty Games filter plus "More formats" on the first screen (favoured), or Game among the first four flows | 2026-10-16 |
| `study-6-I7` | Once in the Game flow, people reach a playable game, and none use the blank room | 0 | `accept` | 2 of 2 who passed the design built it, and D3 played. 0 of 3 used "Start with a blank room". No text names the controls (defect) | 2026-10-16 |
| `study-6-I8` | An assistant's answer is kept in the conversation list, and people expect that | 0 | `accept` | 3 of 3 reopened the note from "Chats", ease 5, 6 and 5. Nobody looked for "save as file" | 2026-10-16 |
| `study-6-I9` | A new folder vanished from the Library panel after "Create" | 3 | `fix` | 3 of 3, about 7 actions each. The study 6 PR shows the folder tree after "Create" and selects the default name. Validate with `sort-photos` | 2026-10-16 |
| `study-6-I10` | In a half-screen window (960 × 1000), panels crowd out the work | 2 | `research` | 4 of 4 sessions at 960 × 1000, 3 of them reached the end state. Adds to study-5-I8 | 2026-10-16 |

