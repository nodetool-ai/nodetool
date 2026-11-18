---
layout: page
title: "Chrome Extension"
description: "Chat with NodeTool from Chrome's side panel, and drive your real, logged-in browser from NodeTool workflows."
---

The Chrome extension adds a chat side panel and a CDP proxy to your browser. The panel runs NodeTool's agent beside the current tab and shares threads with the desktop and web apps. The proxy relays the Chrome DevTools Protocol, so a workflow or agent can click, type, scroll, and screenshot inside a tab you are already signed in to. Opening the panel attaches the proxy to the current tab.

> **Runs:** in desktop Chrome 116 or newer, on the machine that runs the NodeTool server or native host (the proxy is local-only). **Needs:** the extension loaded unpacked from source (it is not in the Chrome Web Store). The chat panel needs a running NodeTool server. The proxy needs the native host (`nodetool extension install`) and no server. **Not available on nodetool.ai.**
{: .callout-note}

For headless browsing that needs no login, use the regular [Browser node](developer/node-reference.md). Use the proxy when a site requires your signed-in session.

---

## Overview

| | Chat side panel | CDP proxy |
|---|---|---|
| **What it is** | NodeTool's chat, in Chrome's side panel | A relay between local NodeTool clients and `chrome.debugger` |
| **What you get** | Ask an agent about the current page; the same threads as the app | Workflows and agents drive your logged-in tab |
| **Transport** | `/trpc` and the `/ws` chat socket, msgpack frames | Chrome native messaging to a local host, then a unix socket. No server involved |
| **Scope** | One conversation at a time, any thread on the server | One tab at a time, attached explicitly — never automatic |

---

## Installing

On a local install, the first launch with no API key stored opens a two-step onboarding. It signs in to ChatGPT and Claude, then sets up the extension with a live connection status. The app registers the native host itself, and the desktop app points Load unpacked at the extension folder it ships, so no terminal step is needed. **Settings → Integrations → Browser extension** has the same **Connect to Chrome** button. ChatGPT image generation and every Gemini request (chat, images, Veo video) run through the extension.

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

The extension icon appears in your toolbar. Click it to open the popup: **Open chat** opens the side panel, and below it the CDP proxy's controls — a connection-status dot (disconnected / connecting / connected / error), an editable server WebSocket URL, and **Attach** / **Detach** buttons.

> **Standalone package**: `chrome-extension/` is intentionally outside the root npm workspace, Turbo pipeline, and CI — it has its own `package.json` and is built on demand. `npm run build:packages` at the repo root does **not** build it.

### Downloading a prebuilt copy

A server with the extension built serves it zipped, so you do not need to clone the repo on the machine running Chrome. The desktop app's install helper uses this.

```bash
curl "http://localhost:7777/api/extension/download" -o nodetool-chrome-extension.zip
unzip nodetool-chrome-extension.zip -d nodetool-extension
```

Load `nodetool-extension/` with **Load unpacked**. A server with no build to hand out answers `404` with `{"detail": "Extension build not found"}` — build from source as above, or point the server at an existing build with `NODETOOL_EXTENSION_DIST`. See [API Reference](api-reference.md#downloading-the-chrome-extension).

### Development commands

```bash
cd chrome-extension
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run dev         # vite build --watch, for iterating on the extension itself
npm run clean       # remove dist/
```

---

## Chat in the side panel

Click the toolbar icon, then **Open chat**. The side panel opens and the extension attaches the CDP proxy to the current tab in the same gesture. The empty state offers three starters: *Summarize this page*, *Pull the key facts out of this page into a list*, and *What can I do with this page?*

### What's in the panel

| Control | Behavior |
|---|---|
| **Model picker** | Every language model from every provider your server has configured, grouped by provider, with a search box once the list is long. Nothing is picked for you — sending stays blocked until you choose one, and the composer says why. |
| **Permission mode** | **Ask**, **Auto** or **Plan**, persisted across sessions. See [Permission modes](#permission-modes) below. |
| **Conversations** | The thread list, shared with the desktop and web apps. Start something in the panel and finish it in the app, or the reverse. |
| **Transcript** | Streamed replies with the agent's tool calls listed as it works. An `execute_code` call renders its program as a titled code block rather than escaped JSON, and a call still running is marked at the tail of the turn. |
| **Server settings** | The gear icon — see [Pointing the panel at a server](#pointing-the-panel-at-a-server). |

The panel is chat only. Media generation and the workflow editor live in the full app.

### Permission modes {#permission-modes}

| Mode | Behavior |
|---|---|
| **Ask** | Reads run automatically; a write, execute or external call parks on an approval card. This is the default. |
| **Auto** | Everything runs unasked. |
| **Plan** | Read and propose only. No actions taken. |

These are the same modes the full app offers, where **Ask** is labelled *Default*. [Chat & Agents](global-chat.md#agent-mode) explains what each one does to the agent loop.

Auto points a running agent at whatever your server can reach, inside your signed-in browser session. Pick it only for a server you trust.

### Approvals

Three requests park in the transcript as cards rather than failing the turn:

- **A gated tool call** asks *Run this action?*, *Make this change?* or *Allow this action?* depending on whether the call is classified `execute`, `write` or `external`. The card names the tool, expands to show the code or the arguments, and offers **Allow**, **Allow for chat** (stops the asking for the rest of the thread) or **Deny**.
- **A proposed plan** shows its title and tasks, and takes an approval or a rejection with feedback on what should change.
- **A missing credential** asks for the key by name. The value is saved to the server's secret store from the card; it never travels over the chat socket.

### Pointing the panel at a server

The gear icon holds the panel's own server setting, separate from the proxy's relay URL:

| Field | Notes |
|---|---|
| **NodeTool server URL** | HTTP base, e.g. `http://localhost:7777`. The panel calls `/trpc` and the `/ws` chat socket on this host. |
| **Access token** | Only for a server that enforces authentication. Leave it empty for a local server — it maps loopback requests to the local user. |

**The host has to be one Chrome lets the extension reach.** `localhost`, `127.0.0.1` and any HTTPS host are granted in the manifest. Anything else — a LAN box over plain HTTP — prompts for permission when you save it; decline, and every request to that server is blocked by CORS even though the chat socket still connects. A green connection dot with failing requests is exactly this case: WebSockets are not CORS-gated, the HTTP calls are.

---

## Driving your logged-in browser

Sites such as Midjourney, Sora, Runway, and ElevenLabs often block headless Chrome or require a logged-in account with 2FA and session cookies. With the extension attached to a signed-in tab, a workflow's browser-automation node drives that tab through the same action loop (click, type, scroll, extract, screenshot) it uses against a headless browser.

### Recipe: generate an image on a logged-in site

1. **Install** the extension ([Installing](#installing)) and pin it to your toolbar.
2. **Sign in** to the target site (e.g. Midjourney) in a normal Chrome tab.
3. **Register the native host once**: click **Connect to Chrome** in the app (onboarding or **Settings → Integrations → Browser extension**), or run `nodetool extension install`. Then reload the extension in `chrome://extensions`. Check it with `nodetool extension status`. No server needs to run.
4. **Open the extension popup** on the signed-in tab and click **Attach to this tab**. Chrome shows its standard "Nodetool is debugging this browser" banner while attached.
5. **Ask the agent**, run a workflow, or call a provider such as `nodetool generate dreamina …`. The `browser_*` tools drive the attached tab — `browser_status` first to confirm the extension is connected, then `browser_restart` with `transport: "extension"` if the process is still on its headless Chrome (or set `NODETOOL_BROWSER_TRANSPORT=extension` before starting it — see [Transport selection](#transport-selection)).
6. **Run it**. The action loop drives your attached tab: it types the prompt, submits the form, waits for the result, and captures a screenshot or the generated asset into your library.
7. **Detach** from the popup (or just close the tab) when you're done — an attachment lasts only for the current browser session.

### Example: the Dreamina provider

The `dreamina` provider generates images, videos and music through your own logged-in Dreamina tab, so it needs no API key and exists on local installs only. Keep a signed-in `dreamina.capcut.com` tab open and the extension connected (`nodetool extension status`). The provider asks the extension for that tab by URL, so the active tab does not matter.

```bash
nodetool generate dreamina --list-models
nodetool generate dreamina high_aes_general_v50p_large "a red apple" --aspect-ratio 16:9 -o apple.png
```

Images go through `textToImage` and `imageToImage`. Image-to-image uses the site's blend mode, takes up to nine source images and a `strength` from 0 to 1, and works on models that list `byte_edit`. Video goes through the provider API: `textToVideo` for every model Dreamina lists, `imageToVideo` for models that list `first_frame` (the image is the first frame, and `endImage` is the last frame on models that list `end_frame`), and `referenceToVideo` for the Seedance 2.x models (up to nine reference images, three reference videos and three reference audios, placed in the prompt with `[Image N]`, `[Video N]` and `[Audio N]` markers). A reference audio needs an image or video beside it. Multiframes, smart edit and long video are not supported. Music goes through `textToMusic`. The `instrumental` model needs no model key and returns a WAV track (44.1 kHz stereo) of the length you ask for in whole seconds, 10 seconds by default. Vocal models, with optional lyrics, appear in `getAvailableMusicModels` only when your Dreamina account lists them. The calls spend your Dreamina credits.

### Windows setup

Settings → Integrations → Browser extension registers the host for the current
Windows user. It detects Chrome, Chromium, Brave and Edge profiles under
`LOCALAPPDATA`, writes a manifest for each browser, and registers it under that
browser's `HKCU\Software\…\NativeMessagingHosts\ai.nodetool.browser_bridge`
key in both registry views. Administrator rights are not required.

The launcher in `~/.nodetool/browser-bridge/native-host.cmd` pins the Node
executable and host script. Run setup again if either moves. Installation status
checks the registry entries, manifest, launcher and target files. Loading the
extension unpacked in Chrome remains a separate step.

### The native host

Chrome starts the host when the extension connects and ends it when the connection closes. On macOS and Linux, it listens on a per-user unix socket (`<tmp>/nodetool-browser-bridge-<user>/<pid>.sock`, mode 0600 in a 0700 directory), so only your OS user reaches the extension. On Windows it uses a named pipe instead. Several clients can share one extension: the host rewrites command ids per client, sends events to all, and keeps the debugger attached until the last client lets go. `nodetool extension install` writes the host manifest for Chrome, Chromium, Brave, Edge and Arc. The extension ID is fixed by the `key` in `chrome-extension/manifest.json`.

### How it works

The extension has no CDP logic. Browser-automation semantics (element selection, waiting, the action loop) live in the client process, and the extension carries the bytes.

```
NodeTool backend / CLI / provider
        │  CDP commands/events, NDJSON on a unix socket or Windows named pipe
        ▼
   native host  (started by Chrome)
        │  native messaging, length-prefixed JSON
        ▼
Chrome Extension (service worker)
        │  chrome.debugger.sendCommand / onEvent
        ▼
   Your real, logged-in Chrome tab
```

- **Background service worker** (`src/background/service-worker.ts`) owns the relay. It restarts the relay on `chrome.runtime.onInstalled`/`onStartup` because Manifest V3 service workers get evicted and need to reconnect, and it uses a `chrome.alarms` keepalive (roughly every 24 seconds) to stop the worker idling out while a debugger session is attached.
- **CDP relay** (`src/lib/cdp-relay.ts`) holds a native messaging port to the host with exponential backoff (1–30s) if it drops. A missing host shows up as the popup's error text.
- **Attach is a user gesture, with one exception**: `chrome.debugger.attach` is never called on page load. The popup's **Attach to this tab** button is the intended path, but a host `attach` frame on an unattached relay also attaches the *currently active* tab as a convenience (`handleAttachRequest` in `src/lib/cdp-relay.ts`). Any process running as your OS user can reach the host socket and so start driving whatever tab is focused. Filesystem permissions on the socket are the access control. Attaching is mutually exclusive with having Chrome DevTools open on the same tab.
- **Wire protocol**: JSON frames (native messaging between Chrome and the host, newline-delimited JSON on the socket). Five frame kinds are live: `cdp` / `cdp_result` / `cdp_event` (command/response/event relay), `attach` / `attached` / `detach` (session lifecycle), `ping` / `pong` (heartbeat), and `error` (fatal — e.g. the user closed the tab or DevTools banner). Three more are **declared but not implemented on either side**: `asset_chunk` (server → extension, a file-upload injection) and `media_chunk` / `media_end` (extension → server, a `chrome.downloads` capture). Uploads reach a file input through an in-page `DataTransfer` injection instead, and media is captured with `Network.getResponseBody` or an in-page `fetch`; the three frames are the shape a `chrome.downloads` fallback would take if a site defeats both.

#### Transport selection

One browser session exists per server process, driven by either transport: a headless Chrome the server launches, or your attached tab. Only the CDP client differs, so nothing built for headless browsing needs changes to use the logged-in session.

Set the default before the server starts:

```bash
# Use the extension-attached browser instead of a headless one
NODETOOL_BROWSER_TRANSPORT=extension nodetool serve

# Or pin a specific host socket (rarely needed)
NODETOOL_BROWSER_BRIDGE_SOCKET=/path/to/host.sock nodetool serve
```

Or switch a running server from the agent side:

```jsonc
{"tool": "browser_restart", "arguments": {"transport": "extension"}}
```

Restarting is the only point the transport can change, because the session is a process singleton: switching tears the current one down first. On the local transport that kills Chrome and relaunches it (cookies and history gone); on the extension transport it only detaches and re-attaches the debugger, leaving your browser alone.

When the extension transport is selected but no native host is running, the attach fails at once with *"The NodeTool browser bridge is not running. Install the native host with `nodetool extension install` …"*. `browser_status` is how an agent finds this out first.

### As an agent capability

The same fourteen `browser_*` capability names reach the chat agent, an `AgentNode` in a workflow, MCP clients, CodeAct, a Code node, and a JS script, and all of them drive the same page.

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
  "hint": "No NodeTool browser bridge is running. Ask the user to run `nodetool extension install`, load the NodeTool extension in Chrome and reload it; until then every browser action fails to attach."
}
```

`extension_connected` is `null` on the local transport, where the question does not apply.

**Not available on nodetool.ai.** The cloud profile drops all fourteen: the
browser session is one page per server process, shared by every caller, which
is a single-tenant shape — and the extension transport would put one user's own
Chrome behind a shared server. They are offered
where the machine belongs to its user: the desktop app, a local server, or a
self-hosted install (`NODETOOL_NODE_PROFILE=full`).

Permission-wise: reading the page (`browser_status`, `browser_view`, `browser_console_view`) is classified `read`, `browser_restart` and `browser_console_exec` are `execute`, and everything that acts on the page — a click, a keystroke, an upload — is `external`, because it lands on a third-party site inside the user's own logged-in session.

---

## Limitations

- **Some pages cannot be attached.** `chrome.debugger` refuses `chrome://`, `chrome-untrusted://`, `devtools://`, `edge://` and `about:` pages, other extensions' pages, and the Chrome Web Store. **Open chat** attaches first, so on one of these pages it shows the error and does not open the panel. Switch to a normal page and retry.
- **One tab at a time.** The extension proxies a single `chrome.debugger` session; attach a different tab and the previous one is implicitly detached.
- **Mutually exclusive with DevTools.** Both use `chrome.debugger`, so DevTools cannot be open on an attached tab.
- **Session-only.** Attaching does not persist across Chrome restarts — reattach after restarting your browser.
- **Exclusive tab ownership.** The native host queues clients across server and CLI processes. Each browser provider holds the tab through submission, response polling, and downloads, then releases it. Update the extension alongside the native host so release acknowledgments can advance the queue. The popup cannot change tabs while a client owns the debugger.
- **Manual build.** A diff touching it does run the `live-browser` surface's selfcheck through `nodetool harness gate`, but that covers the capability seam, not the relay: the extension → `chrome.debugger` → page round trip runs only in `npm run test:integration --workspace=packages/browser`, which needs Chrome and port 7777. Keep the two protocol definitions (`chrome-extension/src/lib/protocol.ts` and `packages/browser/src/extension/protocol.ts`) in sync by hand if you change the wire format, and likewise `chrome-extension/src/lib/chat-socket.ts` with `packages/sdk/src/chat.ts` for the chat panel.

---

## Troubleshooting

### The chat panel shows "Cannot reach …"

Check the permission grant in [Pointing the panel at a server](#pointing-the-panel-at-a-server).

### Popup shows "disconnected"

- The popup shows the Chrome error when the native host is missing ("Specified native messaging host not found"). Click **Connect to Chrome** in the app (or run `nodetool extension install`) and reload the extension.
- The host is registered for one extension ID. If you loaded the extension from another folder, check that its ID matches `nodetool extension install` output.

### "No browser extension is connected" error from a workflow

- The extension must be **attached** to a tab before running a workflow that uses the extension transport — attaching is never automatic. Open the popup and click **Attach to this tab**.
- Verify `NODETOOL_BROWSER_TRANSPORT=extension` is set on the process running the workflow.

### Chrome shows "Nodetool is debugging this browser" and I can't open DevTools

- Expected while attached. Detach from the popup, or use a different tab for DevTools.

### Attach fails or the tab appears frozen

- Close any open DevTools panel on that tab first, then retry **Attach to this tab**.
- If the tab was closed or navigated away unexpectedly, the relay reports a fatal error and tears down the session — reopen the target page and reattach.

---

Related: [Getting Started](getting-started.md), [Developer: Node Reference](developer/node-reference.md), [API Reference](api-reference.md), [WebSocket API](websocket-api.md).
