---
layout: page
title: "Asset Preparation and Binding"
permalink: /game-engine/assets
description: "Prepare images, models, colliders, audio, and fonts before installing them in a game."
---

A game refers to logical asset slots. A binding records the installed asset and preparation metadata. Keep slot names stable when replacing artwork so entities and scripts continue to refer to the same purpose.

![Diagram showing source media becoming prepared assets, game bindings, and an exported build](/assets/game-engine/asset-pipeline.svg)

*Generation creates a candidate. Preparation and installation establish the bytes the game will use.*

## Prepare 2D images

Use the asset tools to trim alpha, resize with an explicit crop policy, choose a pivot, and set nearest or linear sampling. Trimming retains offsets so the intended anchor survives. Sprite-sheet preparation aligns frames. Terrain preparation can produce a 16-variant tile set. LUT preparation creates the packed image required by the 2D grading effect.

Inspect the sheet or prepared image before binding it. Check transparent edges on contrasting backgrounds, frame alignment during animation, and tile seams while scrolling.

## Prepare 3D content

Models use GLB. Preparation validates supported features and reports a digest, bounds, node IDs, clip IDs, triangle count, and geometry and texture bytes. Import settings normalize scale, forward direction, and origin. Use the prepared node and clip IDs when attaching animation or selecting a model subtree.

Colliders have a separate preparation path. Use a convex hull for moving geometry or a static triangle mesh for a detailed fixed surface. Bind the verified collider bytes and add a collider component. A model binding alone provides no collision.

The current image-preparation contract accepts PNG, JPEG, and WebP for 3D image bindings. That does not complete the separate material texture, toon, or outline renderer. HDRI has schema and renderer callback contracts but lacks the standard host preparation/loading route. See [3D rendering limits](/game-engine/graphics-3d).

## Install sound and fonts

Bind audio before assigning scene music or an audio source. Bind TTF or OTF fonts by logical ID. Required fonts must load before play or capture. Optional fonts may fall back with a diagnostic. Exports include the bytes for offline use.

In the editor Assets panel, **Generate** or **Regenerate** produces a candidate. **Use** selects a candidate and updates the slot's frame or tile references. Agent and workflow staging is also a candidate step until installation succeeds.

## Keep a game portable

Export from installed bindings and verified bytes. A database asset ID from another machine is not portable by itself. The example installer copies bundled assets into the destination project and rewrites bindings. Keep model node IDs and content digests intact while letting installation assign owned resource IDs.

For CLI files, supply an asset directory containing the files expected by their full asset IDs. A prepared collider uses `<full-asset-id>.json`. Use the [CLI reference](/cli#nodetool-game) for each command's asset-directory behavior.
