# Workflow protocols

This page is for the coordinator. Never give it to a participant. See
[README.md](README.md) for how to use a protocol.

## `automation`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `automation` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A run that took the participant's own sentence and showed an
output the participant could see without moving the canvas blindly.

**Checks.**

- Compare the sentence in the input with the typed receipt.
- Read the run button's tooltip and state labels at full size.
- Read the node and edge counts in the status bar before and after each
  Ctrl+Z.
- Record how many actions the participant spent moving the canvas to see
  the output.

**Routes.**

- "+ New", then the "Workflow" guided flow (Idea, Plan, Build, then "Build
  your workflow"). The fake plan is one text input, a Code step that
  capitalizes it, and one output.
- "+ New", then "New workflow", then the "Build your first useful workflow"
  card's "Add the two-node starter".
- "New workflow" and nodes added by hand from the node menu.
- The run button ("Run entire workflow", Ctrl+Enter) shows Starting,
  Running, and "Error · Retry".

**Fakes.** Only the guided planner's plan changes the sentence. A model step
answers "deterministic e2e response" whatever the input.

**Known behavior.**

- The two-node starter is placed partly under the left rail and the tab bar.
- Undoing the two-node starter takes three Ctrl+Z presses.
- Run outputs can sit under the composer dock.

**Regression.** `web/tests/journeys/editor.spec.ts` ("runs the graph and
shows the result on the canvas").

## `automation-keep`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `automation-keep` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** Two runs with different sentences on the same saved document, the
second after a reload, each with a visible output.

**Checks.**

- After the reload, record every surface that lists the document and every
  surface that says the project is empty. They read different queries.
- Confirm the second run used the reopened document, not a new one, by its
  name in the tab.

**Routes.** The `automation` routes, then the rail's "Documents" panel
(grouped as "Workflows", "Apps", "Creative documents", "Agents & code") or
the Home documents strip after the reload. The guided planner builds a mini
app with its own run history.

**Known behavior.** The first run of an unsaved workflow logs "Autosave
(checkpoint) failed: Workflow not found" in the console. The run completes
and the message is not visible.

## `app`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |
| Goal | The `app` row in [journeys.md](../journeys.md#outcome-goals) |

**Pass.** A visible result for an input the participant typed into a
ready-made workflow or app.

**Checks.** Record which example the participant chose and why, in its own
words. Record each model picker it met and whether it had already chosen a
model elsewhere.

**Routes.**

- More, then "Examples", with the tabs Apps, Workflows, Storyboards,
  Timelines, Sketches, 3D models, and Games. The Workflows tab's "Start from a
  template" copies a card into the current project and opens it.
- Home footer "Browse examples", or the example tabs embedded on Home.
- The "+ New" menu has no workflow examples. Only "New storyboard…" offers
  examples.

**Fakes.** An example whose nodes generate media returns placeholders. An
example's model step answers "deterministic e2e output" or the fixed chat
reply.

**Known behavior.** An example's Agent node needs its own model pick after a
pick in the composer. Whether a first chat pick should become the default is
an open product question.

## `past-result`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Use this app to make something that produces a result, for
example a changed sentence or a picture. Then leave the page, come back, and
find that same result again without making it a second time."

**Pass.** After a reload, the participant opened the first result through
visible navigation, and no second run started.

**Checks.**

- Compare the result before and after the reload, and quote both.
- Watch `steps.jsonl` and the screenshots for a second run, which the goal
  rules out. A rerun the participant did not notice is a feedback finding.
- Record whether the reopened document still shows its last output on the
  output node, or whether the participant had to find it elsewhere.

**Routes.**

- The bottom panel's "Queue" tab, with the columns Running, Queued,
  Completed, and Cancelled, and "Show run on canvas" on a job. The "Trace"
  tab has a "Run" picker.
- Generated media is saved to the Library.
- A mini app's run history.
- A chat answer stays in its thread (see [chat.md](chat.md#chat)). A
  participant that only chats has not exercised this journey. Record it as
  partial coverage.

**Fakes.** None on this path beyond the fixed contents.

**Regression.** `web/tests/journeys/run-observability.spec.ts` covers Trace
and Logs after a reload for an app run.

## `run-failure`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state failing-run` |
| Credentials | One OpenAI test key |

**Goal.** "Someone set up a document in this app for you, and it stops with a
problem when you run it. Find out what is wrong, fix it, and get it to give a
result."

**Fixture.** `--state failing-run` stores "Trip summary": a String Input with
trip notes, an Agent with no model, and an Output. A run stops with "Pick a
model here before running this workflow." on the Agent. Picking "Test Chat
Model" fixes it.

**Pass.** A run of the same document completed with a visible output after
the participant changed it.

**Checks.**

- Quote every error the participant saw: the toast, the node's error, and
  the run button's "Error · Retry" tooltip.
- Record whether the error named the node and the property to fix.
- Record whether "View logs for this node and run" was found and helped.

**Routes.** A validation failure shows "Fix “<property>” on <node> before running."
with a "Show" action. A runtime failure shows a toast with the error, the
error on the node with "View logs for this node and run", "Report this as a
bug", and "Copy to clipboard", and a line in the Logs tab.

## `example-edit`

| Packet | Value |
|---|---|
| Kind | `task` |
| Limits | 50 actions, 10 minutes |
| State | `--state empty` |
| Credentials | One OpenAI test key |

**Goal.** "Find something ready-made in this app that someone else set up as
an example. Make your own version of it with one change of your choice, and
keep it. Then leave the page, come back, and check that your version still
has your change and that the original example is still the way it was."

**Pass.** After a reload, the participant's copy is listed under its own name
and shows the change, and opening the example again shows it unchanged.

**Checks.**

- Record the change and quote it, for example an edited text field, a
  renamed node, or an added node. Read the node and edge counts in the
  status bar before and after.
- Open the example again after the reload and compare it with its first
  screenshot.
- Record whether the copy got a name that tells it apart from the example.

**Routes.** More, then "Examples", or Home's "Browse examples". The
Workflows tab's "Start from a template" copies the card into the current
project and opens the copy. The rail's "Documents" panel lists the copy.

**Fakes.** A run of the example is not required. If the participant runs
it, the model steps answer with the fixed text.

**Known behavior.** An example's Agent node needs its own model pick (see
[`app`](#app)). Clicking an example card creates a copy with the
example's exact name and opens it. In round 8 the participant then compared
two copies and never reopened the example.
