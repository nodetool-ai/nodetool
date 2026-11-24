---
layout: page
title: "Game Document Reference"
permalink: /developer/game-documents
description: "The JSON structure of a native game document: scenes, entities, components, versions, coordinate conventions, and edit operations."
---

This page is for people who edit game JSON directly or call the game API. If you are making a game in the editor, use the [Game Engine guides](/game-engine/) instead.

## Document shape

A game document is one JSON object. These top-level fields apply to both 2D and 3D:

| Field | Meaning |
|---|---|
| `schemaVersion`, `engineVersion` | The document format and the engine that runs it. See [Versions](#versions). |
| `id`, `revision` | Game identity and the revision of this document. |
| `entrySceneId` | The scene a new session starts in. |
| `tickRate` | Always `60`. |
| `inputActions`, `inputBindings` | Named input actions and their key, button, or touch bindings. 3D also has `inputAxes`. |
| `assets` | Asset bindings. Each key is a logical slot that entities refer to by `assetId`. |
| `scenes` | One or more scenes. Each has `id`, `name`, and `entities`. |
| `audio`, `ui`, `screens` | Optional audio mixer, HUD tree, and screens. |

2D documents add `pixelsPerUnit`, `collisionLayers`, `renderEffects` (up to eight), and `hudEffectOrder`. A 2D scene adds `music`, `lighting`, `gravity`, `backgrounds`, and `ui`.

3D documents add `dimension: "3d"`, `presentation`, `collisionMatrix`, `physicsMaterials`, `prefabs`, `animationGraphs`, `materials`, and `performance`. A 3D scene holds `environment`, and a document holds up to 64 scenes.

An entity has a stable `id`, a `name` label, an optional `parentId`, `tags`, `props`, `templateOnly`, a transform, components, and `behaviors`. Scripts and saves refer to the `id`, so rename with `name`.

## Versions

| Dimension | `schemaVersion` | `engineVersion` | Adds |
|---|---|---|---|
| 2D | `1` | `"1"` | Base format |
| 2D | `2` | `"1"` | Lighting, backgrounds, gravity, music, visual animation, `sprite.unlit` |
| 2D | `4` | `"3"` | Entity `tags` and `props`, script parameters |
| 3D | `3` | `"2"` | The 3D document |

The pairing is enforced: a document whose `engineVersion` does not match its `schemaVersion` fails validation. 2D schema `5` with engine `"4"` (Rapier 2D physics) is reserved. Validation rejects it with "engine version 4 (Rapier 2D physics) is not available in this runtime".

3D accepts tags and properties at schema `3`. In 2D they require schema `4`.

These tables come from `GAME_2D_ENGINE_BY_SCHEMA` in `packages/protocol/src/game2d/index.ts`, the 3D document in `packages/protocol/src/game3d/index.ts`, and the checks in `packages/game-runtime/src/validate.ts`.

## Coordinate conventions

- 2D positions use world units. `pixelsPerUnit` converts image pixels to units.
- 3D world coordinates use meters, +Y up, and -Z forward.
- 3D rotations are quaternions in `[x, y, z, w]` order and must be normalized. The identity is `[0, 0, 0, 1]`.
- 3D scale must be positive on every axis.
- A physics hierarchy rejects scale on bodies and more than one component driving the same pose. See [Physics](/game-engine/physics).

## Entity examples

A 2D entity:

```json
{
  "id": "hero", "name": "Hero",
  "transform2d": { "x": 4, "y": 2 },
  "sprite": { "assetId": "hero-sheet", "width": 1, "height": 2, "layer": 1 },
  "body2d": { "type": "kinematic" },
  "collider2d": { "width": 0.8, "height": 1.8 },
  "behaviors": [{ "kind": "health", "maximum": 3 }]
}
```

A 3D entity. Visible geometry and the collider are separate components:

```json
{
  "id": "crate", "name": "Crate",
  "transform3d": {
    "position": { "x": 2, "y": 0.5, "z": -3 },
    "rotation": [0, 0, 0, 1],
    "scale": { "x": 1, "y": 1, "z": 1 }
  },
  "primitive": { "kind": "box", "dimensions": { "x": 1, "y": 1, "z": 1 } },
  "body3d": { "type": "dynamic", "mass": 5 },
  "collider3d": { "kind": "box", "halfExtents": { "x": 0.5, "y": 0.5, "z": 0.5 } }
}
```

## Edit operations

`edit_native_game` takes `game_id`, `base_updated_at`, and an `ops` array. Each operation is not a full document. An `update_entity` operation replaces each field it supplies. A top-level `null` removes that field. A nested `null` stays JSON data.

```json
{
  "op": "update_entity",
  "entity_id": "door",
  "set": { "tags": ["gate"], "props": { "requiredKey": "amber" } }
}
```

Other operations include `update_scene`, `set_game`, `set_audio`, `set_ui`, `apply_environment_preset`, and the 3D prefab and animation graph operations. The full list and arguments are in the tool schema in `packages/agents/src/capabilities/game.specs.ts`.

An `update_scene` edit to `environment` replaces the whole environment object, so send every field you want to keep.

## Prefabs and construction

A 3D prefab declares `rootId`, `entities`, `externalAssets`, and `externalScenes`. A 2D prefab is an entity with `templateOnly: true`, spawned by a `spawn` behavior. A template-only entity is not part of the initial active scene.

Retained construction (see [Construction](/game-engine/construction)) places generated entities from stable explicit construction keys. The key, not the entity position in the list, identifies an entity across rebuilds. Resetting an override, detaching a generated entity, and deleting it have different effects on later rebuilds.

## 2D rendering fields

A sprite has `assetId`, `width`, `height`, `layer`, optional `frame` (`x`, `y`, `width`, `height` in image pixels), `tint`, `opacity`, `blend` (`"normal"` or `"additive"`), `unlit`, `flipX`, and `faceMotion`. An asset binding's `sampling` is `"nearest"` (the default) or `"linear"`. Tiles and background layers accept `sampling` too.

```json
{
  "sprite": { "assetId": "hero-sheet", "width": 1, "height": 2, "layer": 1,
              "frame": { "x": 0, "y": 0, "width": 32, "height": 64 }, "faceMotion": "right" },
  "tilemap": { "assetId": "ground", "layer": 0,
               "tiles": [{ "x": 0, "y": 0, "width": 1, "height": 1, "solid": true }] }
}
```

Render effects are `brightnessContrast`, `bloom`, and `lut`. Each can carry `required`.

## 3D environment fields

```json
"environment": {
  "background": "#202838",
  "ambient": { "color": "#ffffff", "intensity": 0.5 },
  "fog": { "kind": "height", "color": "#c4d9ed", "density": 0.02,
           "baseHeight": 0, "heightFalloff": 0.2, "maxOpacity": 1 },
  "sky": { "kind": "procedural", "turbidity": 10, "rayleigh": 2,
           "groundColor": "#3d3a36", "intensity": 1 },
  "shadows": { "enabled": true, "mapSize": 1024, "extent": 30 },
  "postProcessing": { "toneMapping": "aces", "antialias": "msaa" }
}
```

- Linear fog is `{ "color", "near", "far" }` and is an alternative to height fog. Height fog density is 0.000001 to 10. `heightFalloff` is 0.000001 to 100.
- Sky `kind` is `color`, `procedural`, or `hdri`. `turbidity` is 1 to 20, `rayleigh` is 0 to 4, and `intensity` is 0 to 8. `procedural` uses `sunEntityId`, or the first directional light.
- `shadows.mapSize` is 512, 1024, or 2048. `cascades` is `{ count: 2..4, split: 0..1, maxDistance }` and replaces the single map sized by `extent`. At most four point or spot lights render shadows in a frame.
- Light `shadowBias` is -0.01 to 0.01. Small negative values such as `-0.0005` remove shadow acne. `shadowNormalBias` is 0 to 1, a world-unit offset along the surface normal before the shadow lookup. A value such as `0.02` fixes acne on slopes. Both default to 0.
- `postProcessing` runs bloom, exposure and tone mapping, vignette, then antialiasing. `toneMapping` is `aces`, `agx`, `neutral`, or `linear`. `antialias` is `msaa`, `fxaa`, `smaa`, or `none`. `enabled: false` bypasses the chain and keeps the settings.

A `decal3d` component has `assetId`, `receiverId`, `size: {x, y, z}`, `opacity`, and `renderOrder`. The receiver is another entity in the same scene with a primitive or rigid model. Decals test depth without writing it. Projection work is limited per frame, and large or unsupported receivers report diagnostics.

Named `materials`, texture slots, `toon` shading, outlines, and `hdri` skies exist in the schema, but the renderer does not apply them yet.
