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
| `make-tool` | A colleague keeps asking you to turn product names into a one-line description for the shop's website. Make a small page they can use on their own: they type a product name, press a button, and read a description. Then try it once with a product of your own. | empty | 30 | Making a tool for someone else |
| `photo-video` | You have two photos from a weekend away. Put them one after the other in a short video, and play the video from the start. | empty | 25 | Putting your own photos into a video |
| `make-game` | You want a small game you can play here, made with the app's help. Make one, then play it for a moment. | empty | 25 | Making a game |
| `keep-answer` | Ask the app to write a short thank-you note to a neighbour who watered your plants. Keep the note somewhere in the app so you can find it again later, then open it from there. | empty | 15 | Keeping an answer from the assistant |
| `sort-photos` | You have three photos: two from a beach trip and one from a forest walk. Put them into this app so that the two beach photos are kept together on their own, apart from the forest photo, under a name you choose. | empty | 20 | Grouping your own files under a name |
| `write-note` | You need to tell your landlord that the heater in your flat has stopped working. Write the note here, make its first line stand out from the rest, then close it and open it again. | empty | 25 | Writing and formatting your own text |
| `same-character` | You will make several pictures of your ginger cat, Miso, and want the same cat in every one. Using your photo of Miso, set the app up so it knows what Miso looks like. | empty | 25 | Setting up a recurring subject |
| `make-3d` | You want a simple table in 3D: a flat top on four legs. Build it here by hand, then turn it so you can see it from underneath. | empty | 40 | Building a 3D object by hand |
| `find-thing` | Someone here worked on plans for releasing the next version of a product. You do not know whether it was a conversation, a document or something else. Find it and open it. | seeded-demo | 15 | Finding something by search |
| `build-blank` | You want a small process here that takes two words you type and shows them as one line, the first word followed by the second. Build it yourself, step by step, without asking the app to build it for you. Then run it until you see the line. | empty | 40 | Building a graph on an empty canvas |
| `change-instructions` | Someone left something here that turns trip notes into a packing list. You want every item on the list to say how many to pack. Change what it is told to do, then run it once. | working-run | 20 | Finding a step's hidden settings |
| `groomer-board` | You run a dog-grooming salon and want a short video for its web page: a muddy dog arrives, gets washed, and leaves fluffy. Before anything is filmed, have the app lay it out as separate scenes with a picture for each, until you see every scene with its picture. | empty | 35 | Planning a video as pictures |
| `change-scene` | Someone here planned a short drink advert as a series of scenes with a picture each. Change the second scene so that green matcha tea is poured instead of coffee, and get a new picture for that scene, until you see the new picture in its place. | storyboard | 20 | Editing one shot and its still |
| `reorder-scenes` | The client now wants the advert to open on the person drinking. Make the last scene the first one, and keep the others in their order. | storyboard | 15 | Reordering shots |
| `watch-plan` | Before paying for any video, you want to see this advert's plan play through from the first scene to the last, like a rough cut. Do that. | storyboard | 15 | Previewing a board |
| `send-plan` | A client who does not use this app wants to look through this advert's plan on their own computer. Get the plan out of the app as something you could send them. | storyboard | 15 | Exporting a board |
| `photo-variant` | You have a photo of a lamp you sell online. Use something ready-made in this app, not built by you, to get a version of the photo with a different background, until you see the new version. | empty | 40 | Using an example on your own photo |
| `compare-answers` | You want to see how a few different AI models answer the same question, side by side, so you can choose one. Find something ready-made here that does that and use it with a question of your own, until you see the answers. | empty | 35 | Finding and running an example app |
| `own-version` | One of the ready-made tools here is close to what you need, but you want your own version of it with one change of your choice, kept apart from the original. Make that version, go back to where you started, and open your version again. | empty | 30 | Copying an example |
| `find-example` | A customer sent you a long, angry chain of emails saying your app keeps crashing. Your developers want a short, orderly write-up of the problem that they can act on. Find something ready-made here that turns emails like these into that kind of write-up, and open it. | empty | 15 | Finding the example for a specific job |
| `read-example` | Without running it, work out what the thing you opened needs you to give it, and where you would see what it gives back. Say both. | empty, after `find-example` | 10 | Reading an opened example |
| `example-own-text` | Your supplier wrote this description of a kettle: "1.7 L borosilicate vessel, 3 kW rapid-boil element, strix-type thermostatic cut-out, 360° cordless base." Your shoppers would not follow it. Use something ready-made here, not built by you, to get a version in everyday words, until you see it. | empty | 30 | Running an example on your own text |
| `adapt-example` | Something ready-made here turns shop text into German. You also sell in France, so make your own version that turns it into French instead, then use it on "Handmade lavender soap, gentle on skin" until you see the result. | empty | 35 | Changing how an example behaves |
| `reconnect` | Someone left something here that should turn trip notes into a packing list, but the list it makes never uses the notes. Make it use them, then run it once. | unwired-run | 20 | Reading and repairing a graph's wires |

`add-key`, `read-aloud`, `make-tool`, `make-game`, `keep-answer`, `same-character`, `photo-variant`, `compare-answers` and `own-version` need a test key in
`credentials`. `add-photo`, `change-photo` and `photo-variant` need an image in `assets`, `photo-video` two
photos of different scenes, `sort-photos` three photos of two trips, and `ask-file` a text file, and `same-character` one photo named for the cat. The `storyboard` state seeds one example board and an OpenAI key for `change-scene`, `reorder-scenes`, `watch-plan` and `send-plan`. `switch-model` on `seeded-demo` has every provider connected, so it
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
| `make-tool` | A mini app with a text input, a button bound to a run, and an output, run once from its own run view with the participant's product name. | Whether it found "New app", and whether it bound the button to a workflow without help. | [build-app](../../agentic-qa/references/protocols/creative.md#build-app) |
| `photo-video` | A timeline with both photos in order, and a screenshot during or after playback from the start. | Where the first drop landed, and whether a drop cut the clip under it. | [timeline](../../agentic-qa/references/protocols/creative.md#timeline) |
| `make-game` | A game view that changed in response to the participant's keys or clicks. | Where it looked first, and whether it used "Start with a blank room" or an example. | [game](../../agentic-qa/references/protocols/creative.md#game) |
| `keep-answer` | The note reopened from a list, a conversation or a file. Record which. | Whether it looked for a save action on the reply, or trusted the conversation list. | [chat](../../agentic-qa/references/protocols/chat.md#chat) |
| `sort-photos` | Both beach photos inside one named folder (or another named group), and the forest photo outside it. | Whether the new folder was on screen after it was made, and whether it used a folder or a project. | [organize](../../agentic-qa/references/protocols/library.md#organize) |
| `write-note` | A text file whose first line is bold or a heading, reopened after its tab was closed. | Whether it previewed before saving, how it made the heading, and which list it reopened from. | [copy-edit](../../agentic-qa/references/protocols/library.md#copy-edit) |
| `same-character` | An entity named Miso with the photo as its reference image, visible in the library. | Whether it went to the composer's entity picker, the rail's Entities page, or the chat. | [image](../../agentic-qa/references/protocols/library.md#image) |
| `make-3d` | A 3D model with a top and four legs, viewed from below. | Whether it found the duplicate, and whether a moved part left the view. | [app-first-use](../../agentic-qa/references/protocols/first-use.md#app-first-use) |
| `find-thing` | The conversation "Plan our v2 product launch" is open. | Which list or search it tried first, and how it read an empty search result. | [chat-find](../../agentic-qa/references/protocols/chat.md#chat-find) |
| `build-blank` | A workflow built on the canvas, without the assistant or a guided flow, that joins two typed texts, run with the joined line visible. | Where new nodes landed, how it found the joining node, and whether it wired or typed values in. | [automation](../../agentic-qa/references/protocols/workflows.md#automation) |
| `change-instructions` | The Agent's system instruction asks for quantities, and a run after the change completed. | Whether it looked on the node before opening the side panel. | [automation](../../agentic-qa/references/protocols/workflows.md#automation) |
| `reconnect` | A wire from "Trip notes" to the Agent's prompt, and a run after the change completed. | How it found the port's name (zoom, hover, selection, or position). | [automation](../../agentic-qa/references/protocols/workflows.md#automation) |
| `groomer-board` | A storyboard with more than one shot and a still on each shot is visible. | Whether it took "Create storyboard" or "Create video", and whether it expected the pictures without "Render stills". | [storyboard](../../agentic-qa/references/protocols/creative.md#storyboard) |
| `change-scene` | Shot 2's description mentions matcha and shot 2 shows a newly rendered still. The other shots are unchanged. | How it reached the board, how it read "second scene" against the board's scenes and shots, and the model field in the render dialog. | [storyboard](../../agentic-qa/references/protocols/creative.md#storyboard) |
| `reorder-scenes` | The shots read cold-sip, ice-drop, coffee-pour, cream-swirl. | Menu or drag, and whether the grip was on screen. | [storyboard](../../agentic-qa/references/protocols/creative.md#storyboard) |
| `watch-plan` | The preview or slideshow plays, with a screenshot of shot 1 and a later shot. | Which control it pressed first: Preview, Slideshow or One Take. | [storyboard](../../agentic-qa/references/protocols/creative.md#storyboard) |
| `send-plan` | The receipt says the browser downloaded a file of the board (a ZIP, or an exported timeline). | Where it looked for export, and what it expected the file to hold. | [storyboard](../../agentic-qa/references/protocols/creative.md#storyboard) |
| `photo-variant` | An edited picture made from the participant's photo is visible. | Whether it chose an app or a workflow example, and what the model field offered for the step. | [image](../../agentic-qa/references/protocols/library.md#image) |
| `compare-answers` | Answers from more than one model to the participant's question are visible. | Whether it reached the Model Arena app or the workflow, and what it searched for. | [app-first-use](../../agentic-qa/references/protocols/first-use.md#app-first-use) |
| `own-version` | A copy of an example with the participant's change, reopened from a list after leaving it. | Whether it trusted that saving left the example alone, and whether it renamed the copy. | [automation-keep](../../agentic-qa/references/protocols/workflows.md#automation-keep) |
| `find-example` | "Turn a Support Thread into a Bug Report" is open on its canvas. | Where it looked for examples, and which words it searched. | [example-edit](../../agentic-qa/references/protocols/workflows.md#example-edit) |
| `read-example` | The diary names the "thread" input and the output node (or the run panel) as where the result appears. | Whether it read the canvas note or clicked the nodes. | [example-edit](../../agentic-qa/references/protocols/workflows.md#example-edit) |
| `example-own-text` | "Rewrite This So a Customer Understands It" (or another plain-language example) ran with the kettle text, output visible. | Whether it reached Examples or asked the chat, and which words it searched. | [example-edit](../../agentic-qa/references/protocols/workflows.md#example-edit) |
| `adapt-example` | A copy of "Translate Marketing Copy to German" whose Agent instruction asks for French, run with the soap line, output visible. | Where it made the change: the System field, the prompt, the input, or a title only. | [example-edit](../../agentic-qa/references/protocols/workflows.md#example-edit) |

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

Study 6 found that the key takes 6 or 7 actions on `empty`, so a key task
needs its budget plus 7. `keep-answer` and `sort-photos` together need 40.
`make-tool` and `make-game` meet fixed replies from the chat and the App
Builder, the fixed capitalise plan, and a game design that reads "fake", which
participants read as the product failing. Judge both on mechanics, and use a
real language model when the question is what the chat does with the request.
A participant kept the `keep-answer` note in the conversation list, which the
end state counts.

The home screen's "App" guided flow (study-6-I1) calls the app build endpoint,
which `serveApp.ts`'s test server does not serve: there the flow reports "Not
found". Validate `make-tool` through that flow against the real server with a
real language model.

Study 7 found that `write-note` takes 19 actions when the draft is lost
once, so give it 25. `same-character` takes 6 or 7 actions on the key and
about 25 after it, so give it 35 on `empty`. `make-3d` took 40 actions for a
top and one leg: a full table needs about 70 at three actions per number,
so judge it on the route and the stalls, or give it 70. `find-thing` is
answered by the Chats list in the seeded account, so it says little about
search unless the account holds more conversations than one list shows.

Study 9 found that `build-blank` takes 17 to 39 actions, so give it 40.
`change-instructions` and `reconnect` take 6 to 10 from home, and the rest of
their budget goes on the fixed reply, which every participant read as a stub.
Judge both on mechanics.

Study 10 found that `plan-video` on the fakes cannot finish through the
Video flow: its render step needs a video model, and OpenAI's fake lists none.
That wall is a fixture, but the Video flow makes clips and never pictures, so
the end state is reachable only through the storyboard flow. `make-picture`
still spends about 15 actions retyping the "fake" brief, so give it 35 to see
the pictures. `make-tool` on the real-model server takes 24 or 25 actions and
about 40 seconds of build. On that server the App flow's model reads "Claude
Fable (subscription)" whatever key the participant added, and participants
remark on it. That is the study setup.

Study 11 found that `groomer-board` and `plan-video` take 19 to 29 actions on
`empty`, 6 of them on the key, so give each 35. The fake planner returns one
scene of six shots whatever the idea, which participants read as the product
ignoring their beats. `change-scene` and `reorder-scenes` together need 35 at
1280 × 720. `watch-plan` and `send-plan` together take about 12 on the fixed
build. Before the study 11 PR the test server did not serve the board's ZIP
export, so `send-plan` failed on every session there.

Study 12 found that `photo-variant` cannot finish within 35 actions when the
first pick is the FAL-only "Put a Product on a Studio Backdrop", so give it
40. Vary Image runs on the OpenAI fake. `compare-answers` takes about 30
actions after `run-example`, 7 of them on the key. The fakes return the same
text from every model, which participants notice.

Study 13 found that `example-own-text` takes 25 to 29 actions on the fixed
build, 6 of them on the key, and `adapt-example` 25 to 31. `find-example` and
`read-example` together take 12 to 20. On the fake runtime every run returns
"deterministic e2e response", so judge `example-own-text` and `adapt-example`
on the run, not on the text.

## Adding a task

Add a row to both tables in the same change as the study that first uses it.
Pilot it first. A task that no participant can recognise as finished needs a
clearer end state, not a longer budget.
