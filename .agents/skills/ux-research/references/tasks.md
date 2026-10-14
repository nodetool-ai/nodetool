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

`add-key` needs a test key in `credentials`. `add-photo` needs an image in
`assets`. `switch-model` on `seeded-demo` has every provider connected, so it
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

Study 2 found two tasks whose end state asks more than their text:
`switch-model` ("Change it") lets a participant stop at the picker without
seeing a reply, and `find-help` ("Find help") lets it stop when help is open
without learning from it. Judge those end states as written, and report the
wording gap with the result.

## Adding a task

Add a row to both tables in the same change as the study that first uses it.
Pilot it first. A task that no participant can recognise as finished needs a
clearer end state, not a longer budget.
