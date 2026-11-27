---
layout: page
title: "Scripts and Events"
permalink: /game-engine/scripts
description: "Add behaviors and write JavaScript scripts that react to input, collisions, timers, and events."
---

Built-in behaviors cover movement, patrol, collection, health, triggers, spawning, scene transitions, win conditions, and lifetime. Add them to an object in the Inspector, or write a `script` behavior when you need custom logic:

```json
"behaviors": [
  { "kind": "patrol", "speed": 2, "distance": 4, "axis": "x" },
  { "kind": "script", "source": "({ onStart() { return { state: {} }; } })", "maxCommands": 16 }
]
```

In 3D, movement uses the character controller or body commands instead.

## Write a script

Open the **Scripts** panel to edit a script.

![AETHER's explorer behavior open in the editor's Scripts panel](/assets/game-engine/editor-script.png)

*The explorer script reads the player's velocity and whether the player is on the ground.*

A script is an object of hooks. Each hook receives the current input, tick, object, world, events, and the script's saved `state`. A hook returns new `state` and a list of `commands`. Do not keep values in outside variables, because only `state` is kept between ticks and in snapshots.

```js
({
  onStart() { return { state: { opened: false } }; },
  onEvent(input, event) {
    if (event.event !== "unlock") { return; }
    return {
      state: { opened: true },
      commands: [{ kind: "emit", event: "door_opened" }]
    };
  }
})
```

A script can also be one function that runs every tick. Use hooks for collisions, events, and timers.

## Hooks

| Hook | Runs when |
|---|---|
| `onStart` | The object first appears |
| `onSceneEnter` | The scene starts |
| `onTriggerEnter`, `onTriggerExit` | Something enters or leaves a trigger area |
| `onContact` | The object touches a solid object |
| `onEvent` | An event is sent to the object |
| `onFixedUpdate` or `onUpdate` | Every tick. They mean the same thing, so define only one |
| `onDestroy` | After the object is removed. It runs once, and commands that act on the removed object are rejected |

Contacts and events describe the previous tick.

## Read input and the world

The `input` argument holds:

- `input.pressed` and `input.justPressed`: action names held now and pressed this tick.
- `input.entity`: the object's position, velocity, rotation, tags, props, and whether it touches ground, ceiling, or walls.
- `input.events`: events from the previous tick.
- `input.params`: values you set in the Inspector for the script's declared parameters (numbers, booleans, colors, enums, vectors, and object or asset references).
- `input.random()`: random numbers. Use it instead of `Math.random()` so replays match.

To look at other objects, call `world.get(id)` or `world.query({tag, source, near, radius, limit})`. They return copies from the start of the tick, so changing them does nothing. Tags are safer than display names for finding objects.

## Commands

Return commands to change the game. They cover movement, spawning and despawning, scene changes, animation, HUD updates, properties, events, and saving. Spatial commands differ between 2D and 3D. See the [native game field reference](https://github.com/nodetool-ai/nodetool/blob/main/packages/system-skills/native-game-reference/SKILL.md) for every command shape. For saving and loading player progress, see [Saving player progress](/game-engine/saves-replay).

`log` writes a message to the editor **Console** without changing the game. Give it a `tag` and JSON `data`, such as `{ kind: "log", tag: "SPAWNS", message: "chain", data: { offspring: 0.8 } }`, and `nodetool game simulate --json` reports the line, so a test can read the numbers.

`assert` checks a promise of the game in a test run, such as `{ kind: "assert", ok: offspring < 1, message: "a chain dies out" }`. In `nodetool game simulate` a false `ok` stops the run and reports the message and tick. In play, `assert` does nothing. `input.test` is `true` in a test run and absent in play. Neither command counts toward `maxCommands`. See [Game Testing and Replay](/developer/game-testing#test-mode-scripts).

## Timers and events

- `after(ticks, "methodName")` calls a method of your script object once after the given number of ticks.
- `every(ticks, "methodName")` calls it repeatedly.
- Scheduling the same method name again replaces its timer. Timers survive saves and replays.
- `{ kind: "emit", event: "name", target: ... }` sends an event. The target can be an object or a tag. Leave it out to broadcast to everyone. The event arrives on the next tick.

## Limits

- Scripts have no network or file access, and they cannot be `async`. Use tick timers for delayed actions.
- A script's source is at most 16,384 characters.
- `maxCommands` (1 to 64, default 16) caps commands per call, and `maxTickMs` (1 to 20, default 8) caps run time per call.
- A script that exceeds a limit or throws stops the session. Fix the script and restart. Raising a limit will not fix an endless loop.
- A scene change discards the previous scene's script state without calling `onDestroy`.

## Test and reload

**Run 10 s** tests a draft in a separate session. You can edit a script during play and it reloads with its state kept. Switching between a single function and a hooks object needs a restart from tick 0.
