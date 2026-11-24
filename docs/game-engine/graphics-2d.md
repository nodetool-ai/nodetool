---
layout: page
title: "2D Graphics"
permalink: /game-engine/graphics-2d
description: "Place sprites, build tile terrain, layer backgrounds, and add 2D lighting and screen effects."
---

2D art comes from image assets you install in the game. A sprite or tilemap points at an image asset by its slot name. Replace the image in the slot and every use updates, with no change to your entities.

![Kindle title scene with layered temple art, a character sprite, a tiled floor, and animated water](/assets/game-engine/kindle.png)

*Kindle combines sprites, scenery, animated water, light shafts, particles, and HUD widgets.*

## Place and animate art

Add a sprite component to an entity, choose its image asset, and set its size and draw layer. Higher layers draw on top.

Each image asset has a sampling setting:

- **nearest** keeps hard pixel edges. Use it for pixel art.
- **linear** blends neighboring pixels. Use it for painted or smooth art.

A sprite also has a blend mode:

- **normal** draws the image as is, with transparency.
- **additive** adds the image's color to what is behind it, so light and glow look brighter. Paint light shafts, sparks, and glows on black and use additive.

Flip X mirrors a sprite, and face motion turns the art toward the direction it moves. Sprite-sheet clips and visual tracks are covered in [Animation](/game-engine/animation).

## Build terrain

A tilemap is a set of positioned tiles, optionally cut from an atlas image. Mark a tile solid to make it block bodies. A one-way tile lets a character jump up through a platform and land on it. Collision categories and masks decide which bodies meet the terrain.

A tile image is only a picture until the tile is marked solid, so keep solid tiles aligned with the visible floor. Playtest a short walk and jump to check seams and ledges.

## Add depth with backgrounds

Backgrounds are scene layers separate from entities. Each layer has a size, an origin, a draw layer, parallax, scroll rate, and a repeat mode. Parallax 0 keeps the layer fixed to the screen like a distant sky. Parallax 1 moves it with the world. Repeat X tiles a horizontal strip. Repeat and mirror tile both directions. A frame picks one rectangle from an atlas.

## Light and grade the scene

Scene lighting combines an ambient level with point lights. Add a 2D light component to an entity and the light follows it. Turn on unlit for a glowing sprite to keep its own color. The HUD is never lit.

Screen effects run in order and include brightness and contrast, bloom (a soft glow around bright areas), and LUT color grading. Place the HUD after the effects to keep text crisp, or before them if it should share the look. An effect marked required must be available before play starts. A scene can chain up to eight effects.

Canvas2D draws the core scene but skips optional GPU effects with a warning. Check effect-dependent scenes on WebGPU. To capture a frame on a specific renderer, see [Debugging](/game-engine/debugging) and the [`nodetool game` command](/cli#nodetool-game).

Art, lighting, and visual effects never change collision shapes.

Field names for these components are in the [Game Document Reference](/developer/game-documents).
