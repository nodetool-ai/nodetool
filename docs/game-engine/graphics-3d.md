---
layout: page
title: "3D Models, Lighting, and Rendering"
permalink: /game-engine/graphics-3d
description: "Render prepared models and primitives with lights, shadows, skies, fog, and post-processing."
---

3D games render through WebGL2. World coordinates use meters, +Y up, and −Z forward. Entity rotations are quaternions in `[x, y, z, w]` order.

![BLACKSITE first-person view showing textured architecture, props, lighting, and HUD](/assets/game-engine/blacksite.png)

*BLACKSITE uses prepared model assets. Embedded GLB textures are distinct from the unfinished separate material-texture interface. [Capture source](/game-engine/screenshots).*

## Add a model or primitive

Bind a prepared GLB and add `model: {assetId}` to an entity. A `nodeId` selects a prepared model node. Model preparation reports bounds, node IDs, clip IDs, and resource costs. Use those reported IDs rather than names guessed from the original file.

Primitives provide procedural geometry without an imported model. Inline materials support color, metalness, roughness, opacity, emissive color, and opaque, masked, or blended alpha. Model material overrides support scalar fields. An embedded model can retain its own supported textures.

The schema also accepts named materials, separate texture slots, toon shading, and outlines. The current primitive and model-override renderers do not apply those fields. Do not use their schema acceptance as proof that a captured frame will show them.

## Set the environment

![AETHER editor showing the 3D viewport and scene environment inspector](/assets/game-engine/editor-3d.png)

*The scene inspector exposes the environment preset, ambient light, and linear fog. The viewport includes editing helpers. [Capture provenance](/game-engine/screenshots).*

The environment contains the background, ambient light, fog, shadows, sky, and post-processing. An `update_scene` environment edit replaces the whole environment object. Preserve the fields you are not changing.

Use the Sunny day, Night, Overcast, or Neon interior preset as a starting point. Then adjust the scene's sun and environment. A solid sky uses the background color. A procedural sky uses a directional light for the sun, with turbidity, Rayleigh scattering, ground color, and intensity controlling its appearance and reflected light.

Linear fog fades between `near` and `far`. Choose **Height** in the scene inspector's **Fog mode** control for exponential height fog. Fog modes are alternatives. Height fog does not add a second layer over linear fog.

Height fog uses `{kind: "height", color, density, baseHeight, heightFalloff, maxOpacity}`. Density controls attenuation through the fog. Base height sets its reference altitude, and height falloff reduces density above that altitude. Max opacity caps the result. Perspective and orthographic cameras are supported. Fog changes presentation without changing simulation state or replay.

HDRI schemas and renderer callbacks exist, but the standard editor, capture, and player hosts do not provide the complete loading path. Use a solid or procedural sky.

## Project image decals

Install an image asset, select a projector entity, then use its **Decal** section to choose an image and receiver. **Add decal** creates a valid component. Adjust its size, opacity, and render order, or remove it from the same section. A scene supports up to 32 authored decals.

A `decal3d` component specifies `assetId`, `receiverId`, `size: {x, y, z}`, `opacity`, and `renderOrder`. The receiver must be a different entity in the same scene with a primitive or rigid model. Template entities and animated models are not valid receivers. Hidden receiver meshes are excluded. Skinned, morph-deformed, instanced, transparent, and masked receiving meshes are rejected with diagnostics. Decals use prepared image bindings, including image alpha.

Position and rotate the projector so its volume intersects the receiving surface. Entity and parent transforms affect the projector, including scale. Parent it to a moving receiver to keep the marking attached. An unparented projector remains fixed in world space and projects onto surfaces that enter its volume.

Decals test scene depth, do not write depth, and use polygon offset to avoid flicker against the receiving surface. Only the chosen receiver gets the image. Foreground geometry can still occlude it. Render order resolves overlaps deterministically.

Projection has bounded node, triangle, candidate, and output work. Large or unsupported receivers report diagnostics rather than allocating without a limit. Decals affect rendering, not collision geometry or replay state.

## Budget shadows

One directional light can cast shadows. Its shadow map uses `mapSize` and `extent`, or two to four cascades when enabled. Cascades distribute resolution through the camera's depth range. Up to four point or spot lights can cast shadows in a scene. A point shadow renders six views, so use it selectively.

Start with the default bias. If a surface shows striped self-shadowing, adjust `shadowNormalBias` or `shadowBias` in small steps and capture the result. Excessive bias separates a shadow from its caster.

## Finish the image

Post-processing applies bloom, exposure and tone mapping, vignette, then antialiasing. Tone mapping offers ACES, AgX, Neutral, or Linear. Antialiasing offers MSAA, FXAA, SMAA, or none. `enabled: false` preserves the settings while bypassing the chain.

Use [distance culling and frame budgets](/game-engine/debugging) for larger scenes. The editor's inspection camera shows culled entities so they remain editable. Editor wireframe, normal, selection, and light-helper views are inspection aids, not exported gameplay effects.
