---
name: sandbox-game
description: Build a complete native game document with entities, scripts and level geometry, then save the draft in one edit
---

# Games as code

Import `@nodetool-ai/sandbox-game` in a game chat, CodeAct action or JS script.
It creates plain game documents for `nodetool.games`. Build geometry in local
loops and save the entire draft with one `set_document` edit. The server
validates the schema and references before writing. It retains the game's
stored ID and revision. Publishing requires a separate request.

The helpers follow the shipped game document schema. Position, size and
gravity use world units. Simulation runs at 60 ticks per second. Assets must
already be installed or use the built-in asset bindings.

## Build and save a level

```js
import { game, entity, script, registerAssets, fill, plank, arc, saveGame }
  from "@nodetool-ai/sandbox-game";

const document = game({ pixelsPerUnit: 48 });
registerAssets(document, {
  stone: { assetId: "builtin:wall", digest: "builtin:wall-v1", width: 32, height: 32 },
  gem: { assetId: "builtin:gem", digest: "builtin:gem-v1", width: 32, height: 32 }
});
const tiles = [];
fill(tiles, 0, -2, 80, 2);
plank(tiles, 4, 2, 8, { oneWay: true });
const level = document.scenes[0];
level.entities.push(entity("terrain", 0, 0, {
  tilemap: { assetId: "stone", tiles, solid: true, layer: 0 }
}));
for (const [index, point] of arc(8, 3, 3, 2, 7).entries()) {
  level.entities.push(entity(`gem-${index}`, point.x, point.y, {
    sprite: { assetId: "gem", width: 0.5, height: 0.5 },
    collider2d: { width: 0.5, height: 0.5, sensor: true },
    behaviors: [{ kind: "collectible", score: 1 }]
  }));
}
level.entities.push(entity("camera", 8, 2, { camera2d: { width: 16, height: 9 } }));
level.entities.push(entity("logic", 0, 0, {
  behaviors: [script(({ tick }) => ({ state: {}, commands: tick === 600 ? [{ kind: "emit", event: "ready" }] : [] }))]
}));
const saved = await saveGame({ name: "Arc study", document }, {
  games: nodetool.games, project_id: "<owned-project-id>"
});
await output("game_id", saved.game_id);
```

Add a player and its controller before calling a level playable. Read
`nodetool.games.getExample("kindle")` for a complete platformer document and
load the `native-game` and `game-direction` skills for the runtime contract
and craft requirements.

## Helpers

| Export | Contract |
|---|---|
| `game(options = {})` | Creates a schema version 2 document. Defaults to one empty `level` scene, 32 pixels per unit and left/right/up/down/space actions. Pass scenes, assets, collision layers and render effects directly. |
| `entity(id, x = 0, y = 0, options = {})` | Creates an entity with a complete transform and behavior list. Pass sprite, body, collider, animator, camera, light and prefab settings in options. |
| `script(source, options = {})` | Creates a script behavior from a source string or function. Defaults to 16 commands and 8 ms per tick. Functions cannot close over the builder's variables. |
| `registerAssets(document, bindings)` | Copies slot bindings into the document. Sets pivot and sampling defaults. Audio and font dimensions default to 1×1. Images require their actual dimensions. This does not install files. |
| `fill(tiles, x, y, cols, rows, options = {})` | Appends tile centres to an array. The first centre is `(x,y)`. Spacing is `width` and `height`, which default to `size` or 1. Options also carry frame, solid and oneWay fields. |
| `plank(tiles, x, y, cols, options = {})` | Appends one horizontal row using `fill`. |
| `arc(x, y, radiusX, radiusY, points, from = 0, to = Math.PI)` | Returns evenly spaced elliptical arc positions including both endpoints. Angles use radians. One point uses `from`. |
| `saveGame({name, document}, options)` | Pass `{games: nodetool.games, project_id}` to create a game and save its draft. Pass `{games, game_id, base_updated_at}` to replace an existing draft. Returns game_id, revision and draft_updated_at. Refused writes and conflicts throw. |
| `constructGame({inputs, seed}, build)` | Runs an explicit callback with `inputs` and `builder`, returning `{document, program}` plus retained parameters, prefabs and instance relationships. Preparation results must be literal JSON inputs. Use stable scene and entity IDs. |

For an existing draft, read its `draft_updated_at` and pass it as
`base_updated_at`. Save all scene references and bindings together. Invalid
asset references, duplicate entities or script budget violations reject the
whole edit. A failed replacement leaves the previous draft intact.

## Retained construction

Use an explicit callback for construction that can run again without preparation.
The callback receives `inputs` and `builder` and returns a native document. It
cannot close over variables in the authoring session. Keep runtime script
behavior source separate from this construction body.

```js
import { constructGame, saveGame } from "@nodetool-ai/sandbox-game";
const bundle = constructGame({ seed: 17, inputs: { speed: 4 } }, (inputs, builder) => {
  const speed = builder.parameter("speed", {type: "number", default: 4, min: 1, max: 10});
  const document = builder.game();
  builder.prefab("marker", builder.entity("definition", 0, 0));
  builder.instance(document.scenes[0], "north-marker", "marker", {
    transform2d: {x: speed, y: 0, rotation: 0, scaleX: 1, scaleY: 1}
  });
  return document;
});
await saveGame({ name: "Retained study", ...bundle }, {
  games: nodetool.games, project_id: "<owned-project-id>"
});
```

`builder` includes the ordinary document helpers plus `parameter`, `prefab`,
`instance`, and seeded `random`. Parameter types are number, string and
boolean, enum, vector2 and vector3. Numeric parameters accept min and max.
Enum parameters declare `values`. Vector parameters use arrays of two or
three finite numbers. Prefabs are retained in the
construction source and emit native entities through stable instance keys.
Instance component overrides merge individual object fields with the prefab.
Arrays replace the complete inherited array. Preparation inputs are copied
before the callback runs, so mutating a template does not alter retained inputs.
Duplicate scene, entity and prefab keys reject the build.

Saving a bundle with `program` first previews a hermetic rebuild and checks
that it reproduces `document`. Applying the candidate checks the draft has
not changed since preview. Rebuilds cannot fetch, install assets, generate
resources, access secrets or read the workspace. Pass accepted asset
bindings through `inputs`. Use `builder.random()` for authoring randomness.
The construction seed is independent of the play session seed.
