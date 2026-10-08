---
layout: page
title: "Entities"
permalink: /entities
description: "Save characters, locations, styles, and props as reusable entities with a reference image and a fixed descriptor, then reuse them across storyboards, prompts, and workflows."
---

An entity is a named, reusable thing that should look the same every time you generate it: a character, a location, a visual style, or a prop such as a product. Each entity has a reference image and a descriptor, a short description that NodeTool pastes verbatim into every prompt that uses the entity. The verbatim descriptor and the reference image are what keep a character's look steady across shots.

Entities support the Creative Agent and storyboards. See [Creative Agent](creative-agent.md#entities-reusable-ingredients) for how they fit into a production.

## Entity kinds

| Kind | Use it for |
|------|-----------|
| Character | A person or creature that stays recognizable |
| Location | A place with a consistent setting and atmosphere |
| Style | A visual language to apply across generations |
| Prop | A product or object that should keep its appearance |

Only a character has the optional **Voice id** field, which holds a provider-specific voice id for text-to-speech.

## Open the library

There are two places to manage entities.

- **Sidebar panel.** Open **Entities** in the left sidebar. It lists the entities for the active project as a grid of cards. The **Open in full page** button in the panel header opens the full library as a workspace tab.
- **Full-page library.** The page titled **Entities** shows every entity you have, with the caption "Reusable characters, locations, styles, and props". It has an **Add entity** button. With no entities it shows "No entities yet".

Each card shows the reference image, the name, a kind chip, and the first two lines of the descriptor. Two buttons sit on the card: **Edit entity** and **Remove entity**.

## Create an entity

Every entity is built on an image. There are two ways to start.

### From the full-page library

**Add entity** opens a three-step flow. **Back to entities** returns to the grid.

1. **Details.** Pick the **Entity type**, enter a **Name**, a **Descriptor**, and optional **Tags** (comma-separated). Name and descriptor are required. Describe only stable visual traits in the descriptor, for example "A young astronaut with cropped black hair and a worn orange flight suit". The step also offers **Start with a blank reference**, which makes a plain white canvas the reference image and jumps to the review step. It fills the name with "Untitled entity" and the descriptor with "A reusable visual entity." only where you left them empty.
2. **Reference.** Choose the reference image. **Choose from assets** picks an existing image from your assets. **Generate with AI** opens **Generate a reference image**, where you pick a view, edit the prompt, and choose an image model. The views depend on the kind. A character offers Full body, Portrait, and Character sheet. A location offers Establishing view, Detail view, and Location sheet. A style offers Style sample, Style sheet, and Texture detail. A prop offers Product view, Detail view, and Turnaround sheet. An image that is already an entity cannot be picked again.
3. **Review.** Check the image, name, kind, descriptor, and tags, then choose **Create entity**.

NodeTool keeps an unfinished flow as a draft, so leaving the page does not lose your input.

### From an existing image

In the sidebar panel, the **New entity** button (+) opens **Pick a reference image**. Choose an image and the **New entity** dialog opens with the image, **Kind**, **Name**, **Descriptor**, **Voice id (optional)** for characters, and **Tags (comma-separated)**. **Create** stays disabled until name and descriptor are filled.

If you have no images, the picker says "No images". Generate or upload one first.

## Edit or remove an entity

**Edit entity** opens the **Edit entity** dialog with the same fields. **Change image** swaps the reference image. The entity keeps its id when you swap, so storyboards and scripts that already use it stay linked. Choose **Save** to apply the change.

**Remove entity** removes the entity but leaves the image in your assets. Script speakers linked to a removed entity keep the stale id until you clear it.

## Reference images

The first reference image is the primary one. When an entity is used in a generation, its reference image goes along with the prompt as an image reference for models that accept one. An entity is stored on its image asset as metadata, so it needs no separate storage and appears wherever assets do.

## How entities are used in generation

When an entity applies to a prompt, NodeTool appends a block to it:

```
Consistency references:
- Nova: A young astronaut with cropped black hair and a worn orange flight suit
```

The rule for which entities apply is the same on every surface.

- With explicit entities selected, exactly those apply.
- With none selected, an entity applies when its name appears in the prompt text, ignoring case.
- With an empty prompt, every entity applies.
- An entity with an empty descriptor is skipped.

Where this happens:

| Surface | What it does |
|---------|--------------|
| Storyboard | The **Entities** field under **Board settings** pins a cast to the board. Styles and locations season every shot. Characters and props apply to shots that name them. Each shot's **Edit** view shows the cast as chips you can include or exclude for that shot. See [Creative Agent](creative-agent.md#entities-reusable-ingredients). |
| `@` mentions | The mention picker in the chat composer and the Prompt node lists entities first. A picked entity carries its descriptor and reference image into the generation. |
| Workflow nodes | `nodetool.creative.ApplyEntities` injects descriptors into a prompt and outputs `prompt` and `reference_images`. `LoadEntity`, `ListEntities`, and `CreateEntity` read and write the library. See [the node table in Creative Agent](creative-agent.md). |
| Entity picker | Entity properties on workflow nodes open a picker titled **Pick an entity**. It has a search box ("Search entities by name, kind, or tag") and filters for All, Characters, Locations, Styles, and Props. |

## Agent tools

The agent and the in-browser assistant use these tools.

| Tool | What it does |
|------|--------------|
| `list_entities` | Lists entities with id, name, kind, and descriptor. Filters by kind, text in the name or descriptor, and project. |
| `get_entity` | Reads one entity in full, including tags, reference images, voice, palette, and LoRA. |
| `apply_entities` | Returns a prompt seasoned with descriptors, plus the asset ids of the reference images. |
| `create_entity` | Tags an image asset as an entity. The image must exist already, so generate it first. |
| `update_entity` | Changes any field, or swaps the picture. Only the fields you pass change. |
| `delete_entity` | Removes the entity marker and keeps the image. |
| `ui_entity_list`, `ui_entity_apply` | The same list and apply behavior from the browser. |

Tools take the entity id, which is the id of its image asset.
