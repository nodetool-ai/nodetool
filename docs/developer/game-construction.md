---
layout: page
title: "Game Construction API"
permalink: /developer/game-construction
description: "Build a native game from a program and inputs with constructGame, then preview and apply rebuilds that keep manual edits."
---

Retained construction stores the program, inputs, and seed that produced a game document. Rebuilding runs the program again and merges the result with edits made by hand. The editor side of this workflow is described in [Rebuilding Generated Games](/game-engine/construction).

## constructGame

Use `constructGame` in the `@nodetool-ai/sandbox-game` pack to produce a bundle that `saveGame` stores.

```js
import { constructGame, saveGame } from "@nodetool-ai/sandbox-game";
const bundle = constructGame({ seed: 17, inputs: { speed: 4 } }, (inputs, builder) => {
  const speed = builder.parameter("speed", { type: "number", default: 4, min: 1, max: 10 });
  const document = builder.game();
  builder.prefab("marker", builder.entity("definition", 0, 0));
  builder.instance(document.scenes[0], "north-marker", "marker", {
    transform2d: { x: speed, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }
  });
  return document;
});
await saveGame({ name: "Retained study", ...bundle }, {
  games: nodetool.games, project_id: "<owned-project-id>"
});
```

`constructGame({inputs, seed}, callback)` runs the callback with the inputs and a `builder`, and returns `{document, program}` plus the retained parameters, prefabs, and instance relationships. The callback returns a native document.

Rules for the callback:

- It cannot close over variables from the surrounding session. Its source is stored and run again on every rebuild, so pass everything it needs through `inputs`.
- Give scenes, entities, prefabs, and instances explicit keys. Names and construction order do not define identity. Duplicate scene, entity, or prefab keys reject the build.
- Inputs are copied before the callback runs, so changing a template inside it does not change the stored inputs.
- Keep script behavior source separate from the construction body.
- A rebuild cannot fetch, install assets, generate resources, read secrets, or read the workspace. Prepare resources first and pass accepted asset bindings as literal JSON in `inputs`.
- Use `builder.random()` for randomness. The construction seed is independent of the play session seed.

### Builder

`builder` has the ordinary document helpers plus the following.

| Method | Purpose |
|---|---|
| `parameter(name, spec)` | Declares an input. Types are number (with optional `min` and `max`), string, boolean, enum (with `values`), vector2, and vector3 (arrays of two or three finite numbers). |
| `prefab(id, entity)` | Declares a reusable entity. |
| `instance(scene, key, prefabId, overrides)` | Emits an entity from a prefab under a stable key. Component overrides merge object fields with the prefab. Arrays replace the whole inherited array. |
| `random()` | Seeded random source. |

The resulting document uses the ordinary 2D or 3D format. A hand-authored document needs no construction metadata.

## Saving a bundle

`saveGame` with a bundle that has a `program` first previews a rebuild and checks that it reproduces the document. Pass `{games, project_id}` to create a game, or `{games, game_id, base_updated_at}` to replace an existing draft.

## Preview and apply

The editor and the agent use the same two calls on `nodetool.games`:

```js
const preview = await nodetool.games.previewAuthoring(gameId, { program });
// preview.conflicts, preview.affected_entities, preview.changed_dependencies,
// preview.restart_required, preview.candidate
await nodetool.games.applyAuthoring(gameId, preview.candidate);
```

`previewAuthoring` does not save. It rebuilds the program, merges it with the current draft, and returns the merged document, changed entities, changed asset dependencies, conflicts, whether play must restart, and a `candidate`. Without a `program` it uses the one stored in the draft.

`applyAuthoring` takes the candidate. It fails if the draft's update timestamp or digest differs from the values recorded in the candidate, if the rebuild no longer produces the previewed digest, or if conflicts remain. It saves the draft and does not publish.

## Overrides and conflicts

The merge tracks four kinds of manual change:

- Override: a property you changed on a generated entity. A later rebuild can change other fields and your value stays.
- Suppression: you deleted a generated entity. It stays deleted.
- Detachment: you took an entity out of generated ownership.
- Reset: you returned a field to the program.

Behavior arrays are atomic override values. Overriding one element overrides the whole array.

A rebuild reports a conflict when it removes an entity that has an override or is referenced elsewhere, when it generates an ID that collides with a manual entity, or when manual and generated changes both set the scene. Resolve conflicts before applying.

An active play session keeps the document it started with. Restart play to use a rebuild. Entities created at runtime by spawning never become authored entities.

## References

- [Retained-authoring reference](https://github.com/nodetool-ai/nodetool/blob/main/docs/game-retained-authoring.md) covers ownership operations and the delivery proof, and a delivery fixture that moves one collectible, suppresses another, changes parameters, rebuilds twice, and verifies a fixed-input win with snapshot restoration.
- [Builder reference](https://github.com/nodetool-ai/nodetool/blob/main/packages/sandbox-packs/sandbox-game/SKILL.md) lists every callable helper.
