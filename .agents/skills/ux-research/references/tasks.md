# Task bank

This page is for the researcher. Never give it to a participant, and never
copy its "end state" or "watch for" text into a packet.

Each task is small: one thing a newcomer wants to do, about 15 actions. Tasks
combine into a session of up to three. The **Routes** link points at the
agentic-qa protocol that lists the paths, the fake runtime's limits, and the
known behavior for that part of the UI. Read it before judging a session, and
never put it in a packet.

## Writing a task

- Give a reason and an action: "You want to try this with your own key. Add
  it." A reason makes the participant look for the meaning of a control, not
  for a matching word.
- Use the participant's vocabulary. Never use a label, menu name, feature name,
  or product term the UI shows. If a word in the task appears on the screen,
  the task tests word matching, not understanding.
- Name a visible end state the participant can recognise, such as "until you
  see the answer" or "and open it again".
- Ask for one thing. "Find X and change Y" is two tasks.
- Do not hint at a location ("in the settings", "from the menu").
- Keep each task under 15 actions for someone who knows the route. If the QA
  protocol's shortest route is longer, the task is too big.

## Tasks

| ID | Text given to the participant | State | Budget | Research topic |
|---|---|---|---|---|
| `first-glance` | Look around without changing anything. Then say what you think this app is for, and what you would do first. | empty | 5 | First impression and the main entry point |
| `start-new` | You want to make something new here. Find where you would start, and start it. | empty | 15 | Where new work begins |
| `add-key` | The app needs your OpenAI key before it can answer you. Add it. | empty | 15 | Provider setup |
| `ask-question` | Ask the app a question of your own and read the answer. | empty | 15 | Finding the assistant |
| `open-recent` | Someone used this app on this computer before you. Find the most recent thing they worked on and open it. | seeded-demo | 15 | Where work is kept |
| `rename-item` | Pick one of the things already in this app and give it a name you prefer. | seeded-demo | 15 | Naming and editing in place |
| `run-example` | Find something ready-made in this app that you could try right away, and try it. | empty | 15 | Templates and examples |
| `see-result` | Open one of the things already in this app, run it, and find what it produced. | seeded-demo | 15 | Where results appear |
| `add-photo` | You have a photo of your own. Put it into this app, then find it again. | empty | 15 | Uploading and the library |
| `undo-change` | Open one of the things already in this app, change something in it, then put it back the way it was. | seeded-demo | 15 | Undo and recovery |
| `switch-model` | You want the app's answers to come from a different AI model. Change it. | seeded-demo | 15 | Model choice |
| `find-help` | You are not sure how this app works. Find help from inside the app. | empty | 10 | In-product help |
| `find-cost` | Find out whether using this app has cost any money so far. | empty | 10 | Spend and pricing |
| `change-look` | The text is hard for you to read. Change how the app looks so it is easier. | empty | 10 | Appearance settings |
| `make-picture` | You want a picture of a red bicycle leaning on a blue wall. Have the app make it, until you see the picture. | empty | 20 | Making a first picture |
| `ask-other-model` | You want a different AI model to answer you than the one that answers now. Switch to it and ask it something, until you see its answer. | seeded-demo | 15 | Which model answers |
| `remove-restore` | Open one of the things already in this app, remove one part of it, then bring that part back. | seeded-demo | 15 | Undo after a larger change |
| `save-copy` | You want a copy of something already made in this app on your own computer. Save it there. | seeded-demo | 15 | Export and download |
| `fix-broken` | Someone left something here that should summarise a trip, but it does not work. Make it work, until you see a summary. | failing-run | 20 | Recovering from a broken workflow |
| `repeat-job` | Every week you turn a few rough notes into a short tidy summary. Set the app up so it does that job for you whenever you need it, and try it once. | empty | 20 | Setting up a reusable process |
| `change-photo` | You have a photo of your own. Have the app make a new version of it that looks like a watercolour painting, until you see the new version. | empty | 20 | Working on your own picture |
| `ask-file` | You have a file of notes from a meeting. Ask the app when the next meeting is, using the file, until you see an answer. | empty | 15 | Asking about your own file |
| `fix-error` | Someone left something here that should turn trip notes into a packing list, but it stops with a problem when it runs. Make it work, until you see a packing list. | other-provider | 20 | Recovering from a run error |
| `plan-video` | You want a short video advertising a small bakery. Have the app plan it scene by scene, with a picture for each scene, until you see the scenes with their pictures. | empty | 25 | Planning a multi-part creative piece |
| `add-step` | Someone left something here that turns trip notes into a packing list. Make it also give you a short summary of the trip as a second result, then run it until you see both results. | working-run | 25 | Changing a process by hand on its canvas |
| `read-aloud` | You wrote a welcome line for your podcast: "Welcome back to Morning Walks, the show about slow mornings." Have the app say it out loud, until you can play it. | empty | 20 | Making speech from your own words |
| `draw-by-hand` | You want a simple drawing of a house with the sun above it, drawn by your own hand, not made by the app. Draw it here, then close it and open it again. | empty | 20 | Drawing by hand and keeping it |
| `continue-chat` | Some time ago, someone on this computer asked the app for meal ideas without meat. Find that conversation and ask one more question in it, until you see the answer. | seeded-demo | 15 | Finding and continuing an old conversation |
| `separate-work` | You are about to start work for a new client, a flower shop. Keep their work apart from everything already here, and start one thing for them. | seeded-demo | 15 | Keeping a new piece of work apart |

`add-key` and `read-aloud` need a test key in `credentials`. `add-photo` and `change-photo`
need an image in `assets`, and `ask-file` a text file. `switch-model` on `seeded-demo` has every provider connected, so it
studies the choice and not the setup.

## End states and routes

| ID | End state (researcher only) | Watch for | Routes |
|---|---|---|---|
| `first-glance` | The first-look account names a purpose and a first action, with a screenshot. | Which words it can and cannot explain. Whether its first action matches the plan's "start" control. | [app-first-use](../../agentic-qa/references/protocols/first-use.md#app-first-use) |
| `start-new` | A new document of any kind is open. | Which kind it chose, and whether it could say why. Hesitation between several "new" controls. | [app-first-use](../../agentic-qa/references/protocols/first-use.md#app-first-use) |
| `add-key` | The key is stored and a model is selectable. | Where it looked first. Whether it knew the key was accepted. | [key-change](../../agentic-qa/references/protocols/first-use.md#key-change) |
| `ask-question` | A reply under the participant's own question. | Whether the composer on the first screen read as an assistant. | [chat](../../agentic-qa/references/protocols/chat.md#chat) |
| `open-recent` | The most recently changed seeded item is open. | Which list it trusted for "recent". | [name-find](../../agentic-qa/references/protocols/library.md#name-find) |
| `rename-item` | The item shows the new name in its tab and in its list. | Whether it found renaming in place, through a menu, or not at all. | [rename](../../agentic-qa/references/protocols/library.md#rename) |
| `run-example` | An example ran and its output is visible. | What it thought "example" and "template" meant. | [app](../../agentic-qa/references/protocols/workflows.md#app), [example-edit](../../agentic-qa/references/protocols/workflows.md#example-edit) |
| `see-result` | The output of the participant's run is on screen. | Where it expected the result before it found it. | [past-result](../../agentic-qa/references/protocols/workflows.md#past-result) |
| `add-photo` | The photo is visible in a list after the participant navigated away and back. | Whether it expected the photo inside a document or in a library. | [upload-many](../../agentic-qa/references/protocols/library.md#upload-many) |
| `undo-change` | The item is back in its original state. | Whether it used undo, a history, or redid the change by hand. | [copy-edit](../../agentic-qa/references/protocols/library.md#copy-edit) |
| `switch-model` | A later reply names or uses the chosen model. | How it told models and providers apart. | [model-switch](../../agentic-qa/references/protocols/chat.md#model-switch) |
| `find-help` | A help surface is open and the participant says what it learned there. | Whether it found help or the assistant first. | [learn](../../agentic-qa/references/protocols/first-use.md#learn) |
| `find-cost` | The participant names the amount spent and where it saw it. | Which word it searched for: cost, usage, billing, or credits. | [spend](../../agentic-qa/references/protocols/first-use.md#spend) |
| `change-look` | The theme or text size changed. | Whether it looked in settings, a profile menu, or the browser. | [appearance](../../agentic-qa/references/protocols/first-use.md#appearance) |
| `make-picture` | A generated picture is visible. | Where it asked first (chat or a picture flow), and which picker it took for the picture model. | [image](../../agentic-qa/references/protocols/library.md#image) |
| `ask-other-model` | A reply after a model change, with the new model selected or named on the reply. | Whether it could tell which model answered before the change. | [model-switch](../../agentic-qa/references/protocols/chat.md#model-switch) |
| `remove-restore` | The removed part is back in the document. | Undo, version history, or a redo by hand. | [undo-delete](../../agentic-qa/references/protocols/library.md#undo-delete) |
| `save-copy` | The receipt says the browser downloaded a file of something made in the app. | Where it looked for export, and which format it chose. | [timeline](../../agentic-qa/references/protocols/creative.md#timeline) |
| `fix-broken` | The run completes and its output is visible. | Where it first learned what was wrong, and whether it ran before fixing. | [run-failure](../../agentic-qa/references/protocols/workflows.md#run-failure) |
| `repeat-job` | A workflow or app built from the participant's description, saved, and run once with its output visible. | Whether it chose chat, a workflow, or an app, and whether it reopened what it built. | [automation-keep](../../agentic-qa/references/protocols/workflows.md#automation-keep) |
| `change-photo` | A changed image made from the participant's photo is visible. | Whether it asked the chat first, and where it expected an image model. | [image](../../agentic-qa/references/protocols/library.md#image) |
| `ask-file` | A reply in a conversation whose question carries the notes file. | Where it attached the file, and whether the home composer read as a place to ask. | [chat](../../agentic-qa/references/protocols/chat.md#chat) |
| `fix-error` | The run completes and its output is visible, after the participant changed the document. | Whether it read the error, and whether it added the named key or switched the model. | [run-failure](../../agentic-qa/references/protocols/workflows.md#run-failure) |
| `plan-video` | A storyboard with more than one shot and a still on each shot is visible. | Where it expected the pictures to come from. | [storyboard](../../agentic-qa/references/protocols/creative.md#storyboard) |
| `add-step` | The workflow has a second language-model step fed by the notes, a second output, and a run shows both outputs. | How it added a step (canvas menu, search, drag from a handle, the assistant), and whether it connected the new step without help. | [automation](../../agentic-qa/references/protocols/workflows.md#automation) |
| `read-aloud` | An audio clip of the line exists and the participant played it or showed its player. | Where it looked first (chat, "+ New", a workflow), and which voice control it read as "say it out loud". | [voice-script](../../agentic-qa/references/protocols/creative.md#voice-script) |
| `draw-by-hand` | A sketch with strokes the participant drew is open again after its tab was closed. | Whether it found a blank drawing surface or a generator first, the first stroke's visibility, and where it reopened the drawing. | [sketch](../../agentic-qa/references/protocols/creative.md#sketch) |
| `continue-chat` | A new reply under the participant's question in "Vegan recipe suggestions". | Which list it searched, and whether it matched the title without the task's words. | [chat-find](../../agentic-qa/references/protocols/chat.md#chat-find) |
| `separate-work` | A new project exists, and something started in it (a document or a chat) is open. | Whether it read "Project" or "Personal" as the place to separate work, or made a folder or a tag instead. | [projects](../../agentic-qa/references/protocols/library.md#projects) |

Study 2 found two tasks whose end state asks more than their text:
`switch-model` ("Change it") lets a participant stop at the picker without
seeing a reply, and `find-help` ("Find help") lets it stop when help is open
without learning from it. Judge those end states as written, and report the
wording gap with the result.

Study 3 found the same kind of gap in `ask-other-model`: on `seeded-demo` no
model is selected, so "the one that answers now" does not exist and a
participant can take a first pick for the switch. On the fakes,
`make-picture` pays for retyping the "fake" brief and `repeat-job` always
gets the capitalise plan, so judge both on mechanics.

Study 4 found that `fix-broken` has no fault left when the participant
connects a key first, because empty model fields now take the default model.
Use `fix-error` for run faults. `change-photo` and `ask-file` together do not
fit 35 actions, so give each its own session or run `ask-file` first. On the
fakes the chat never calls a tool, so a chat request for an edited photo only
gets text back.

Study 5 found that `add-step` needs the `submit_result` call in the fake
model: every participant added an output on the Agent, which a model fills
only through that tool. `read-aloud` on an empty account spends 4 to 6 of its
20 actions on the key, and no participant reached a clip in 20. Give it 25
when it validates study-5-I3.

## Adding a task

Add a row to both tables in the same change as the study that first uses it.
Pilot it first. A task that no participant can recognise as finished needs a
clearer end state, not a longer budget.
