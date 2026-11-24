---
layout: page
title: "Play on a Phone"
permalink: /game-engine/mobile-player
description: "Open a published game in the NodeTool mobile app, and fix the errors you may see."
---

The NodeTool mobile app plays a game's current published revision. Open **Apps**, tap the controller button in the header, and pick a game.

> **Runs:** on the phone, in the app's web view. **Needs:** a connection to the server to start a game. 3D games need WebGL2 in the web view.
{: .callout-note}

The phone plays games and does not edit them. Edit in the desktop or web editor, or ask the assistant.

## Controls, orientation and pausing

- **Touch.** The player shows a virtual stick, action buttons and HUD buttons. Multitouch works as in a mobile browser.
- **Orientation.** The rest of the app stays upright. The game screen turns to the shape the game is drawn for.
- **Background.** When the app goes to the background, the game and its audio pause and held controls are released. Tap **Resume** in the game to continue.
- **Close.** The close button and the Android back button leave the game. Saves last only until you close it.

## Errors you may see

| Message | Cause |
|---|---|
| This 3D game needs WebGL2 | The phone's web view has no WebGL2 context. Play the game on desktop or web. |
| The game player needs a secure connection | The server address in Settings uses plain HTTP on a network address. Use HTTPS, or a loopback address while developing. |
| This game requires WebGPU effects | The 2D game marks a GPU effect as required, and the web view has no WebGPU. Optional effects are omitted with a notice instead. |
| The play link expired | The web view reloaded the page after the link expired. Tap **Try again** for a new link. |
| The game stopped | The operating system closed the web view, usually to free memory. Tap **Try again**. |
| The game didn't start | The page loaded but the player did not start within a minute. The message shows the player's last status line. |

How the build reaches the phone and what the page may do are in [Game Player Delivery and Security](/developer/game-player-delivery).
