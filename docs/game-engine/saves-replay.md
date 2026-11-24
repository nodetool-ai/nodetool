---
layout: page
title: "Saving Player Progress"
permalink: /game-engine/saves-replay
description: "Store and load player progress and settings from game scripts."
---

A save stores player progress or settings between play sessions. Scripts request saves with commands, and saves are separate from the game document. Saves are not synced to a cloud account.

## Save and load commands

A script returns `save` and `load` commands from a lifecycle hook such as `onStart` or `onUpdate`.

| Command | Fields |
|---|---|
| `save` | `slot`, `data`, optional `scope` |
| `load` | `slot`, optional `scope` |

- `scope` is `progress` (the default) or `settings`. The two scopes are stored separately, so the same slot name can exist in both.
- A slot name is 1 to 32 letters, digits, underscores, or hyphens. A game has at most 16 slots per scope.
- `data` is a JSON object up to 16 KB, nested at most 16 levels deep, with at most 256 keys in total.
- A script tick can request at most 4 saves and loads in total. More fail the tick.

A load result arrives on a later input frame as `input.loaded`, a list of `{slot, data}` items. A slot that is empty or fails to load returns null data. Keep the values your game needs in script state, and read them back from `input.loaded` when it arrives.

```js
({ onStart() {
  return { commands: [{ kind: "load", slot: "progress" }] };
}, onUpdate(input) {
  const loaded = input.loaded?.find((item) => item.slot === "progress");
  return { state: loaded ? { best: loaded.data?.best ?? 0 } : input.state };
} })
```

To write a save, return `{ kind: "save", slot: "progress", data: { best: 12 } }` from a hook.

## Where saves are stored

Saves are stored in the player's browser, so they stay on that device and browser. The editor's play mode keeps them separately from an exported game. If the browser blocks storage, the player reports a save error and play continues without saving.

To test scripts that read saves without a browser, see [Game Testing and Replay](/developer/game-testing).
