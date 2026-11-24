---
layout: page
title: "Rebuilding Generated Games"
permalink: /game-engine/construction
description: "Change a parameter of a generated game, preview the rebuild, and apply it while your manual edits are kept."
---

When the agent generates a game from a program and inputs, the game editor keeps that program with the game. You can change an input, preview the rebuilt game, and apply it. Edits you made by hand stay in place.

![Diagram of a draft, construction preview, reviewed apply, and separate publication](/assets/game-engine/authoring-flow.svg)

*Preview does not change the draft. Applying the rebuild is separate from publishing.*

A game you built by hand has no construction program, and the section described here does not appear for it.

## Rebuild a game

1. Open the **Retained construction** section in the game editor.
2. Edit **Construction inputs (JSON)**, for example change a speed or a count. You can also edit **Construction source**.
3. Choose **Preview rebuild**. The section lists the changed entities, the changed dependencies, and whether you must restart play to use the result.
4. Choose **Highlight changes** to select the affected entities in the viewport.
5. Choose **Apply rebuild**, or **Discard preview** to throw the preview away.

**Apply rebuild** stays disabled while the preview has conflicts. If you edit the draft after previewing, the editor shows "The draft changed. Preview the rebuild again." and you preview again. Applying does not publish the game.

An open play session keeps the game it started with. Restart play to use the rebuild.

## What happens to your manual edits

- Moving or changing a generated entity is remembered as your edit. A later rebuild can change another field of that entity and your change stays.
- Deleting a generated entity keeps it deleted after a rebuild. The section lists it as **Suppressed** with a **Restore** button.

A rebuild conflicts with your edits when it removes an entity you changed or referenced, or when it creates an entity with an ID you used manually. Resolve the conflict before you apply.

If you edit the game while the rebuild is being applied, a dialog titled **Resolve edits made during rebuild** lists the edits that conflict. For each one choose **Keep ... detached** to keep your entity outside the program, or **Discard edits made during rebuild**.

To write the construction program yourself, see the [Game Construction API](/developer/game-construction).
