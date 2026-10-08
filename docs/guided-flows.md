---
layout: page
title: "Guided Creation Flows"
permalink: /guided-flows
description: "Start an image, workflow, entity, storyboard, video, script, or game from a short guided sequence of steps."
---

A guided flow is a short sequence of steps that ends in a document you keep editing. You describe what you want, review what NodeTool proposes, and only then does it spend model credits. The flow saves its progress on the document it creates, so a reload or a second window resumes at the same step.

There are seven flows.

| Flow | What it makes | Steps |
|------|---------------|-------|
| [Image](#image) | A sketch with variations to pick from | Idea, Brief, Look |
| [Workflow](#workflow) | A graph, checked and run once | Idea, Plan, Build |
| [Entity](#entity) | A reusable character, location, style, or prop | Details, Reference, Review |
| [Storyboard](#storyboard-video-and-script) | A rendered board of shots | See [AI Video Production](ai-video-production.md) |
| [Video](#storyboard-video-and-script) | A cut on the timeline, no board | See [AI Video Production](ai-video-production.md) |
| [Script](#storyboard-video-and-script) | Voiced lines ready to place | See [AI Video Production](ai-video-production.md) |
| [Game](#game) | A playable game in the built-in engine | See [Game Editor](game-editor.md) |

## Start a flow

**From the new-project screen.** The screen has a **Start with a guided flow** section. It shows the **Storyboard**, **Image**, and **Workflow** cards. Choose **More formats** to also show **Entity**, **Video**, **Script**, and **Game**. **Fewer formats** hides them again. Text typed in the prompt box is not sent to a flow unless you click its card, and the Image card uses it as the first brief.

**From the tab bar.** The **+ New** menu lists the same flows in its first section. The menu names the Video card **Timeline** and the Image card **Sketch**. Each choice creates an untitled document in the selected project and opens it as a tab. A failed start shows the notification "Could not start the guided flow".

**From Studio.** The Studio home offers only **Storyboard**, **Video**, and **Script**.

**From the Entities page.** **Add entity** runs the Entity flow in place.

Every step has a primary button named for its outcome, such as **Generate your image**. When the button is off, a line beside it says why, for example "Pick an image use case". Where a step spends credits, the cost estimate sits beside the button. Step 1 of the Image, Workflow, and Entity flows has **Other ways to start**, which skips the flow. Flows opened from the new-project screen also show **Change flow** on step 1, which asks for confirmation before it discards the draft.

## Image

The Image flow creates a sketch. It turns a sentence into a brief, then renders one, two, or four variations for you to pick from. The sketch editor is described in [Sketch Editor](sketch-editor.md).

### Step 1: Idea

The heading is **What image do you want?** Describe the picture in the **Your image** box. One sentence is enough. The box is required. Three example briefs below it fill the box when you click one.

If the flow was started from the new-project prompt with reference images or entities attached, they appear under **Came with your prompt**. The brief refinement reads the reference images.

**Other ways to start** skips the brief:

- **Upload an image to edit** opens the sketch editor with your PNG, JPEG, WebP, or GIF as the first layer.
- **Start with a blank canvas** opens the editor on an empty canvas.

The footer has a model picker for the language model that writes the brief. Choose **Continue**.

### Step 2: Brief

First choose what the picture is for. The cards set the canvas size and the default number of variations.

| Use case | Description | Canvas | Default variations |
|----------|-------------|--------|--------------------|
| Product shot | One object, clean background, ready to place | 1024 x 1024 | 4 |
| Portrait | A person, framed head and shoulders | 819 x 1024 | 4 |
| Key art | A poster frame with room for a title | 683 x 1024 | 2 |
| Social post | A square that survives a feed | 1024 x 1024 | 4 |
| Logo | A flat mark on a plain field | 1024 x 1024 | 4 |
| Concept art | A world, painted wide | 1024 x 683 | 2 |
| Texture | A flat surface that tiles | 1024 x 1024 | 2 |

Choose **Refine the brief**. The language model expands your sentence into five fields and nothing is rendered yet. If the brief already matches your sentence and use case, the button reads **Continue to the brief** and makes no model call.

The review step shows **Your brief** with five editable fields: **Subject**, **Composition**, **Lighting**, **Style words**, and **Leave out**. Edit anything before it is rendered. **Re-refine** runs the expansion again over the text in the boxes. Under **How many variations?** choose 1, 2, or 4. Choose **Continue to look**.

### Step 3: Look

The heading is **Choose the look**.

- **Size** offers five tiles: Square (1:1), Portrait (4:5), Landscape (3:2), Story (9:16), and Banner (21:9). Only the sizes the selected model accepts are shown.
- **Style** offers style presets and a **No style** tile, which renders exactly what the brief says.
- **Model** is picked in the footer. If no image provider is connected, the step says so and points you to Settings.

Choose **Generate your image**. The estimated cost appears beside the button when it can be measured.

### The contact sheet

The variations render as a contact sheet. Each one has these buttons:

| Button | Result |
|--------|--------|
| **Sketch editor** | Opens the editor with that variation |
| **Save to entities** | Saves the variation as an entity |
| **New node canvas** | Starts a node canvas from the image |
| **Image to video** | Sends the image toward video |
| **Regenerate** | Renders that variation again. A failed one reads **Try ... again** |
| **Download** | Saves the image file |

Below the sheet, **Make more variations** renders another batch, **Back to generation settings** returns to the Look step, and **Open editor** goes to the sketch editor with every variation present.

## Workflow

The Workflow flow plans a graph from a task, shows you the plan, then builds the graph, validates it, and runs it once with sample inputs. Planning places nothing and runs nothing. For the editor itself see [Workflow Editor](workflow-editor.md).

### Step 1: Idea

The heading is **What should this workflow do?** Describe only the task in the **The task** box, for example "Summarize a PDF and email it". Add files, services, and destinations later. Three example tasks sit below the box.

**Other ways to start**:

- **Start from an example** opens a searchable browser of shipped workflows. Picking one copies it and opens it in the editor.
- **Import a workflow** reads a JSON file or a DSL `.ts` file.
- **Start with a blank canvas** skips the plan.

### Step 2: Plan

Choose what kind of workflow it is. The category changes which nodes the planner considers and which run mode step 3 starts on. It places nothing, so a wrong choice costs a re-plan, not a graph.

| Category | Description | Starts as |
|----------|-------------|-----------|
| Content pipeline | Text in, drafted and formatted text out | Run by hand |
| Media batch | The same render over a list of inputs | Run by hand |
| Data extraction | Pull structured fields out of documents or pages | App with a form |
| Research agent | An agent that searches, reads and reports back | App with a form |
| Automation on a trigger | Runs on a schedule or a webhook, with no one watching | On a trigger |
| Chat app | A conversation with your data behind it | App with a form |

Choose the planner model in the footer, then **Plan the steps**. A shipped example brief can use a stored plan with no model call. If the plan already matches your brief and category, the button reads **Continue to your plan**.

The review shows the plan as a numbered list of inputs, steps, and outputs. You can edit titles and descriptions, reorder steps, remove a step, and use **Add a step**. Two markers can block **Continue to setup**:

- A red marker, "No node for this step", means the step names a node type that does not exist. Pick a real node type in the field beside it.
- An amber marker, "No ... provider connected", means the step needs a model role that no connected provider covers. **Connect** opens provider setup in place.

Every step needs a title and every output needs a name. **Re-plan** asks the model again.

### Step 3: Build

The heading is **Models and how it runs**. Pick a model for each role the plan needs from the providers you have configured. Choose how the workflow starts:

| Run mode | After the test run |
|----------|--------------------|
| Run by hand | You open it and press run |
| App with a form | You put a shareable form over the inputs |
| On a trigger | A schedule or a webhook starts it |

Under **Sample inputs** you can change the values used for the test run. Choose **Build your workflow**. The button states that it builds, checks, then runs the workflow once. Cost is unknown until the run returns.

### The landing checklist

When the build finishes, the canvas opens with a checklist of three lines: **Graph built** with the node count, **Validated**, and **Test run**. If something failed, the checklist says what needs a fix. The next-step button depends on the run mode:

- **Continue on canvas** for Run by hand
- **Create Mini App** for App with a form. See [Mini Apps](mini-apps.md)
- **Add a trigger** for On a trigger. It opens the trigger-node picker. See [Triggers](triggers.md)

## Entity

The Entity flow creates a reusable character, location, style, or prop with a reference image. Entities are described in [Entities](entities.md).

### Step 1: Details

The heading is **What should stay consistent?**

1. Choose the entity type: **Character**, **Location**, **Style**, or **Prop**.
2. Enter a **Name**. The placeholder is "Nova".
3. Enter a **Descriptor**. This text is added to every prompt that uses the entity, so describe only stable visual traits.
4. Optionally enter **Tags (optional)** as a comma-separated list.

The name and descriptor are required. **Start with a blank reference** under **Other ways to start** makes a plain white 1024 x 1024 image, fills an empty name with "Untitled entity" and an empty descriptor with "A reusable visual entity.", and jumps to the review. Choose **Choose a reference**.

### Step 2: Reference

The heading is **Choose a reference image**. Pick the clearest image of the traits to preserve.

- **Choose from assets** opens the asset picker. After a pick the button reads **Change reference**. Images that are already entities are not offered.
- **Generate with AI** opens **Generate a reference image**. Choose a view for the entity type, edit the **Prompt**, pick an **Image model**, and choose **Generate reference**. The image is made at 1K resolution and selected for you.

Choose **Review entity**.

### Step 3: Review

The heading is **Review your entity**. It shows the reference, the name, the type, the descriptor, and the tags. Choose **Create entity**. The entity is then available anywhere entities can be added. If you leave before this step, the draft is kept and restored when you return.

## Storyboard, Video, and Script

These flows build video material. [AI Video Production](ai-video-production.md) documents all three, with their steps, creative context fields, and review screens.

- **Storyboard** takes a sentence to a rendered board in four steps. You review the screenplay, assign entities, choose the look, then render stills and clips.
- **Video** takes a sentence to a cut on the timeline with no board. Each beat stays a separate clip.
- **Script** takes a topic to voiced lines. You write or import the script, add production context, assign speakers and voices, and can create a linked storyboard from it.

## Game

The Game flow creates a playable game in the built-in engine. **+ New** creates a 2D top-down room game named "Untitled game". On the new-project screen, **Game card starts as** picks **2D game** or **3D exploration**. See [Game Editor](game-editor.md).
