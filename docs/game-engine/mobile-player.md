---
layout: page
title: "Play on a Phone"
permalink: /game-engine/mobile-player
description: "Play a published game in the NodeTool mobile app: how the build reaches the phone, what the player is allowed to do, and the current device limits."
---

The NodeTool mobile app plays your published games. Open **Apps**, tap the controller button in the header, and pick a game. The phone plays the game's current published revision with the same runtime and renderers as the web player, so a game behaves the same in the editor, in a browser, and on the phone.

The phone plays games. It does not edit them. Make and change games in the desktop or web editor, or ask the assistant.

## What runs where

The mobile player is the exported web build, unchanged, inside a web view. The [standalone web export](/game-engine/publishing#export-for-the-web) produces that build. The shared simulation, the QuickJS script runtime, Canvas2D or WebGPU for 2D, WebGL2 for 3D, touch controls and audio all run inside the page. The server prepares the build and serves its files. It takes no part in a frame.

The native screen owns the parts around the game: the play link, loading and error states, orientation, the close button, and pausing when the app goes to the background.

## How the build reaches the phone

1. The app calls `games.playSession` with the game id and, optionally, a revision. The server checks that the caller owns the game, then builds or reuses the revision's web build. This is the same build and cache that **Export build** uses, verified file by file against its integrity manifest.
2. The server answers with a play URL, `/api/game-play/<token>/index.html`. The token is signed with a key derived from the server's master key. It names one user, one game and one build, and expires after 15 minutes.
3. The web view loads that URL. Every file the player fetches is relative to it, so each request carries the same token.
4. For each file, the server checks the token, checks again that the user still owns the game, accepts only a path listed in the build's integrity manifest, and compares the stored bytes with the manifest's digest before it serves them.

The player then checks every asset against the digest in the game document, as it does in a browser. A play session is pinned to one game, one revision and one runtime fingerprint. Publishing a new revision does not change a game that is already running.

### Why authenticated HTTPS, not a downloaded ZIP

The exported player needs a secure origin. It verifies assets with `crypto.subtle`, compiles QuickJS from WebAssembly, and fetches files relative to its own page. Loaded from `file://`, iOS WKWebView and Android WebView each restrict `fetch`, WebAssembly and storage differently, and the player is documented to need HTTPS or loopback HTTP. A downloaded ZIP would also need a private local origin, which means a local HTTP server or a custom scheme handler in native code.

Serving the build from the API under a signed path gives the page a real HTTPS origin with no new native code. The cost is that the first version needs a connection to start a game. Once the page has loaded its files, play does not use the network. The build format and integrity manifest are the same ones a verified offline cache would use, so caching can be added later without a second format.

## What the page can and cannot do

- **No user credentials.** The web view never receives the Supabase access or refresh token. The token in the URL is the only credential, and it grants nothing but that build's files.
- **No navigation away.** The web view loads only URLs under the session directory, plus `about:blank`. Links, redirects, new windows and other origins are refused.
- **No native bridge.** The page can post five kinds of message: capabilities, status, layout, ready and error. The app drops anything else. The app's only call into the page is the fixed pause script.
- **No file access** and no shared cookies. The web view uses a private data store, so one account's saved games are not read under another account on the same phone. Saves therefore last only until you close the game.
- **Response headers** forbid framing, `<base>`, form targets and plugins, and send no referrer, so the token does not leak in a `Referer` header.

The page runs under the API's origin. Game scripts run in QuickJS with no network access, and the player code is NodeTool's own, so nothing in the page calls other API routes. The page also holds no credential that another route would accept.

## Controls, orientation and lifecycle

- **Touch.** The web player's touch layer provides the virtual stick, action buttons and HUD buttons. Multitouch works the same as in a mobile browser.
- **Orientation.** The rest of the app stays upright. The game screen turns to the shape the game is drawn for. A 3D game's presentation aspect ratio decides this before the game loads. A 2D game reports its shape once its camera produces the first frame.
- **Background.** When the app goes to the background, or another screen covers the game, the app pauses the game and its audio and releases every held control. The game stays paused when you return. Tap **Resume** in the game to continue.
- **Close.** The close button and the Android back button leave the game. Leaving discards the web view, which stops the simulation and the audio and releases the renderer.

## Errors you may see

| Message | Cause |
|---|---|
| This 3D game needs WebGL2 | The phone's web view has no WebGL2 context. Play the game on desktop or web. |
| The game player needs a secure connection | The server address in Settings uses plain HTTP on a network address. Use HTTPS, or a loopback address while developing. |
| This game requires WebGPU effects | The 2D game marks a GPU effect as required, and the web view has no WebGPU. Optional effects are omitted with a notice instead. |
| The play link expired | The web view reloaded the page after the link expired. Tap **Try again** for a new link. |
| The game stopped | The operating system closed the web view, usually to free memory. Tap **Try again**. |
| The game didn't start | The page loaded but the player did not start within a minute. The message shows the player's last status line. |

## Validation status

Automated tests cover the play token, the file route's refusals, the session and list procedures, the URL and message checks, and the screen's loading, failure, orientation and pause paths. The Expo web build does not render a native web view, so the player screen has no screenshot pass.

The player has not yet been run on physical iPhone or Android hardware, or in a simulator, so this page records no frame-time, memory, audio-unlock or GPU results for those devices. Run the checklist below on a development build before you rely on a device class.

1. Start a shipped 2D example and a shipped 3D example.
2. Hold the stick and press an action button at the same time.
3. Rotate the phone, and check the safe areas on a phone with a notch.
4. Confirm that sound starts after the first tap.
5. Send the app to the background mid-game and return. The game should be paused, with no control held down.
6. Play for 15 minutes and watch frame time and memory in Safari Web Inspector or Chrome remote debugging. Development builds enable web view debugging.
7. Leave and reopen the game several times. Memory should return to its level before the first launch.

Record results per device: model, OS version, 2D backend (Canvas2D or WebGPU), WebGL2 availability, median and 95th percentile frame time, and memory after 15 minutes.

## Longer-term options

The first version keeps the TypeScript runtime and the browser renderers in a web view. Two alternatives stay open, to be judged against real-device measurements:

- **Shared gameplay with native rendering.** The simulation stays in TypeScript and a native renderer draws the frames. This needs a frame protocol between JavaScript and native code, and its per-frame overhead would have to be measured first.
- **A portable native or WebAssembly core.** The runtime is rewritten once for iOS, Android and the web. This is justified only if measurements show the web view cannot hold the frame budget, and only with replay tests that prove the same results on every platform.

If device results show a limit that the web view cannot meet, open a design RFC with those numbers. A native renderer would not by itself require a second implementation of the simulation or the script runtime.
