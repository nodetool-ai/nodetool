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
| `study-1-I2` | The first-run connection dialog is closed unread, even by people who will need a key | 2 | `decide` | Keep it, move it to first use, or give the API key route equal weight | 2026-10-12 |
| `study-1-I3` | Asking for a model at the moment of use leads straight to key entry | 0 | `accept` | Keep the model picker and send-time routes | 2026-10-12 |
| `study-1-I4` | The script run dialog's one-line field drops line breaks in a list input | 2 | `fix` | PR 6525 gives `str` ports a multi-line field | 2026-10-13 |
| `study-1-I5` | Rail icons need hovering and status-bar terms stay unexplained | 2 | `decide` | Rail labels, and whether developer terms belong in the status bar. Study 2 adds 6 of 6 sessions that hovered or guessed the rail | 2026-10-13 |
| `study-1-I6` | Most "+ New" blank documents are hidden at 1280 × 720 with no scroll cue | 2 | `fix` | PR 6525 grows the menu to the bottom of the window | 2026-10-13 |
| `study-2-I1` | People look for rename on the item, but it exists only on the open tab | 3 | `fix` | Decided 2026-10-13: Rename on the Home card and Documents panel row (menu and inline edit). Validate with `rename-item` | 2026-10-13 |
| `study-2-I2` | "Ready-made" leads to example apps that ask for models before they run | 2 | `fix` | Decided 2026-10-13: each example card says "Runs as is" or what it needs. Validate with `run-example` | 2026-10-13 |
| `study-2-I3` | People who want larger text find only the light and dark switch | 2 | `fix` | Theme choice shipped in PR 6523. Decided 2026-10-13: a Text size setting under Settings, Appearance. Validate with `change-look` | 2026-10-13 |
| `study-2-I4` | Settings and Help live in the logo menu, where people do not look | 2 | `fix` | Decided 2026-10-13: Settings and Help also listed in the More panel. Validate with `find-help` and `change-look` | 2026-10-13 |
| `study-2-I5` | "Costs" answers the spend question at a glance | 0 | `accept` | Keep. Retest finding it from a cold start | 2026-10-13 |
| `study-2-I6` | People undo a small change by redoing it by hand | 1 | `research` | Next study: undo after a larger change | 2026-10-13 |
| `study-2-I7` | The Library's empty state leads straight to upload | 0 | `accept` | Keep | 2026-10-13 |
| `study-2-I8` | A model chosen in the message box gives no sign of where it applies | 2 | `research` | Retest with a task that ends with an answer from the chosen model | 2026-10-13 |
