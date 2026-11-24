---
layout: page
title: "Assets"
permalink: /game-engine/assets
description: "Add images, 3D models, audio, and fonts to a game and assign them to objects."
---

Assets are the images, 3D models, audio clips, and fonts your game uses. Every asset sits in a named asset slot, such as `hero-sheet`. Objects and scripts refer to the slot name, so you can swap the artwork behind a slot later without touching anything that uses it. Keep slot names stable.

![Diagram showing source media becoming prepared assets, game bindings, and an exported build](/assets/game-engine/asset-pipeline.svg)

*An asset is created or imported, prepared for the game, bound to a slot, and included in exports.*

## Add and generate assets

- **Generate in the editor.** Open the **Assets** panel, select an asset, and choose **Generate** (or **Regenerate** to replace it). Write a prompt in the dialog and choose **Generate and install**. The result is added to the slot. Earlier versions stay listed as staged candidates.
- **Ask the assistant.** **Ask the assistant to generate** sends the slot and prompt to the **Assistant** panel. You can also ask it to install an existing file.
- **From the command line.** See the [CLI reference](/cli#nodetool-game).

Models use the GLB format. Fonts use TTF or OTF. Audio is installed before you assign it as music or to an audio source.

## Browse and configure assets

The **Assets** panel has tabs for **Assets**, **Prefabs**, and **Scenes**. Search, filter by type (images, audio, fonts, models, colliders), and switch between list and grid view. Selecting an asset shows where it is used and its staged candidates. Choose **Use** on a candidate to make it the current asset. If the new image changes a sprite sheet's size, the panel warns when frames fall outside it or still point at the old image.

For more control, open the **Inspector**, switch to the **Game** tab, and use **Asset bindings**. Each slot lists its settings, including:

- **Pivot:** the point the image is positioned and rotated around. The default is the center.
- **Sampling:** `nearest` keeps pixel art crisp, and `linear` smooths scaled art.

Add a **New asset slot** at the bottom, or remove a slot with the close button.

## Prepare 2D images

Generated and imported images can be prepared as they are installed:

- **Trim transparent edges** removes empty margins and keeps the original anchor point.
- **Resize** to a target width and height, filling the frame (`cover`), fitting inside it (`contain`), or stretching.
- **Mirror** horizontally or vertically.
- **Sprite sheet** setup splits a generated image into frames of equal size.
- **Terrain tiles** can produce a 16-variant tile set.

Check transparent edges on dark and light backgrounds, frame alignment in animation, and tile seams while scrolling.

## 3D models and colliders

A model is only a visual. To make it solid, add a collider: a convex hull for moving objects or a static triangle mesh for detailed fixed surfaces, then add a collider component to the object. Imported models are normalized for scale, forward direction, and origin. Use the model's listed node and animation clip names when you attach animation.

## Assign an asset to an object

Select the object in the **Hierarchy**, then pick the slot in the matching **Inspector** field. For example, choose an image slot on a sprite, an audio slot on an audio source, or a model slot on a 3D mesh. The **Used by** list in the Assets panel then shows the object.

Exports include every bound asset, so a finished game works offline. See [Publishing](/game-engine/publishing).
