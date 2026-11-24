---
layout: page
title: "3D Graphics"
permalink: /game-engine/graphics-3d
description: "Add models and shapes, light and sky, fog, decals, shadows, and post-processing to a 3D scene."
---

3D games render through WebGL2. Positions are in meters with +Y up. The scene's environment holds its sky, fog, shadows, and post-processing.

![BLACKSITE first-person night view with shadowed lighting, rain particles, floor decals, and HUD](/assets/game-engine/blacksite.png)

*BLACKSITE combines models with cascaded shadows, height fog, bloom, decals, and particles.*

## Models and Primitives

Install a GLB model as an asset, then add a model component to an entity and pick the asset. Choose a node to show only part of the model. Use the node and animation clip names that the model report lists, not names guessed from the original file.

Primitives (box, sphere, capsule, and plane) give you shapes without importing anything. A material sets color, metalness (metal look), roughness (matte or glossy), opacity, and emissive color (self-lit glow). Models keep their own embedded textures. Separate material and texture slots, toon shading, and outlines are not rendered yet, so do not rely on them.

A visible shape has no collision. Add a collider separately.

## Lighting and Sky

![AETHER editor showing the 3D viewport and scene environment inspector](/assets/game-engine/editor-3d.png)

*The scene inspector sets the environment preset, ambient light, and fog.*

Start from an environment preset in the scene inspector: Sunny day, Night, Overcast, or Neon interior. Then adjust the scene's sun and ambient light.

The sky has two usable styles:

- **Solid** fills the background with one color.
- **Procedural** draws a sky from the scene's sun light. **Turbidity** is haze: higher values whiten the sky. **Rayleigh** sets how blue the sky is and how strong sunsets look. **Ground color** tints the lower half. **Intensity** brightens the sky and the light it casts on objects.

Image-based (HDRI) skies are not available. Use a solid or procedural sky.

Changing the environment in an edit replaces the whole environment, so keep the fields you are not changing.

## Fog and Decals

Fog hides distance. Linear fog fades objects in between a near and a far distance. In the scene inspector, set **Fog mode** to **Height** for fog that is thicker near the ground:

- **Density** is how quickly objects disappear into the fog.
- **Base height** is the altitude where fog is thickest.
- **Height falloff** is how fast fog thins above that altitude.
- **Max opacity** caps how opaque the fog gets.

Linear and height fog are alternatives, not layers. Fog works with perspective and orthographic cameras and does not affect gameplay or replays.

Decals project an image onto a surface, such as a stain, a scorch mark, or a sign. Install an image asset, select a projector entity, and in its **Decal** section choose the image and the receiving entity, then choose **Add decal**. Adjust size, opacity, and render order there. A scene can have up to 32 decals.

- The receiver must be a different entity in the same scene, a primitive or a rigid model. Animated, skinned, transparent, and masked meshes cannot receive decals and report a warning.
- Place and rotate the projector so its box overlaps the receiving surface. Parent it to a moving receiver to keep the mark attached.
- Image transparency is respected. Other objects in front can still hide the decal.
- Decals do not affect collision or replays.

## Shadows and Post-Processing

Directional lights, and up to four point or spot lights, can cast shadows. Each point light shadow costs six views, so use few. **Map size** sets shadow sharpness. **Cascades** split the camera's view into two to four ranges so nearby shadows stay sharp and far ones stay cheap. Use them for large outdoor scenes.

If a surface shows stripes of self-shadowing, raise the light's shadow bias slightly. Too much bias makes a shadow float away from its object.

Post-processing runs in this order:

1. **Bloom** adds a glow around bright areas.
2. **Exposure and tone mapping** set overall brightness and contrast. Choose ACES, AgX, Neutral, or Linear.
3. **Vignette** darkens the corners.
4. **Antialiasing** smooths jagged edges. Choose MSAA, FXAA, SMAA, or none.

Turn **Enabled** off to bypass the effects and keep the settings.

For big scenes, see [distance culling and frame budgets](/game-engine/debugging). The editor camera still shows culled objects so you can edit them. Wireframe, normal, selection, and light-helper views are editing aids and are not exported with the game.

Coordinate conventions and field-level settings are in the [Game Document Reference](/developer/game-documents).
