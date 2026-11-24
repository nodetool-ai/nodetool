---
layout: page
title: "Performance and Debugging"
permalink: /game-engine/debugging
description: "Find script errors with the editor Console, watch frame cost in the Profiler, and keep large 3D scenes within budget."
---

![Game editor with scene tree, inspector, assets, and status line](/assets/screenshots/game-editor.png)

*The game editor. The Console and Profiler are panels in the same editor.*

## Console

The **Console** panel collects messages while the game plays. Each line has a level (Error, Warning, or Log) and comes from a script, the runtime, a validation check, a build, or a diagnostic run.

- Use the level buttons to hide or show one level, the **Filter** box to search, and **Clear** to empty the list.
- A line that repeats is shown once with a count.
- A line that belongs to an entity has a link that selects it. **Ask the assistant** sends the line to the agent.

When a script fails, the script editor shows the error and the tick where it happened. **Replay to tick** runs the game up to the tick before the failure. **Run 10 s** in the script editor header plays 10 seconds in a separate session so you can try a script change without touching your current play session. If a script fails to compile after a change, the previous version keeps running.

## Profiler

Open the **Profiler** panel and press Play. It records every tick while the panel is open. It shows:

- **Frame time** and the tick budget for the game's tick rate.
- **Simulation CPU** per system, and **Scripts** time per entity with call counts.
- **Rendering** draw calls, triangles, and texture and geometry memory. These are not reported in 2D.
- **Physics and audio** counts: bodies, contacts, and audio voices.

**Record** and **Stop** make a capture, **Export JSON** saves it, and **Clear** resets the totals.

## Hide distant objects in 3D

Distance culling stops drawing an entity when it is farther from the game camera than a set distance. It only affects what is drawn. Physics and scripts keep running for hidden entities, and the editor's inspection camera ignores culling.

Culling is a 3D document setting. The editor has no field for it, so ask the agent to set it or edit the document.

- `performance.cullLayers` names distance presets, for example `{ "small-props": { "maxDistance": 60 } }`.
- An entity picks a preset with `renderCulling.layer`, or sets its own distance with `renderCulling.maxDistance`. Its own distance wins over the preset.
- If an entity sets neither, the nearest parent that does applies to it. Hiding a parent hides its children.

Distance is measured from the entity's origin, not its nearest surface. A large building can vanish while one wall is still close, so use culling for small decoration and never for the player or an objective.

## Frame budgets

`performance.budgets` in a 3D document sets limits for draw calls, triangles, particles, audio voices, tick time (`tickMs`, default 4 ms), and frame time (`frameMs`, default 16.6 ms). Players log a warning to the browser console when a frame goes over a count budget. Settings you omit use the defaults. A budget never lowers quality on its own.

To check budgets from the command line, see [Game Testing and Replay](/developer/game-testing).
