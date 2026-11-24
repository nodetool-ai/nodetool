---
layout: page
title: "Presets"
permalink: /presets
description: "Presets are catalogue entries (camera moves, looks, effects) that add model-specific wording to your prompt, stack up to three at a time, and open as an editable workflow."
---

**Navigation**: [Docs index](index.md) | [Storyboard Editor](storyboard-editor.md) | [Harnesses](harnesses.md#nodetool-presets) → **Presets**

A preset is a named piece of direction, such as a dolly zoom, a Kodak film stock or a glass-shatter effect. When you generate, NodeTool adds wording for the model you chose to your prompt, so you pick the move or look instead of phrasing it yourself.

> **Runs:** locally. **Needs:** no API key to browse presets or open one as a workflow. The generation that uses a preset needs the model's provider key or a local model (see [Providers](providers.md)). **Costs:** choosing a preset is free. The render is billed by the provider at its rates.
{: .callout-note}

## Kinds of presets

| Kind | What it does | Examples |
|---|---|---|
| Camera | Camera moves, rigs and speed changes | Dolly zoom, whip pan, orbit, handheld, steadicam, speed ramp |
| Look | Camera body, film stock, color grade, lighting, era finish, speed ramps | Kodak 5219, teal and amber, Rembrandt key, 1920s silent film, VHS |
| Effect | One transformation applied to the subject | Glass shatter, molten gold, origami fold, claymation |
| Video restyle | An effect that repaints an existing video and keeps its action and timing | Anime, watercolor, clay animation, pixel art, oil painting, comic book, film noir, neon |

A preset only appears for the kind of request it supports: text to video, image to video, reference video, image, image edit or video edit.

## Combine presets

Pick up to three presets for one render. The picker disables a card that would break a rule and tells you why:

- Two presets that cover the same slot cannot combine. A camera move, a rig and a film stock fit together. Two camera moves do not.
- Some presets cannot be combined with any other preset.
- Some pairs conflict. A black-and-white look conflicts with a color-dependent treatment, and a look's speed ramp conflicts with the camera speed ramp.
- A preset must support the current kind of request.

Camera and look presets share the three-preset limit.

## Where presets appear

| Where | How to use it |
|---|---|
| Shot editor in a storyboard | The **Movement** field takes your own words or opens the camera preset picker. See [Edit a shot](storyboard-editor.md#edit-a-shot) |
| Storyboard looks | Open **Change Style** and choose a **Board look** to apply a look to every shot. In the shot editor, **Choose look** overrides it for one shot. An empty selection inherits the board look |
| Effects gallery | Open it from **+ New**, or from an effects studio on the start page. A studio shows only its own effects until you choose **Show all effects** |
| Create | Open **Image**, **Video** or **Read aloud** from **+ New**. In image and video modes the preset chip opens the picker. The chip turns into a warning when the model has no wording tuned for the preset |
| Chat composer | The same **Presets** picker, with **Camera**, **Look** and **Effect** filters. Choose Retake, attach a video and pick a restyle |
| Studios | The **Studios** section of the start page opens one of the surfaces above with presets already chosen, such as **Cinematic shot** or **Talking head** |

A card plays a short preview loop when you hover it or focus it with the keyboard. The loop stays still if your system asks for reduced motion.

## Wording for different models

Each model family reads prompts differently, so a preset carries separate wording per family. When a preset has none for your model, NodeTool uses its general wording and shows a warning on the preset chip and under the shot's **Prompts** preview. The render still runs.

The **Prompts** preview in the shot editor shows the exact clip prompt, with preset wording included, before you spend anything.

## Restyle a video

Choose Retake in the chat composer, attach a video and select a restyle from the preset chip. Keep your own prompt short or leave it empty. A photoreal description pulls the result back toward a photograph.

## Open a preset as a workflow

**Open as workflow** turns a render into an editable workflow. It appears on Create results, Effects results and restyles in **Generations**, and on a storyboard shot and each of its still and clip takes.

The workflow holds the prompt wording for the model you used, so editing the text changes what the model receives. Storyboard takes keep their original prompt, model, presets, source media and settings, and later edits to the shot do not change the opened take. Takes rendered before this was tracked ask you to render a new take instead.

A finished Lipsync studio run also offers **Open as workflow**. It opens a workflow that speaks the line, animates the picture and outputs the clip.

## Lipsync studio

Open **+ New → Lipsync**, or choose **Talking head** under studios on the start page.

1. Upload a picture, or choose an entity with a saved reference image.
2. Enter a line, then choose a speech model and voice.
3. Choose a lipsync video model.
4. Choose **Render lipsync**.

The studio generates speech first and uses that audio to animate the picture. The clip appears in the studio and in **Generations**. Closing the tab keeps your work and the running generation.

For a real person, select **This is a real person** and confirm that you have their consent. Replacing the picture clears the confirmation. NodeTool rejects a real-person request without it.

## Share presets

Presets from the community install as packs from the command line. See [Preset Catalog Reference](developer/presets.md#community-preset-packs). A card shows the pack author's name. If you remove a pack, boards that used one of its presets report an unknown preset when you render, so reinstall the pack or remove that selection first.

## Ask the assistant

- "Which camera presets work for a slow reveal of this building?"
- "Apply the dolly zoom and a teal and amber look to shot 3 of my storyboard."
- "Generate a 5-second video of a runner at a trail fork with the whip pan preset."
- "Give every shot on this board a Kodak film look."

Builders driving this from code or MCP: see [Creative Agent Tools](developer/creative-agent-tools.md#presets). Catalog schema, compiler rules and preset authoring: [Preset Catalog Reference](developer/presets.md).
