---
layout: page
title: "Game Player Delivery and Security"
permalink: /developer/game-player-delivery
description: "How game exports are built and verified, how the mobile app gets a play session, what the player page may do, and the device test plan."
---

This page is for developers who change the game export, the play route, or the mobile player. For the user steps see [Publish and Export](/game-engine/publishing) and [Play on a Phone](/game-engine/mobile-player).

## Export build internals

Source: `packages/game-renderer/` (`build-tauri.ts`, `build-expo.ts`) and `packages/cli-game/`.

- A web build holds `index.html`, `game.json`, a player script, and `assets/` with media named by digest. A 2D build adds a stylesheet and the script runtime. A 3D build adds `manifest.json`, models, colliders, and pinned runtime files.
- The build fails if installed media is missing, does not match its recorded digest, or has an unsupported format. Images and audio are decoded in process, so no FFmpeg binary is needed. Invalid fonts fail the build.
- The player checks local asset paths and content digests before use. Audio plays from a local Blob URL backed by the verified bytes, so it cannot fetch a different response from the original URL. Streamed music keeps its encoded source and avoids a decoded PCM buffer. Closing the player releases the media URLs.
- The player needs a secure origin for `crypto.subtle` and WebAssembly. Serve it over HTTPS or loopback HTTP.
- Editor and agent exports cache a revision with its generated player, runtime, and template fingerprint. Each cache hit checks every output file against its recorded size and SHA-256 digest, and a missing or changed file triggers a rebuild. A runtime upgrade writes a separate output directory.
- `nodetool game smoke` runs the exported player in Chromium with outside network access blocked. It reports console errors, failed requests, page errors, and stalled ticks. See [`nodetool game`](/cli#nodetool-game).
- Desktop project: `dist/`, `src-tauri/`, `package.json`, and a README. The identifier defaults to `ai.nodetool.game.<name>`. The in-editor executable build writes to `bin/` in the project folder and a hosted server refuses it.
- Mobile project: `App.js`, `app.json`, `assets/`, `package.json`, `eas.json`, and a README. The game is one page, `assets/game/game.html`, loaded under the origin `https://game.invalid/`, which never resolves and gives the player a secure origin. A build carries at most 128 MB of game files (`MAX_EXPO_GAME_BYTES`).

## Mobile play sessions

Source: `packages/websocket/src/trpc/routers/games.ts`, `packages/websocket/src/routes/games.ts`, `packages/websocket/src/lib/game-play-token.ts`, `mobile/src/screens/GamePlayerScreen.tsx`.

1. The app calls `games.playSession` with the game id and, optionally, a revision. The server checks that the caller owns the game, then builds or reuses the revision's web build. This is the same build and cache as **Export build**.
2. The server returns a play URL, `/api/game-play/<token>/index.html`. The token is signed with a key derived from the server's master key. It names one user, one game and one build, and expires after 15 minutes (`GAME_PLAY_TOKEN_TTL_MS`).
3. The web view loads that URL. Every file the player fetches is relative to it, so each request carries the token.
4. For each file the server checks the token, checks again that the user owns the game, accepts only a path in the build's integrity manifest, and compares the stored bytes with the manifest digest before serving them.

The player then checks each asset against the digest in the game document. A session is pinned to one game, revision and runtime fingerprint, so publishing a new revision does not change a running game. After the files load, play does not use the network.

## Page restrictions

- The web view never receives the Supabase access or refresh token. The URL token is the only credential and grants only that build's files.
- The web view loads only URLs under the session directory, plus `about:blank`. Links, redirects, new windows and other origins are refused.
- The page can post five message kinds to the app: capabilities, status, layout, ready and error. The app drops anything else. The app's only call into the page is the fixed pause script.
- The web view has no file access and uses a private data store with no shared cookies, so saved games last only until the game closes.
- Response headers forbid framing, `<base>`, form targets and plugins, and send no referrer, so the token does not leak in a `Referer` header.
- Game scripts run in QuickJS with no network access. The page holds no credential that another API route accepts.

## Device test plan

Automated tests cover the play token, the file route's refusals, the session and list procedures, the URL and message checks, and the screen's loading, failure, orientation and pause paths. The Expo web build does not render a native web view, so the player screen has no screenshot pass.

Status: the player has not yet been run on physical iPhone or Android hardware, or in a simulator. No frame-time, memory, audio-unlock or GPU results exist for those devices. Run this checklist on a development build before relying on a device class.

1. Start a shipped 2D example and a shipped 3D example.
2. Hold the stick and press an action button at the same time.
3. Rotate the phone, and check the safe areas on a phone with a notch.
4. Confirm that sound starts after the first tap.
5. Send the app to the background mid-game and return. The game should be paused, with no control held down.
6. Play for 15 minutes and watch frame time and memory in Safari Web Inspector or Chrome remote debugging. Development builds enable web view debugging.
7. Leave and reopen the game several times. Memory should return to its level before the first launch.

Record per device: model, OS version, 2D backend (Canvas2D or WebGPU), WebGL2 availability, median and 95th percentile frame time, and memory after 15 minutes.
