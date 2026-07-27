---
layout: page
title: "Building Mini Apps"
description: "Recipes for building Mini Apps: one-shot generators, streaming apps, batch galleries, live parameter tuning, two-step review flows, and resource editors."
---

Nine app shapes, each built step by step. They share a base recipe; the
differences are which widgets you place and what they bind to.

New to Mini Apps? Read [Mini Apps](mini-apps.md) first for how apps, bindings,
operations, and instance state fit together. The widget list, binding grammar,
and full schema are in the [Reference](mini-apps-reference.md).

## Before you start

The workflows decide what the app can expose. Get this right first and the app
is twenty minutes of layout:

1. **Every value the user changes needs an Input node.** Its `name` is what the
   widget binds to. A value with no Input node cannot be edited from the app,
   except through the node-property binding used in [recipe 5](#5-live-parameter-tuning).
2. **Every value the user sees needs an Output node.** A workflow that ends in a
   terminal node with no Output attached produces nothing an app can display.
3. **Give inputs sensible defaults.** An app whose first Run needs the user to
   type into four empty fields gets abandoned. Defaults make the first run one
   click.
4. **Run each workflow once in its own tab.** Debug the graph as a graph. An app
   over a broken workflow only tells you the app is broken.

## The base recipe

Every app below starts here.

1. Open the **Apps** panel in the left sidebar.
2. Click **New app** for an empty document, or **New app from workflow** to
   scaffold one operation and a widget per Input and Output node. Either way the
   app opens as its own workspace tab.
3. Switch the tab to **Design** to open App Builder.
4. Drag widgets from the palette onto the canvas.
5. Select a widget and set its **binding** in the right-hand panel. The picker
   lists what the operation's live graph offers: Input nodes for write widgets,
   Output nodes and variables for read widgets.
6. Add a **Button**, and give it an **On click** event with the **Run workflow**
   action.
7. Click **Save**.
8. Switch the tab to **Run** and use it. Then run
   `nodetool app debug <application_id>` to check the wiring the way the runtime
   sees it.

To edit a graph while you build, open **Linked workflows** on the app tab and
click the workflow. It opens as a normal workflow tab; the app tab stays where
it is.

**Ask Agent** in App Builder opens the builder agent, which reads the app's
workflows and edits the document through the `ui_app_*` tools. It can place
widgets, set bindings, declare variables and operations, and add the Input,
Output, or Set Variable nodes a layout needs. It is the fastest way to do the
parts the visual editor does not expose: multiple operations, typed variables
with scopes, and resource bindings.

---

## 1. One-shot generator

**Shape:** fill a few fields, click Run, see one result.
**Fits:** image generation, copy rewriting, summarization, translation,
classification.

This is the default app and the one most workflows should get.

1. Place a **Text Input** for each Input node the user should fill. Bind each to
   its Input node. Set a label and a placeholder that says what good input looks
   like.
2. Place a **Button** labelled for the result, not the mechanism: "Write the
   caption" beats "Run".
3. Place one display widget per Output node, bound to it:
   **Markdown** for prose, **Image**, **Audio**, **Video**, **Json** for
   structured data, **Table** for rows, **Output** when the type varies.
4. Give the display widget a **placeholder** ("Your caption appears here") so
   the app reads as intentional before the first run.

Two layout habits that pay off: put inputs and the button in one **Panel** and
outputs in another, and use **Columns** so inputs sit left and results right on
a wide screen.

## 2. Long-running and agent apps

**Shape:** a run that takes 30 seconds to several minutes.
**Fits:** agent workflows, batch processing, video generation, research tasks.

Build recipe 1, then add feedback. Without it the app looks frozen and the user
clicks Run again.

1. Place a **Progress** widget bound to `op:main/exec#progress`.
2. Place a **Text** widget bound to `op:main/exec#activity`. This is the label
   the run reports about itself: the tool an agent is calling, the planning
   phase, the step it is on.
3. Set the Run button's `disabledWhen` to `op:main/exec#running` `is not empty`,
   so it cannot be double-fired.
4. Place a second **Button** with the **Cancel run** action and
   `visibleWhen` = `op:main/exec#running` `is not empty`.
5. Place a **Text** widget bound to `op:main/exec#error`, with
   `visibleWhen` on the same binding `is not empty`.

An agent app without an `activity` binding is the single most common complaint
about Mini Apps. Bind it.

## 3. Streaming text

**Shape:** text that appears token by token.
**Fits:** chat-style answers, long-form drafting, live transcripts.

1. Build recipe 1 with a **Markdown** widget bound to the streaming Output node.
2. Nothing else is required. Streamed strings concatenate into the output slot,
   so one streamed response renders as one Markdown block rather than N
   fragments.
3. If the same text also feeds a later step, map the output `to: "variable"` on
   the operation. It accumulates in the variable the same way, and a new run
   starts a fresh value instead of appending to the last one's.

## 4. Batch gallery

**Shape:** one run produces many results; the user keeps generating.
**Fits:** image variations, ad creative, thumbnail sets, name candidates.

1. Point the display widget at an Output node the workflow emits repeatedly.
   Streamed items collect into a list rather than replacing each other.
2. Use **Table** for structured rows, or an **Image** widget for a stream of
   images.
3. Add a second **Button** labelled "Make another" with the **Run workflow**
   action, placed under the results. The user never scrolls back up to the form.
4. If a fresh set should replace the previous one, give the operation the
   `replace` policy so a second click cancels the run in flight first.

The shipped example apps use exactly this pattern. Install one from the
[Templates Gallery](templates-gallery.md) and open it in Design to see it wired.

## 5. Live parameter tuning

**Shape:** drag a slider, the workflow re-runs, the result updates.
**Fits:** image enhancement, color grading, thresholds, strength and guidance
parameters.

This is the one recipe that does not need an Input node. A widget can drive a
node property directly.

1. Place a **Slider**. Bind it to the node property rather than an input:
   `op:main/prop:<nodeId>#<property>`. The binding picker lists any node with
   properties, not only Input nodes.
2. Set min, max, and step to the property's real range.
3. Add an **On change** event with the **Run workflow** action.
4. Set the event's **Pacing** to **On release**. The slider commits once when
   the user lets go, instead of firing a run per pixel. Use **Debounced** for a
   text field, and **Live** only for something cheap.
5. Give the operation the `replace` policy: a new value should cancel the run
   for the old one, not queue behind it.

Pacing and policy work together. `live` pacing with a `queue` policy on a
five-second workflow will build a backlog the user cannot escape.

## 6. Two-step review

**Shape:** run a step, look at the result, then run the next one.
**Fits:** draft then publish, extract then post, analyze then act, generate then
upscale.

This needs two operations and a variable, so build it with **Ask Agent** or by
editing the document.

1. Declare a variable — say `draft`.
2. Declare operation `draft` bound to the drafting workflow, with its text
   output mapped `to: "variable"` targeting `draft`.
3. Declare operation `publish` bound to the publishing workflow, with its input
   mapped `from: "variable"` reading `draft`.
4. Place a **Markdown** widget bound to `var:draft` so the user reads what will
   be published.
5. Place a Run button targeting the `draft` operation, and a second one
   targeting `publish` with `visibleWhen` = `var:draft` `is not empty`.

The second button cannot fire until the first produced something. That is the
whole approval gate, and no app-level logic was written to get it.

## 7. Settings that stick

**Shape:** a tool used daily that should remember how it is configured.
**Fits:** tone and brand voice, target language, output format, default model.

1. Declare a variable with `scope: "user"` and `persist: true`. Only
   user-scoped variables may persist; an `instance`-scoped one marked `persist`
   is reported as a warning rather than silently persisted.
2. Give it a `default`, which seeds the first session. A restored value is
   seeded first and wins over the default.
3. Bind a **Select** or **Switch** to `var:<id>` with an **On change** event
   using the **Set variable** action.
4. Map the operation input that consumes it `from: "variable"`.

The setting now survives reload and is not part of the form the user fills each
run.

## 8. Conditional and multi-mode apps

**Shape:** one app, several modes, each showing only what its mode needs.
**Fits:** a tool that handles both image and text input, a form with an advanced
section, an app that switches between two workflows.

1. Place a **Select** bound to a variable — say `mode` — with options `image`
   and `text`, and an **On change** event with the **Set variable** action.
2. Give each mode-specific widget a `visibleWhen` of `var:mode` `equals`
   `image` (or `text`).
3. For an advanced section, wrap the widgets in a **Panel** and put
   `visibleWhen` on the panel — one condition instead of nine.
4. To switch workflows rather than fields, declare two operations and give each
   Run button its own `operationId` and `visibleWhen`.

Conditions compare one bound value against a literal. Anything more involved —
"show this when the score is high *and* the language is German" — belongs in the
graph: emit a single flag from a node and condition on that.

## 9. Resource-backed apps

**Shape:** the app reads and writes a document rather than loose values.
**Fits:** storyboard editing, sketch iteration, curated asset collections.

1. Declare a **resource binding**: a kind (`asset`, `timeline`, `storyboard`, or
   `sketch`), a scope (a project, or one pinned document), and the operations
   the app may perform (`read`, `create`, `update`, `delete`).
2. Place a **Resource Picker** to choose one, or a **Resource Gallery** to show
   a grid of them.
3. Map the operation input that consumes it `from: "resource"`, naming the
   resource binding.
4. **Storyboard Scenes** edits the bound document through the resource provider
   directly, so it fires no event of its own.

`nodetool app debug` cannot simulate `from: "resource"` inputs — there is no
resource provider outside the browser. Test these in the app.

---

## Checklist before you ship

- [ ] Every input widget's binding resolves. `nodetool app debug --no-run`
      reports the ones that do not.
- [ ] Every display widget receives a value from a completed run.
- [ ] The app has at least one run trigger.
- [ ] Runs longer than a few seconds show progress, activity, or both.
- [ ] The Run button is disabled while a run is in flight.
- [ ] Errors are visible — a bound `exec#error` widget, not a silent no-op.
- [ ] Inputs have defaults, so the first Run is one click.
- [ ] Display widgets have placeholders, so the empty app reads as finished.
- [ ] Labels name results, not mechanisms.

## Common mistakes

| Symptom | Cause |
| --- | --- |
| A widget shows nothing after a run | It is bound to a node the run never emits, or to an Output node the graph does not have. |
| A widget silently does nothing | Its binding does not resolve. Run `app debug --no-run`. |
| Values from another run appear | Not possible by design: messages are matched by `job_id` and foreign ones are dropped. If values look wrong, the binding points at the wrong node. |
| The slider fires dozens of runs | Pacing is `live`. Use `release`. |
| Runs pile up behind each other | The operation policy is `queue`. Use `replace`. |
| A persisted setting resets | The variable is `instance`-scoped. Only `user` scope persists. |
| The app broke after a graph edit | A legacy name-based binding pointed at a renamed node. Re-bind; the editor writes ID-based bindings, which survive renames. |

## Related

- [Mini Apps](mini-apps.md) — how the runtime works
- [Mini App Reference](mini-apps-reference.md) — widgets, bindings, schema
- [App Builder](app-builder.md) — the editor
- [Templates Gallery](templates-gallery.md) — shipped example apps and workflows
- [Workflow Debugging](workflow-debugging.md) — debugging the graph underneath
