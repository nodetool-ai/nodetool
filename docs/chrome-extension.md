---
layout: page
title: "Chrome Extension"
description: "Drive your real, logged-in Chrome browser from NodeTool workflows."
---

Let NodeTool workflows control your **actual Chrome browser** — the one you're already logged into — instead of a fresh, anonymous, headless one. The NodeTool Chrome Extension is a thin relay that hands the Chrome DevTools Protocol (CDP) from your browser to your NodeTool server, so a workflow node can click, type, scroll, and screenshot inside a real tab with your cookies, sessions, and 2FA already in place.

> New here? Start with [Getting Started](getting-started.md). For headless (no-login-needed) browsing, see the regular [Browser node](developer/node-reference.md) instead — you only need the extension when a site requires your logged-in session.

---

## Overview

| Feature | Notes |
|---------|-------|
| **What it is** | A Manifest V3 extension that proxies CDP commands between your server and `chrome.debugger` |
| **What it is not** | Not an automation engine itself — it originates no commands, it only relays them |
| **Why you'd use it** | Sites that block headless/server-launched browsers, or require your existing login (OAuth, 2FA, CAPTCHAs already solved) |
| **Transport** | Dedicated WebSocket at `/ws/extension` on your NodeTool server, JSON frames |
| **Scope** | One tab at a time, attached explicitly by clicking a button — never automatic |

---

## Use Case

Many AI product sites — Midjourney, Sora, Runway, ElevenLabs, and similar generation tools — either block headless Chrome outright or require a logged-in account with 2FA and session cookies that a fresh, server-launched browser doesn't have. Re-implementing every such site as a dedicated API integration is slow and brittle to UI changes.

The Chrome Extension solves this by reusing the browser you already use every day. You attach the extension to a tab where you're already signed in, and a workflow's browser-automation node drives that tab through the same action loop (click, type, scroll, extract, screenshot) it would use against a headless browser — just over a different transport.

**Typical scenario**: You're signed into Midjourney in a regular Chrome tab. You attach the extension to that tab, then run a workflow that submits a prompt, waits for the image grid to render, and downloads the results — all inside your real session, with no API key or cookie-jar wrangling.

---

## Recipe: Generate an Image on a Logged-In Site

1. **Install** the extension (see [Installing](#installing) below) and pin it to your toolbar.
2. **Sign in** to the target site (e.g. Midjourney) in a normal Chrome tab, as you would manually.
3. **Start your NodeTool server**: `nodetool serve --port 7777` (the extension talks to it over `ws://localhost:7777/ws/extension` by default).
4. **Open the extension popup** on the signed-in tab and click **Attach to this tab**. Chrome shows its standard "Nodetool is debugging this browser" banner while attached.
5. **Build a workflow** using a live-browser node configured to reuse the extension transport (set `NODETOOL_BROWSER_TRANSPORT=extension` on the server, or point it at your extension via `NODETOOL_EXTENSION_WS_URL` — see [Transport Selection](#transport-selection)).
6. **Run the workflow**. The node's action loop drives your attached tab: it types the prompt, submits the form, waits for the result, and can capture a screenshot or download the generated asset.
7. **Detach** from the popup (or just close the tab) when you're done — attaching is never automatic and only lasts for the current browser session.

Because the site sees your real, logged-in browser rather than a bot-like headless process, you avoid the CAPTCHAs, bot-detection blocks, and re-authentication flows that a server-launched browser would hit.

---

## Installing

The extension is not published to the Chrome Web Store — build and load it unpacked from source.

```bash
git clone https://github.com/nodetool-ai/nodetool.git
cd nodetool/chrome-extension
npm install        # standalone install — the extension lives outside the root npm workspace
npm run build       # vite build -> dist/
```

Then load it into Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `chrome-extension/dist`.

The extension icon appears in your toolbar. Click it to open the popup, which shows a connection-status dot (disconnected / connecting / connected / error), an editable server WebSocket URL, and **Attach** / **Detach** buttons.

> **Standalone package**: `chrome-extension/` is intentionally outside the root npm workspace, Turbo pipeline, and CI — it has its own `package.json` and is built on demand. `npm run build:packages` at the repo root does **not** build it.

### Development commands

```bash
cd chrome-extension
npm run typecheck   # tsc --noEmit
npm run dev         # vite build --watch, for iterating on the extension itself
npm run clean       # remove dist/
```

### Configuring the server URL

By default the extension connects to `ws://localhost:7777/ws/extension` — your local NodeTool server. To point it at a different server (a remote deployment, a different port), open the popup, edit the **Server URL** field, and click **Save**. The value persists in the extension's local storage across restarts.

---

## How It Works

The extension is deliberately "dumb" — a pure conduit with no CDP logic of its own. All browser-automation semantics (which elements to click, how to wait for a page to settle, the action loop) live on the NodeTool server; the extension just carries the bytes.

```
NodeTool server (browser-automation node)
        │  CDP commands/events, JSON frames
        ▼
   ws://<server>/ws/extension
        ▲
        │  chrome.debugger.sendCommand / onEvent
Chrome Extension (service worker)
        │
        ▼
   Your real, logged-in Chrome tab
```

- **Background service worker** (`src/background/service-worker.ts`) owns the relay. It restarts the relay on `chrome.runtime.onInstalled`/`onStartup` because Manifest V3 service workers get evicted and need to reconnect, and it uses a `chrome.alarms` keepalive (roughly every 24 seconds) to stop the worker idling out while a debugger session is attached.
- **CDP relay** (`src/lib/cdp-relay.ts`) maintains the WebSocket to your server with exponential backoff (1–30s) if the connection drops, and answers server heartbeat pings (`ping`/`pong`, ~15s).
- **Explicit attach only**: `chrome.debugger.attach` is only ever called from a user click in the popup — never automatically on page load or on a server request. Attaching is mutually exclusive with having Chrome DevTools open on the same tab.
- **Wire protocol**: JSON text frames (not the MsgPack used by NodeTool's main `/ws` chat/workflow channel), with frame kinds `cdp` / `cdp_result` / `cdp_event` (command/response/event relay), `attach` / `attached` / `detach` (session lifecycle), `ping` / `pong` (heartbeat), `error` (fatal — e.g. the user closed the tab or DevTools banner), `asset_chunk` (server → extension, for injecting a file upload), and `media_chunk` / `media_end` (extension → server, for `chrome.downloads`-based capture when a site blocks direct clipboard/screenshot access).

### Transport Selection

Browser-automation nodes on the server choose between a headless local browser and the extension relay via an environment variable:

```bash
# Use the extension-attached browser instead of a headless one
NODETOOL_BROWSER_TRANSPORT=extension nodetool serve

# Or implicitly, by pointing at a specific extension WebSocket URL
NODETOOL_EXTENSION_WS_URL=ws://localhost:7777/ws/extension nodetool serve
```

When the extension transport is selected but no extension is currently attached, the node fails fast with a clear message rather than hanging: *"No browser extension is connected to `/ws/extension` — attach will time out. Install the extension and click 'Attach to this tab'."*

Under the hood, the same action loop, element indexing, and screenshot logic used by the headless browser nodes runs unchanged against the extension transport — only the underlying CDP client differs, so workflows built for headless browsing don't need to change their node logic to benefit from the logged-in session.

---

## Server Requirements

- A running NodeTool server: `nodetool serve --port 7777` (or your deployed URL).
- The `/ws/extension` route is part of the standard NodeTool WebSocket server — no extra server-side setup is required beyond running the server.
- The extension and the server must be able to reach each other over the configured WebSocket URL (typically `localhost` for local development).

---

## Limitations

- **One tab at a time.** The extension proxies a single `chrome.debugger` session; attach a different tab and the previous one is implicitly detached.
- **Not published to the Chrome Web Store.** Install as an unpacked extension from source.
- **Mutually exclusive with DevTools.** You can't have Chrome DevTools open on a tab while the extension is attached to it (both use `chrome.debugger`).
- **Session-only.** Attaching does not persist across Chrome restarts — reattach after restarting your browser.
- **Manual build, not CI-gated.** The `chrome-extension/` package isn't part of `npm run build:packages` or the repository's CI checks; keep the two protocol definitions (`chrome-extension/src/lib/protocol.ts` and `packages/automation-nodes/src/lib/extension-protocol.ts`) in sync by hand if you change the wire format.

---

## Troubleshooting

### Popup shows "disconnected"

- Confirm your NodeTool server is running and the **Server URL** in the popup matches it (default `ws://localhost:7777/ws/extension`).
- Check that nothing else is bound to port 7777, and that firewall rules allow the local WebSocket connection.

### "No browser extension is connected" error from a workflow

- The extension must be **attached** to a tab before running a workflow that uses the extension transport — attaching is never automatic. Open the popup and click **Attach to this tab**.
- Verify `NODETOOL_BROWSER_TRANSPORT=extension` (or `NODETOOL_EXTENSION_WS_URL`) is set on the server process running the workflow.

### Chrome shows "Nodetool is debugging this browser" and I can't open DevTools

- This is expected while attached — `chrome.debugger` sessions and DevTools are mutually exclusive on the same tab. Detach from the popup, or use a different tab for DevTools.

### Attach fails or the tab appears frozen

- Close any open DevTools panel on that tab first, then retry **Attach to this tab**.
- If the tab was closed or navigated away unexpectedly, the relay reports a fatal error and tears down the session — reopen the target page and reattach.

---

## Related Topics

- [Getting Started](getting-started.md) — Desktop setup and first workflow
- [Developer: Node Reference](developer/node-reference.md) — Browser-automation node reference
- [API Reference](api-reference.md) — Server API and WebSocket documentation
- [WebSocket API](websocket-api.md) — General WebSocket protocol details
