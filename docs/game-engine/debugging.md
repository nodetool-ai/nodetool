---
layout: page
title: "Performance, Validation, and Debugging"
permalink: /game-engine/debugging
description: "Validate documents, inspect runtime failures, measure frames, and verify exported games."
---

Use a different check for each failure boundary. Validation catches document problems. Simulation catches gameplay failures. Capture checks the renderer. Browser play checks input and audio. Export smoke checks the packaged player.

![Existing game editor with scene tree, inspector, assets, and diagnostic status](/assets/screenshots/game-editor.png)

*The status line reports an unavailable GPU-effects path rather than silently claiming it rendered. [Screenshot provenance](/game-engine/screenshots).*

## Find the first failure

Start with `nodetool game validate game.json --json`. Read the diagnostic path and fix the referenced field. Then simulate a short recorded input sequence. Preserve the seed and inputs when comparing a fix.

The editor Console shows validation failures, script errors with entity and tick, log messages, reload errors, and diagnostic runs. **Run 10 s** uses an independent session. **Replay to tick** returns to an earlier point after a script failure. A script hot-reload compilation error keeps the previous source active.

For 3D appearance, capture through the actual WebGL2 renderer and inspect the image. A capture report includes capabilities, state hash, bounds, and rendering statistics. Missing required assets, unsupported rendering features, or unavailable Chromium should produce explicit errors.

## Measure the relevant work

Runtime timing records separate simulation systems. Use the game benchmark command described in the [renderer reference](https://github.com/nodetool-ai/nodetool/blob/main/packages/game-renderer/README.md) for warmed measurements and allocation information. The editor Profiler presents runtime and rendering information while playing.

Measure under a known renderer and host load. A software WebGL adapter and a hardware GPU are not interchangeable performance evidence. Preserve the original fixture, input count, and time limits when diagnosing a regression.

## Cull presentation, not gameplay

3D `performance.cullLayers` declares named maximum distances. An entity can select a layer or set its own `renderCulling.maxDistance`. The nearest setting in its parent chain wins. Distance is measured from the entity origin to the game camera.

Use this for small decoration. A large building can disappear while its nearest wall is still close to the camera because its origin is far away. Do not hide an essential objective or player. Culling changes visibility only. Physics and scripts continue. The editor inspection camera bypasses distance culling.

Frame budgets cover draw calls, triangles, particles, and audio voices. Omitted settings use player defaults. Overruns produce diagnostics rather than silently reducing the game. The document has no general quality-tier field.

## Recheck the whole route

After a fix, verify objective order, failure recovery, and [snapshot replay](/game-engine/saves-replay). Capture meaningful ticks and smoke-test the exported build. Keep exact commands, source revision, inputs, seed, renderer, and exit statuses with the result.

The [CLI reference](/cli#nodetool-game) and [native game pipeline](/harnesses#native-game-pipeline-templates-staging-playtest-web-build) describe validation, simulation, capture, and export options.
