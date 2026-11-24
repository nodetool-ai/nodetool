---
layout: page
title: "Publish and Export"
permalink: /game-engine/publishing
description: "Publish a game revision, or export it as a web player, a desktop app project, or a mobile app project."
---

Publishing saves the current draft as a revision that others can play. Exporting packages that published revision and its assets into a player that runs without your project.

![Diagram separating draft editing, preview, apply, and publication](/assets/game-engine/authoring-flow.svg)

## Publish

Validate and play the draft, then choose **Publish** in the toolbar. The player opens the published revision. Its URL requires a signed-in account and is not a public sharing link.

Restoring an older revision from **Revisions** replaces the draft and clears its undo history, so look at the revision before you confirm.

## Export

Use the **Export build** button in the toolbar, or the same entries in the **⋮** menu. Each choice downloads a `.zip` of the published revision. You can also ask the assistant to build the game. None of the exports contain provider API keys.

| Choice | What you get | What you need |
|---|---|---|
| **Web player** | A static site: the player, the game, and its assets. | Any web server over HTTPS. Opening `index.html` from disk does not work. |
| **Desktop app** | A Tauri project for Windows, macOS and Linux. | Rust and your platform's toolchain to compile it. Each platform builds its own installers. |
| **Mobile app** | An Expo project for iOS and Android. | Node.js. Try it in Expo Go with `npx expo start`, and build store apps with EAS. |
| **Desktop executable** | Compiles the desktop app on this computer and streams the output to the Console. | A local server. Hosted servers refuse it. |

A build fails if an image, font, or sound is missing or cannot be read, so you find out before anyone plays it. 2D games fall back to Canvas2D where the browser has no WebGPU, and skip optional GPU effects. 3D games need WebGL2. See the [Overview](/game-engine/) for limits.

Test the exported game on the devices you care about. System web views differ, so a desktop app can look different from Chrome. The [Game Editor](/game-editor#build-a-desktop-app) page has the steps and output locations for [desktop](/game-editor#build-a-desktop-app) and [mobile](/game-editor#build-a-mobile-app) builds.

To build and smoke-test from a terminal, see [`nodetool game`](/cli#nodetool-game). How exports are verified and cached is in [Game Player Delivery and Security](/developer/game-player-delivery).

## Play on a phone

The NodeTool mobile app plays a game's published revision. See [Play on a Phone](/game-engine/mobile-player).
