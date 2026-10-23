---
layout: page
title: "UX Guidelines"
permalink: /ux-guidelines
description: "NodeTool UX guidelines — rules for entry points, models, saving, empty states, errors, labels, and small windows, drawn from the UX research studies."
---

# NodeTool UX Guidelines

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [Design System](DESIGN.md) | [Brand & Verbal Guidelines](BRAND.md) → **UX Guidelines**

How a NodeTool screen should behave for someone who has never seen it. The
rules come from the UX research studies: blind agent sessions on a
disposable copy of the app, each working out the UI from screenshots. Every
rule cites the insight it comes from. The insight log, with evidence counts
and current status, is
[`.agents/skills/ux-research/references/insights.md`](../.agents/skills/ux-research/references/insights.md).

[DESIGN.md](DESIGN.md) covers how a screen looks (tokens, primitives).
[BRAND.md](BRAND.md) covers what the copy says. This file covers whether a
person can find the thing, understand it, and keep their work.

The evidence has limits. Participants were agents, not people, and ran
against fake providers whose chat never calls a tool. Agents know Markdown
and keyboard shortcuts better than most newcomers. Treat a rule as a strong
default, and treat a question in [section 9](#9-open-questions) as open.

## 1. Start points

### 1.1 Name an entry point by what the person wants, not by its format

People look for the outcome in their own words: "read this aloud", "a note",
"a page a colleague can use", "a game". They pass over a format name, a file
extension, or an internal term.

- "Script" ("From a topic to voiced lines") sat on screen and was never read
  as speech, and 0 of 3 got a clip in 20 actions (`study-5-I3`). A "Read
  aloud" card now names the goal.
- A note meant "New text file…" and a list of file extensions, which "felt
  aimed at developers" (`study-7-I3`).
- "New app" under "Blank documents" was found by 1 of 3 who wanted a tool for
  someone else (`study-6-I1`).

Check: read each new entry's label aloud as a goal ("I want to …"). If it
only makes sense to someone who knows the document model, rename it or add a
guided card that names the goal.

### 1.2 Say what the home box does

The big composer is the first place people try for everything, questions and
builds alike. When its copy promises one job, people doubt it for the other.
7 of 9 sessions with a making task sent it to the home chat first
(`study-6-I2`). 2 of 3 skipped it to ask a question because it read
as a document builder (`study-4-I4`). Its placeholder and lede name
both jobs.

### 1.3 Put the main routes on the first screen at laptop sizes

A route below the fold at 1280 × 720 or 1366 × 768 does not exist for most
first sessions. People ask the chat instead of scrolling.

- Guided flows below the fold sent 2 of 2 small-window sessions to the chat
  (`study-3-I2`).
- The Game card, eighth behind "More formats", was found after the chat, a
  skill chip, or an empty tab in 3 of 3 (`study-6-I6`).
- "+ New" showed 4 of 12 blank documents at 1280 × 720 with no scroll cue
  (`study-1-I6`), and is still cut mid-row at 1280 × 800 (study 7
  defects).
- A kind folded behind "Explore all creation types" is found when the bar's
  subtitle names the person's word: "games" and "read aloud" were opened in
  3 of 3 each (`study-10-I2`). It is missed when a first-screen card
  matches better: 0 of 3 who wanted a picture per scene opened it, and all
  took "Create video" (`study-10-I1`).
- People who want something ready-made unfold that bar too: 5 of 9 did, and
  the 3 whose job was a text rewrite asked the chat when no example was
  there. With a "Ready-made examples" card in it, 8 of 8 reached the
  examples (`study-13-I1`).
- Unfolding a list scrolls what it reveals into view. At 1280 × 720 the only
  new thing in view was an unlabelled control (`study-10-I3`).

Check: screenshot the screen at 1280 × 720 with and without documents in the
project. Every route the change adds must be visible or announced there.

### 1.4 Say before a run what a ready-made item needs

An example that stops on a setup step reads as broken. A card that says
"Runs as is" is chosen on that word (`study-2-I2`). Badge each
example with what it needs, and list the ones that run as they are first.
When none runs as is, list the ones that need the least setup first: the
Apps tab opened on ad-format apps needing two kinds of model, and 0 of 9
participants used an example app (`study-12-I1`). Once opened, an
example's note names the field that sets its behavior. 3 of 3 who turned a
German translator into a French one had to find "German" in a System field
nothing pointed to (`study-13-I4`). A description also says what the item
does not take: 3 of 3 who wanted an ad from their own photo opened Ad Maker
first and learned only at its second step that it takes no photo
(`study-14-I3`). Every field an example app shows reaches its run. 17 of 33
apps dropped their named parameters, so a chosen model read as missing
(`study-14-I1`).

### 1.5 Label navigation, and put Settings and Help where people look

Icon-only rail buttons cost hovering or guessing in every study, and the
person icon read as Settings 3 of 3 times (`study-1-I5`, open
decision). Settings and Help were missed while only in the logo menu, and
found once the More panel listed them (`study-2-I4`). A new
destination gets a visible text label or a place in a labeled menu, never an
icon alone.

### 1.6 Say how a list is ordered and when each item changed

People guessed that Home lists recent work first and were right, but rated
the guess 3 of 7 (`study-1-I1`). Label the order and show an edit
time on each card, including on compact cards at 1280 × 720.

## 2. Models and keys

### 2.1 Ask for a key at the moment a model is needed

Every participant with a key found where to enter it from a missing model:
"No models available ... Open Settings" or the "Connect an AI provider"
dialog on send (`study-1-I3`). Keep those routes on every surface
that needs a model. Whether the first-run dialog stays is an open decision
(`study-1-I2`).

### 2.2 Once a provider is connected, choose a model of every kind

A connected key with nothing selected stopped every first request on a pick,
on every surface (`study-3-I1`). After the language default
shipped, the picture flow's image model stayed blank and failed a session
(study 4, D1). The speech model stayed blank next (`study-5-I3`), then the
Video flow's voice (study 10, D1), then the storyboard's per-shot render
dialog while its batch dialog was filled (`study-11-I4`).
A new model kind, a new picker or a new flow reads the Settings default for
its kind, and connecting a provider seeds that default. An example app's model
fields are pickers too: people picked the same model in four fields
(`study-12-R2`).

### 2.3 Show which model is current, the same way everywhere

People could not say which model answered, and took their first pick for a
switch (`study-3-I1`). A pin from the composer and a check from a
node read as different things (study 4, D6). Every picker marks the current
model with the same mark.

### 2.4 An empty picker leads with connecting a provider

With no provider, a picker that opened on 14 GB local downloads sent 2 of 2
participants searching before they found "Add providers" at the bottom
(`study-3-I5`). Its first row offers an API key.

When the step needs a capability only some providers have, such as removing
a background, the setup offers only those providers and says why. Offered
every image provider, 2 of 2 connected OpenAI, and the picker reopened the
same dialog until the budget ran out (`study-12-I4`).

### 2.5 A filter filters everything in the list

A provider filter that left the downloads in place read as broken in 4 of 4,
and made the one matching model look like a header (`study-4-I1`).
Every section under a filter, favorites or recent view obeys it.

### 2.6 Caption each picker by its job

Two pickers both captioned "Model" sent 3 of 3 looking for a picture model in
the language picker (`study-3-I3`). Write "Brief model" and "Image
model", not "Model" twice.

### 2.7 Show a node's provider and a missing key before the run

People read a credential error well, but only after a failed run, because the
node never showed which provider its model needed (`study-4-I2`).
Name the provider on every model field and warn when its key is missing.

## 3. Keep the person's work

### 3.1 Leaving an editor never drops what is on screen

Switching to View, closing a tab or pressing "Done" must keep the draft.

- "View" before "Save" threw away a text file's draft in 3 of 3, all of whom
  named it the hardest moment (`study-7-I1`).
- "Done" and "Save to image" were indistinguishable, and "Done" left a blank
  image (`study-5-I5`). "Done" now saves.

Most NodeTool documents save as you go, so people assume all of them do. A
surface that does not autosave saves on close.

### 3.2 An action changes only what the person aimed at, or says what else it changed

A side effect nobody sees is a lost result.

- "Add output" on an Agent moved its answer to the new output and left the
  original output empty in 3 of 3 (`study-5-I1`).
- Dropping a photo inside the previous clip trimmed that clip without a word
  in 2 of 2 (`study-6-I4`). The drop now snaps to the clip's end.
- Creating a project closed the open tabs silently (study 5 defects).
- A new overlay track went under the full-frame video, so a title on it
  never showed in 3 of 3 (`study-16-I1`). A new layer goes where it is seen.
- Dragging a picture onto another to reorder replaced it in 3 of 3, and
  people found out only by reading clip names (`study-16-I3`).

Do what the person meant. Where the side effect must stay, show it with an
undo ("Trimmed beach-morning.jpg by 1.8 s").

### 3.3 Put the result where the person put it

A drop lands under the pointer. A first photo that landed 3.4 s late, outside
the visible lane, cost one participant 8 of 24 actions
(`study-6-I3`). New 3D shapes at the origin appeared inside the
table top in 3 of 3 (`study-7-I4`).

### 3.4 Show what was just created, ready to edit

A new Library folder that did not appear after "Create" made 3 of 3 doubt it
worked, at about 7 actions each (`study-6-I9`). The default name
was not selected, so replacing it cost 2 more actions. After a create, the
new item is on screen with its name selected.

Opening an example makes a copy with the example's name. Say that it is a
copy and that the example is unchanged: 3 of 3 who changed an example could
not tell whether saving had changed the original (`study-12-I5`).

The same holds on the canvas. Nodes added from the toolbar's menu all landed
at the window's top left, under the tab bar and on the node before, and 2 of
3 spent up to 10 actions moving them apart (`study-9-I1`). A new node lands
in view and clear of the nodes already there.

### 3.5 Confirm a save or export where the person is looking

A dot on the bell was the only confirmation for 2 of 2 who pressed "Save to
image" (`study-5-I5`), and an export that finished without a message left
only the browser's download bar (study 3, D12). Say it in a toast or inline,
and name the file. A save never reports itself as a change made elsewhere:
the app editor raised "changed outside the editor" on every Save, and the
person clicked Discard, unsure which button kept the edit (`study-14-I5`).

### 3.6 Keep undo on every removal

With a removal, people reach for undo first: 3 of 3 restored a deleted clip
with the undo arrow (`study-3-I7`). With a small edit they retype
it by hand (`study-2-I6`). A surface that can delete can undo.

### 3.7 A default produces a visible result

White ink on a white canvas cost 3 of 3 one or two actions before the first
stroke
(`study-5-I4`). Choose defaults so the first try shows something:
ink that contrasts with the canvas, a camera that keeps the selection in view
after a move (`study-7-I4`), and a node that starts with the inputs it needs
(a new Concat showed no inputs to 3 of 3, `study-9-I2`).

## 4. Empty states, outcomes and errors

### 4.1 An empty state offers the next step in place

The Library's "Drop files here or use the upload button" took 3 of 3 straight
to upload (`study-2-I7`). These failed:

- The empty Chats panel said "Start a chat from the workspace New menu." and
  cost 3 actions (`study-4-I4`). It now has "New chat".
- "This app binds no workflow yet." explained the gap and offered no way to
  close it (`study-6-I1`).

An empty state names the action and is the button for it.

### 4.2 Where people look to add something, they can create it

3 of 3 opened the composer's "Entities" picker to make a character, and it
could only select (`study-7-I2`). A picker that can be empty
offers "New …" when it is empty or the search matches nothing.

### 4.3 A finished run that sent nothing to an output says so

An Output that kept "Run to see the output" after a completed run looked
unrun, and 2 of 7 ran the workflow again (`study-5-I2`). After a
run, an empty output reads "The last run sent nothing here".

### 4.4 Prevent the error, and when it happens, say what to do

- The default MP4 export failed for 3 of 3 with "This specific encoder
  configuration (avc1.640028 …) is not supported" (`study-3-I6`).
  The dialog now checks the encoder first and turns MP4 off where it cannot
  work.
- The credential error worked because it named the provider, the key and the
  alternative: "switch the model to a provider you have configured"
  (`study-4-I2`).
- A failed storyboard download showed `{"detail":"Not found"}`, and 3 of 3
  could not tell what was missing (`study-11-I3`).
- A failed example app step said only "Example app operation failed"
  (`study-14-I2`). Show the reason the server gave.

An error message names the cause in the person's terms and the next action.
It never shows encoder strings, stack traces, storage paths or model ids as
the explanation.

### 4.5 An error clears when its cause is fixed, and never covers the fix

"Error · Retry" stayed on the run button after the model was changed, and the
error toast covered the Model field people had to change (study 4, D4 and
D5). Reset the error state on the next edit, and place toasts clear of the
control the message is about.

### 4.6 A search with no match says what it searched

2 of 3 searched "release" in Documents, which lists workflows and apps only,
and read "No matching documents" as "not there" (`study-7-I5`).
No-match text names its scope and where else to look.

A search matches other forms of a word ("compare" finds "comparison"), and
a gallery's search names matches on its sibling tabs. 3 of 3 searched the
workflow examples for "compare" and missed Model Arena, and 6 of 9 searched
a tab that held no apps (`study-12-I1`, `study-12-I2`). An example's
description uses the words people search with for its job, not only the
product's: "email" missed a "support thread" example in 2 of 2, and
"simple" and "simplify" missed a "plain language" one (`study-13-I2`).

### 4.7 A disabled control says why

"Create" stayed grey with no reason until an unmarked field was filled
(`study-7-I2`), and the Video flow's "Continue" did the same
(study 6 defects). A storyboard's grey "Preview" was pressed by 3 of 3, who
could not tell it was off (`study-11-I2`). Mark required fields, and give a disabled primary action a
reason the person can read without hovering.

The same holds for a run the app blocks. A run stopped for a missing model
said so only in the notification bell, and 3 of 3 who pressed it saw
nothing happen (`study-12-I3`). Show the reason as a toast as well.

## 5. Words on screen

### 5.1 One name per thing, on every surface

People search for the word they last read. "Drag media here from Assets" sent
2 of 2 looking for a panel called Library (`study-6-I3`). The same
flow was "Sketch", "Image" and "New image" in one session (study 3, D1), and
"Video" on home but "Timeline" in "+ New" (study 6 defects). Before adding a
label, search the UI for the existing name of the thing.

### 5.2 Keep developer terms off a newcomer's screen

"worker:local", "Queue", "Workers", "Trace" and unlabeled icons were the
words first looks named as unclear, in 10 of 12 sessions in study 3
(`study-1-I5`). Raw storage paths, model ids and developer skills
in the home list read as noise (study 3, D4 and D5). Show these only where a
person asked for diagnostics.

### 5.3 A button says what it does, and two buttons never sound alike

"Done" and "Save to image" both sounded like finishing, and only one saved
(`study-5-I5`). If two actions could be confused, merge them or
name the difference ("Save and close").

### 5.4 An input fits the data it takes

A one-line field for "one benefit per line" joined the lines silently in 3 of
3 (`study-1-I4`). A text file attached with "@" showed as a broken
reference image (`study-4-I5`). Multi-line data gets a multi-line
field, and a file shows as what it is. An attach control takes every kind
of file its box can use: the home box's "Reference images" refused a notes
file in 2 of 3, and 3 of 3 left for the Library to upload it
(`study-15-I1`).

## 6. Acting on items

### 6.1 Offer an item's actions where the item is shown

3 of 3 looked for rename on the Home card, the list row or the heading, and
it existed only on the open tab (`study-2-I1`). Rename, duplicate
and delete belong on every surface that lists the item: card, row and tab.
Conversations repeated it: 3 of 3 right-clicked or double-clicked the Chats
row to rename, and with a rename button on the row 3 of 3 used it
(`study-15-I3`).

An editor's main additions belong in its toolbar, not only in a right-click
menu. 6 of 6 asked to put words over a video looked in the timeline toolbar,
and 3 of 6 never found "Add text" in the lane menu (`study-16-I2`).

### 6.2 A shortcut also has a visible control

"Ctrl+D duplicate" sat in the status bar through a whole task, and 0 of 3
used it while typing every table leg by hand (`study-7-I4`). Every
shortcut-only action gets a button or menu item.

## 7. Small windows

Test every new surface at 1280 × 720, 1366 × 768, 1024 × 768 and 960 × 1000
(half a wide screen), not only 1440 × 900.

- Below about 1100 px wide, a side panel took a third to half the width in
  8 of 8 sessions that opened one (`study-5-I8`,
  `study-6-I10`). The App Builder's assistant covered the whole
  builder at 960 wide.
- Menus opened from the canvas ran off the bottom over the Run button (study 5
  defects). A menu stays inside the window and shows that it scrolls.
- Toasts covered getting-started chips, the inspector and the run button
  (studies 3, 4 and 6 defects).
- An editor with a time axis opens with all of its content in view. A
  timeline opened on its last seconds, and 0 of 3 found the clips to shorten
  (`study-14-I4`). Fit after the layout settles: the lanes measured 784 px
  while the dock laid out and about 300 px after it.

The narrow-width behavior is still under research. Until it is decided, a
panel must not cover the control the person opened it to use.

## 8. Patterns that work

Studies confirmed these. Keep them when changing the surrounding UI.

| Pattern | Evidence |
|---|---|
| Asking for a model where it is used leads straight to key entry | `study-1-I3`, 3 of 3 |
| "Costs" answers the spend question at a glance | `study-2-I5`, ease 7, 7, 6 |
| The Library's empty state leads to upload | `study-2-I7`, 3 of 3 |
| Undo after a removal | `study-3-I7`, 3 of 3 |
| A separate "Render stills (6)" step with a visible count | `study-4-I6`, 3 of 3 |
| The Chats list for finding and continuing an old conversation by meaning | `study-5-I6`, `study-6-I8` |
| "Project" as the place to keep a client's work apart | `study-5-I7`, 3 of 3 |
| The Game flow from idea to a playable game | `study-6-I7`, study 10 3 of 3 |
| A step bar ("1. Idea · 2. … · 3. …") and example ideas in a guided flow | `study-10-I4`, 11 of 12 |
| The App flow opening the built app in its run view, with the build's stages listed | `study-8-I2`, `study-8-I4`, study 10 3 of 3 |
| Clicking a node to open its settings in the side panel | `study-9-I5`, 3 of 3 in 9 actions |
| Dragging from dot to dot to connect, and the status bar's edge count as confirmation | `study-9-I6`, 5 of 5 |
| An example's "How it works" note naming its numbered nodes, read to say what it needs and where its result appears | `study-13-I3`, 5 of 5 |
| The Examples Games tab, with control hints on the game's first screen | `study-14-I6`, 4 of 4 |

## 9. Open questions

These have evidence but no decision. Do not treat a recommendation here as a
rule until [insights.md](../.agents/skills/ux-research/references/insights.md)
records the decision.

| Question | Insight |
|---|---|
| Keep the first-run connection dialog, move it to first use, or give the key route equal weight | study-1-I2 |
| Rail labels, and whether developer terms belong in the status bar | study-1-I5 |
| A shorter path from one sentence to a picture, and a use case for an everyday picture | study-3-I4 |
| How a scene-by-scene plan with pictures is reached from home | study-10-I1 |
| Whether chat should hand "make me a page" or "make me a game" to the matching flow | study-6-I2 |
| How a newcomer writes and formats a note, and where it is listed | study-7-I3 |
| How to make building from parts in 3D take fewer actions | study-7-I4 |
| One search across chats, documents and files | study-7-I5 |
| How side panels behave below about 1100 px | study-5-I8, study-6-I10 |
| Which port names the canvas shows without hovering | study-9-I4 |
| What a clip dropped on another clip does, and whether shortening a clip closes the gap | study-16-I3, study-16-I5 |

## 10. Checklist for a UI change

- [ ] Every new entry point is named by the person's goal (1.1) and visible at 1280 × 720 (1.3).
- [ ] Any new picker or flow starts on the Settings default for its model kind (2.2) and marks the current model (2.3).
- [ ] Leaving, switching mode or closing keeps unsaved work (3.1).
- [ ] No action changes something the person did not aim at without saying so (3.2).
- [ ] A new item appears where it was made, ready to rename (3.4). A save or export confirms in view (3.5).
- [ ] Every empty state has its own action (4.1). Every disabled primary action gives its reason (4.7).
- [ ] Errors name the cause and the next step in plain words, and clear after the fix (4.4, 4.5).
- [ ] Labels reuse the existing name of each thing (5.1), and no developer term reaches a newcomer's screen (5.2).
- [ ] Item actions are on the card, the row and the tab (6.1). Shortcuts have visible controls (6.2).
- [ ] Screenshots at 1280 × 720 and 960 × 1000 show no clipped menu and no panel over the control in use (7).

## Evidence

Insight IDs (`study-<n>-I<m>`) are rows in
[insights.md](../.agents/skills/ux-research/references/insights.md), which
holds the evidence count, severity, status and next step for each. Defects
cited as "study N defects" are listed in that study's readout. The
[ux-research skill](../.agents/skills/ux-research/SKILL.md) runs new studies.
When a study adds, confirms or overturns a rule here, update this file in the
same PR as the readout.
