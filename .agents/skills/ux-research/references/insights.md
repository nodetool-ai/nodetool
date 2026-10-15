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
| `study-1-I1` | People cannot tell that Home lists their most recent work first | 3 | `fix` | PR 6525 labels the strip most recent first and shows each card's edit time | 2026-10-13 |
| `study-1-I2` | The first-run connection dialog is closed unread, even by people who will need a key | 2 | `decide` | Keep it, move it to first use, or give the API key route equal weight. Study 3: 7 of 9 key holders used its API key route, and the 2 who closed it needed it later (study-3-I5) | 2026-10-15 |
| `study-1-I3` | Asking for a model at the moment of use leads straight to key entry | 0 | `accept` | Keep the model picker and send-time routes | 2026-10-12 |
| `study-1-I4` | The script run dialog's one-line field drops line breaks in a list input | 2 | `fix` | PR 6525 gives `str` ports a multi-line field | 2026-10-13 |
| `study-1-I5` | Rail icons need hovering and status-bar terms stay unexplained | 2 | `decide` | Rail labels, and whether developer terms belong in the status bar. Study 2 adds 6 of 6 sessions that hovered or guessed the rail. Study 3 adds 10 of 12 first looks naming the status-bar terms or the unlabeled icons | 2026-10-15 |
| `study-1-I6` | Most "+ New" blank documents are hidden at 1280 × 720 with no scroll cue | 2 | `fix` | PR 6525 grows the menu to the bottom of the window | 2026-10-13 |
| `study-2-I1` | People look for rename on the item, but it exists only on the open tab | 3 | `fix` | Decided 2026-10-13: Rename on the Home card and Documents panel row (menu and inline edit). Validate with `rename-item` | 2026-10-13 |
| `study-2-I2` | "Ready-made" leads to example apps that ask for models before they run | 2 | `fix` | Decided 2026-10-13: each example card says "Runs as is" or what it needs. Validate with `run-example` | 2026-10-13 |
| `study-2-I3` | People who want larger text find only the light and dark switch | 2 | `fix` | Theme choice shipped in PR 6523. Decided 2026-10-13: a Text size setting under Settings, Appearance. Validate with `change-look` | 2026-10-13 |
| `study-2-I4` | Settings and Help live in the logo menu, where people do not look | 2 | `fix` | Decided 2026-10-13: Settings and Help also listed in the More panel. Validate with `find-help` and `change-look` | 2026-10-13 |
| `study-2-I5` | "Costs" answers the spend question at a glance | 0 | `accept` | Keep. Retest finding it from a cold start | 2026-10-13 |
| `study-2-I6` | People undo a small change by redoing it by hand | 1 | `validated` | Study 3 `remove-restore`: 3 of 3 removed part of a timeline and restored it with undo (study-3-I7) | 2026-10-15 |
| `study-2-I7` | The Library's empty state leads straight to upload | 0 | `accept` | Keep | 2026-10-13 |
| `study-2-I8` | A model chosen in the message box gives no sign of where it applies | 2 | `decide` | Superseded by study-3-I1, which retested it with `ask-other-model` | 2026-10-15 |
| `study-3-I1` | No model is ever chosen for you, so every first request stops on a pick and nothing says which model answers | 3 | `decide` | O1 the first connected provider's first model becomes the default everywhere (recommended), O2 "No model chosen yet" and a marked current model, O3 both. 11 of 12 sessions | 2026-10-15 |
| `study-3-I2` | At 1280 × 720 the guided flows sit below the fold, so people ask the chat to make things | 2 | `decide` | O1 guided flows above the documents list on an empty project (recommended), O2 guided flows in place of the empty documents state. Retest chat requests with a real model | 2026-10-15 |
| `study-3-I3` | The picture flow's first picker is a language model captioned "Model", so people look there for a picture model | 2 | `fix` | Captions "Brief model" and "Image model" in the study 3 PR. Validate with `make-picture` | 2026-10-15 |
| `study-3-I4` | Making a picture takes three stages, and the use-case choices do not fit an everyday picture | 2 | `research` | Retest `make-picture` with a real image provider or a fixture brief that echoes the description | 2026-10-15 |
| `study-3-I5` | A model picker with no provider offers large downloads, not a place for your key | 2 | `decide` | O1 an "Add an API key" row at the top of an empty picker (recommended), O2 open the provider dialog instead | 2026-10-15 |
| `study-3-I6` | The default video export failed with encoder jargon and no way forward | 2 | `fix` | The study 3 PR turns MP4 off and chooses WebM where the browser cannot write MP4. Validate with `save-copy` | 2026-10-15 |
| `study-3-I7` | People remove a part and bring it back with undo | 0 | `accept` | Keep | 2026-10-15 |
| `study-3-I8` | A broken workflow's missing model reads from the empty field | 0 | `accept` | Keep. Next study: a fault that shows only when the run fails, to test error messages | 2026-10-15 |
| `study-3-I9` | People who set up a repeatable job look for their words in the plan | 1 | `research` | Rerun `repeat-job` with a real language model. The fake planner's fixed plan hid the answer | 2026-10-15 |
