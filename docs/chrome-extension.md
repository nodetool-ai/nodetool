---
layout: page
title: "Chrome Extension"
description: "Chat with NodeTool from Chrome's side panel, and drive your real, logged-in browser from NodeTool workflows."
---

The extension does two things. It puts the NodeTool **chat** in Chrome's side panel, so you can ask your agent something without leaving the page you're on. And it relays the Chrome DevTools Protocol between your browser and your server, so a workflow can drive the tab you're already signed in to.

Let NodeTool workflows control your **actual Chrome browser** — the one you're already logged into — instead of a fresh, anonymous, headless one. The NodeTool Chrome Extension is a thin relay that hands the Chrome DevTools Protocol (CDP) from your browser to your NodeTool server, so a workflow node can click, type, scroll, and screenshot inside a real tab with your cookies, sessions, and 2FA already in place.

> New here? Start with [Getting Started](getting-started.md). For headless (no-login-needed) browsing, see the regular [Browser node](developer/node-reference.md) instead — you only need the extension when a site requires your logged-in session.

---

## Overview

| Feature | Notes |
|---------|-------|
| **What it is** | A Manifest V3 extension with a side-panel chat UI and a CDP proxy between your server and `chrome.debugger` |
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
5. **Ask the agent**, or build a workflow. Either way the `browser_*` tools drive the attached tab — `browser_status` first to confirm the extension is attached, then `browser_restart` with `transport: "extension"` if the server is still on its headless Chrome (or set `NODETOOL_BROWSER_TRANSPORT=extension` before starting it — see [Transport Selection](#transport-selection)).
6. **Run it**. The action loop drives your attached tab: it types the prompt, submits the form, waits for the result, and captures a screenshot or the generated asset into your library.
7. **Detach** from the popup (or just close the tab) when you're done — an attachment lasts only for the current browser session.

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

### Downloading a prebuilt copy

A server that already has the extension built will hand it to you zipped, which saves cloning the repo on the machine running Chrome — the desktop app's install helper uses this.

```bash
curl "http://localhost:7777/api/extension/download" -o nodetool-chrome-extension.zip
unzip nodetool-chrome-extension.zip -d nodetool-extension
```

Load `nodetool-extension/` with **Load unpacked**. A server with no build to hand out answers `404` with `{"detail": "Extension build not found"}` — build from source as above, or point the server at an existing build with `NODETOOL_EXTENSION_DIST`. See [API Reference](api-reference.md#downloading-the-chrome-extension).

### Development commands

```bash
cd chrome-extension
npm run typecheck   # tsc --noEmit
npm run dev         # vite build --watch, for iterating on the extension itself
npm run clean       # remove dist/
```

### Configuring the server URL

By default the extension connects to `ws://localhost:7777/ws/extension` — your local NodeTool server. To point it at a different server (a remote deployment, a different port), open the popup, edit the **Server URL** field, and click **Save**. The value persists in the extension's local storage across restarts.

The chat panel keeps its own server setting (an HTTP base URL, e.g. `http://localhost:7777`), edited from the gear icon inside the panel — see [Chat in the side panel](#chat-in-the-side-panel).

---

## Chat in the side panel

Click the toolbar icon, then **Open chat**. Chrome's side panel opens beside the page with the NodeTool chat: pick a model from any provider your server has configured, send a message, and watch the reply stream in with the agent's tool calls listed as it works. The conversations are the same threads the desktop and web apps read and write — start something in the panel, finish it in the app.

The panel supports **chat only**. Image, video, audio and other media-generation modes live in the full app, as does the workflow editor.

**Settings** (gear icon in the panel):

| Field | Notes |
|---|---|
| **NodeTool server URL** | HTTP base, e.g. `http://localhost:7777`. The panel calls `/trpc` and the `/ws` chat socket on this host. |
| **Access token** | Only for a server that enforces authentication. Leave it empty for a local server — it maps loopback requests to the local user. |

Two things to know when pointing the panel at something other than a local server:

- **The host has to be one Chrome lets the extension reach.** `localhost`, `127.0.0.1` and any HTTPS host are granted in the manifest. Anything else — a LAN box over plain HTTP — prompts for permission when you save it; decline, and every request to that server is blocked by CORS even though the chat socket still connects.
- **Tool calls run without asking.** The panel has no approval cards, so it sends turns in the permissive mode. Point it at a server you trust.

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
- **Attach is a user gesture, with one exception**: `chrome.debugger.attach` is never called on page load. The popup's **Attach to this tab** button is the intended path, but a host `attach` frame on an unattached relay also attaches the *currently active* tab as a convenience (`handleAttachRequest` in `src/lib/cdp-relay.ts`). Since `/ws/extension` is unauthenticated and single-connection, any process that can reach the port can therefore start driving whatever tab is focused — which is why the bridge is off in production unless `NODETOOL_ENABLE_EXTENSION_BRIDGE=1` is set. Attaching is mutually exclusive with having Chrome DevTools open on the same tab.
- **Wire protocol**: JSON text frames (not the MsgPack used by NodeTool's main `/ws` chat/workflow channel). Five frame kinds are live: `cdp` / `cdp_result` / `cdp_event` (command/response/event relay), `attach` / `attached` / `detach` (session lifecycle), `ping` / `pong` (heartbeat), and `error` (fatal — e.g. the user closed the tab or DevTools banner). Three more are **declared but not implemented on either side**: `asset_chunk` (server → extension, a file-upload injection) and `media_chunk` / `media_end` (extension → server, a `chrome.downloads` capture). Uploads reach a file input through an in-page `DataTransfer` injection instead, and media is captured with `Network.getResponseBody` or an in-page `fetch`; the three frames are the shape a `chrome.downloads` fallback would take if a site defeats both.

### Transport Selection

One browser session exists per server process, and it is driven by either transport: a headless Chrome the server launches, or your attached tab. The same action loop, element indexing, and screenshot logic runs against both — only the CDP client differs — so nothing built for headless browsing needs different logic to use the logged-in session.

Set the default before the server starts:

```bash
# Use the extension-attached browser instead of a headless one
NODETOOL_BROWSER_TRANSPORT=extension nodetool serve

# Or implicitly, by pointing at a specific extension WebSocket URL
NODETOOL_EXTENSION_WS_URL=ws://localhost:7777/ws/extension nodetool serve
```

Or switch a running server from the agent side, which is the same decision made later:

```jsonc
{"tool": "browser_restart", "arguments": {"transport": "extension"}}
```

Restarting is the only point the transport can change, because the session is a process singleton: switching tears the current one down first. On the local transport that kills Chrome and relaunches it (cookies and history gone); on the extension transport it only detaches and re-attaches the debugger, leaving your browser alone.

When the extension transport is selected but nothing is attached, the log says so — *"No browser extension is connected to `/ws/extension` — attach will time out. Install the extension and click 'Attach to this tab'."* — and the attach then spends its 30-second timeout. `browser_status` is how an agent finds this out first instead.

---

## As an agent capability

The `browser_*` capabilities are the extension's agent-facing surface. They are registered like any other NodeTool capability, so the same fourteen names reach the chat agent, an `AgentNode` in a workflow, MCP clients, CodeAct, a Code node, and a JS script — and every one of them drives the same page.

| Capability | What it does |
|---|---|
| `browser_status` | Which transport is live, whether an extension is attached, where an open session is pointed |
| `browser_view` | URL, title, viewport, indexed interactive elements, screenshot |
| `browser_navigate` | Load a URL |
| `browser_restart` | Restart the session; the one place `transport` changes |
| `browser_click`, `browser_input_text`, `browser_press_key`, `browser_select_option`, `browser_move_mouse`, `browser_scroll` | Act on the page, addressing elements by their `browser_view` index or by coordinates |
| `browser_console_exec`, `browser_console_view` | Evaluate an expression in the page; read recent console messages |
| `browser_capture_media` | Save an image/video/audio the page produced as a NodeTool asset |
| `browser_upload_asset` | Inject an existing asset into a page file input |

Element indexes are rebuilt on every `browser_view`, so an agent views before it acts on an index.

`browser_status` is the one to call first when a task needs the logged-in session:

```json
{
  "transport": "extension",
  "session_open": false,
  "extension_connected": false,
  "url": null,
  "title": null,
  "hint": "No Chrome extension is connected to /ws/extension. Ask the user to install the NodeTool extension and click 'Attach to this tab'; until then every browser action will time out attaching."
}
```

`extension_connected` is `null`, not `false`, where the process cannot answer — a CLI reaching `/ws/extension` over a URL would have to open a socket to find out, so it reports "unknown" rather than guessing.

**Not available on nodetool.ai.** The cloud profile drops all fourteen: the
browser session is one page per server process, shared by every caller, which
is a single-tenant shape — and the extension transport would put one user's own
Chrome behind an unauthenticated socket on a shared server. They are offered
where the machine belongs to its user: the desktop app, a local server, or a
self-hosted install (`NODETOOL_NODE_PROFILE=full`). See
[Cloud node curation](https://github.com/nodetool-ai/nodetool/blob/main/docs/CLOUD_NODE_CURATION.md).

Permission-wise: reading the page (`browser_status`, `browser_view`, `browser_console_view`) is classified `read`, `browser_restart` and `browser_console_exec` are `execute`, and everything that acts on the page — a click, a keystroke, an upload — is `external`, because it lands on a third-party site inside the user's own logged-in session.

The action loop itself is `@nodetool-ai/browser` (`packages/browser/`), which knows nothing about agents, nodes or assets — a screenshot comes back from it as base64. The capability module imports it directly and owns the half that needs a `ProcessingContext`: persisting those bytes as an asset, and resolving an asset id back to bytes for an upload. That split is why the `lib.browser.Screenshot` node can share the same action loop without depending on the agent layer.

---

## Server Requirements

- A running NodeTool server: `nodetool serve --port 7777` (or your deployed URL).
- The `/ws/extension` route (CDP proxy) and the `/trpc` + `/ws` routes (chat panel) are part of the standard NodeTool WebSocket server — no extra server-side setup is required beyond running the server.
- The extension and the server must be able to reach each other over the configured WebSocket URL (typically `localhost` for local development).
- Chrome 116 or newer, for the side panel.

---

## Limitations

- **One tab at a time.** The extension proxies a single `chrome.debugger` session; attach a different tab and the previous one is implicitly detached.
- **Not published to the Chrome Web Store.** Install as an unpacked extension from source.
- **Mutually exclusive with DevTools.** You can't have Chrome DevTools open on a tab while the extension is attached to it (both use `chrome.debugger`).
- **Session-only.** Attaching does not persist across Chrome restarts — reattach after restarting your browser.
- **One session per server process.** The browser session is a process singleton shared by every agent and workflow on that server, so two concurrent runs drive the same tab. Sequence them, or give each its own server.
- **Chat only in the panel.** Media generation, the workflow editor and tool-approval prompts are the full app's job — the panel sends turns in the permissive tool mode rather than asking.
- **Manual build.** The `chrome-extension/` package isn't part of `npm run build:packages` — build it on demand. A diff touching it does run the `live-browser` surface's selfcheck through `nodetool harness gate`, but that covers the capability seam, not the relay: the extension → `chrome.debugger` → page round trip runs only in `npm run test:integration --workspace=packages/browser`, which needs Chrome and port 7777. Keep the two protocol definitions (`chrome-extension/src/lib/protocol.ts` and `packages/browser/src/extension/protocol.ts`) in sync by hand if you change the wire format, and likewise `chrome-extension/src/lib/chat-socket.ts` with `packages/sdk/src/chat.ts` for the chat panel.

---

## Troubleshooting

### The chat panel shows "Cannot reach …"

Check the server URL in the panel's settings (gear icon). If it names a host that is not `localhost`, `127.0.0.1` or an HTTPS address, save it again and accept Chrome's permission prompt — without that grant the browser blocks every request to it. A green connection dot with failing requests is exactly this: the WebSocket is not CORS-gated, the HTTP calls are.

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
