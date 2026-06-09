# Chrome Extension as CDP Proxy for NodeTool

Date: 2026-06-05
Status: Approved, ready for implementation

## Goal

Let an agentic NodeTool node drive the user's **real, logged-in Chrome** to automate
consumer media-generation UIs (Midjourney, Sora, Runway, ElevenLabs, …), capture the
generated images/videos as NodeTool **assets**, and inject existing NodeTool assets into
those sites' file inputs.

## Why the extension (not server-launched CDP)

The existing headless `lib.browser.*` / `sandbox-agent` CDP nodes already automate public
pages well. They do **not** help here because the target sites sit behind Google OAuth,
2FA, and Cloudflare/bot checks. The only browser context with those logins is the user's
own Chrome, and recent Chrome refuses `--remote-debugging-port` on the real default
profile. `chrome.debugger` **from an installed extension** is the sanctioned way to run CDP
inside that profile. The extension is not a better engine — it is the *same* CDP engine
injected into the one browser context that has the logins and survives bot checks.

Tradeoff accepted: `chrome.debugger` shows a persistent "Nodetool is debugging this
browser" banner and is mutually exclusive with DevTools on that tab.

## Key architectural insight

The agentic action loop is **already transport-agnostic**.
`packages/automation-nodes/src/lib/browser-tools-local.ts::ensureState()` builds a
`CdpPage` from a `chrome-remote-interface` client. The conversion hinges on **one seam**:
build an `ExtensionCdpPage` that feeds the *existing* `CdpPage.create(client, viewport)` a
synthetic `client` whose namespaced methods send CDP commands over a WebSocket to the
extension instead of a local socket. `chrome-remote-interface`'s shape is exactly
`client.Domain.command(params) => Promise` and `client.Domain.event(cb) => unsubscribe`,
which we replicate. Everything downstream — element indexing (`data-nt-idx`), screenshots,
all 11 actions, `runAgentLoop` — is reused **verbatim**.

## Source status

The extension source is **gone**: `chrome-extension/` contains only `dist/` (built
2026-01-02) and `node_modules/`; nothing is tracked in git and the sourcemap-referenced
`src/` files don't exist. We rebuild the extension greenfield (TS + Vite + MV3), using
`dist/manifest.json` only as a permissions reference. The old chat UI is intentionally
discarded.

## Decisions

- **Node**: add a new `LiveBrowserAgent` node; leave the headless `BrowserAgent` intact.
- **Attach UX**: explicit "Attach to this tab" button in the extension popup (no
  auto-attach). Makes the debugger banner expected and gates a powerful capability behind a
  user gesture.
- **upload_asset**: try native `DOM.setFileInputFiles` where a real filesystem path is
  reachable, else fall back to in-page DataTransfer/base64 `File` injection.
- **Transport topology**: `/ws/extension` on the nodetool server brokers between the
  extension socket and the in-process action loop via an `ExtensionBridge` singleton.
  `ExtensionCdpClient` accepts either an in-process channel or a client WS URL so it works
  whether the node runs in-server (normal) or in a separate CLI process.
- **Wire protocol**: JSON text frames on `/ws/extension` (a side channel; the main `/ws`
  stays MsgPack).
- **capture_media**: persist to the asset store immediately via `persistOutput` (same path
  as screenshots), returning an `AssetRef`.

## Wire protocol (`/ws/extension`, JSON)

Discriminated by `kind`:

- COMMAND host→ext: `{ kind: "cdp", id, method: "Domain.command", params, sessionId? }`
  → `chrome.debugger.sendCommand({tabId}, method, params)`.
- RESPONSE ext→host: `{ kind: "cdp_result", id, result? , error?: { message } }`.
  Errors surface as `throw new Error(error.message)` to match `chrome-remote-interface`.
- EVENT ext→host: `{ kind: "cdp_event", method, params, sessionId? }`. Extension forwards
  every `chrome.debugger.onEvent` for the attached tab; host only registers the handlers it
  needs (`Page.loadEventFired`, `Page.domContentEventFired`, `Runtime.consoleAPICalled`,
  `Network.requestWillBeSent/responseReceived/loadingFinished/loadingFailed`).
- CONTROL: `attach` / `attached` / `detach` / `ping` / `pong` (15s) / `error` (fatal —
  host rejects all pending and surfaces a restart-needed error).

Screenshots ride inside `cdp_result` (CDP returns base64). Large asset bytes stream as
base64 `asset_chunk` (host→ext, for upload) and `media_chunk` + `media_end` (ext→host, for
the `chrome.downloads` capture fallback).

## Components (build order)

1. **`ExtensionCdpClient`** — `packages/automation-nodes/src/lib/extension-cdp-client.ts`.
   WS RPC layer: monotonic id counter, `pending Map<id,{resolve,reject}>`, event-listener
   registry, heartbeat, reject-all on disconnect. Exposes a `chrome-remote-interface`-shaped
   `client` proxy (command→Promise, event→unsubscribe) over domains Page/Runtime/Network/
   DOM/Input/Emulation/Console/Fetch. Constructor takes an in-process channel **or** a
   `wsUrl` (`NODETOOL_EXTENSION_WS_URL`, default `ws://localhost:7777/ws/extension`).
   Unit-testable with a fake socket.

2. **`ExtensionCdpPage`** — `packages/automation-nodes/src/lib/extension-cdp-page.ts`.
   `createExtensionPage(transport, viewport) => { page: CdpPage, close }`: open the
   transport, send `attach`, feed the proxy client into the **existing** `CdpPage.create`,
   send the `*.enable` commands, set `Emulation.setDeviceMetricsOverride` (default
   1280×900). No CdpPage rewrite.

3. **`/ws/extension` + `ExtensionBridge`** —
   `packages/websocket/src/plugins/websocket.ts`,
   `packages/websocket/src/extension-cdp-bridge.ts`. Fastify WS route; register the socket
   in a module-level singleton keyed by session id; `ExtensionCdpClient` rides the bridge
   channel. Localhost auth bypass applies. One extension connection for v1.

4. **Extension rebuild** — `chrome-extension/{manifest.json,package.json,vite.config.ts,
   tsconfig.json}`, `chrome-extension/src/background/service-worker.ts`,
   `chrome-extension/src/lib/cdp-relay.ts`, minimal popup with connection status + server
   URL + **"Attach to this tab"** button. Manifest: add `debugger` + `downloads`; keep
   storage/activeTab/tabs/alarms/scripting; drop sidePanel/side_panel and the chat
   content-script. Relay: on attach, `chrome.debugger.attach({tabId}, "1.3")`; map `cdp`
   frames to `sendCommand`; forward `onEvent`; `onDetach` → fatal `error`; keepalive via
   alarms.

5. **`browser-tools-local` injection** —
   `packages/automation-nodes/src/lib/browser-tools-local.ts`. In `ensureState()`, branch on
   `NODETOOL_BROWSER_TRANSPORT=extension` (or presence of the WS URL): use
   `createExtensionPage(...)` instead of `launchBrowser()`/`CdpPage.create`. Console
   ring-buffer wiring is unchanged (events flow the same way). `browser_restart` →
   detach + re-attach instead of killing Chrome. **Single integration point** — the 11
   actions and `browser-agent-tools.ts` need no edits. Validate the whole reuse claim here
   before adding new actions.

6. **`capture_media`** action — `packages/sandbox/src/schemas/browser.ts`,
   `packages/automation-nodes/src/lib/browser-agent-tools.ts`,
   `packages/sandbox-agent/src/tools/browser.ts`. Input: ElementRef / url / resourceUrl +
   optional `media_type`. Output: `AssetRef`. Ladder: (1) `Network.getResponseBody` for a
   tracked requestId; (2) in-page read of blob/`<video>`/`<audio>`/`<img>` src, `fetch()`
   to ArrayBuffer, base64 back (chunked); (3) extension `chrome.downloads` →
   `media_chunk`/`media_end`. Bytes → `persistOutput(ctx, bytes, {namePrefix, mime})` (same
   asset path as screenshots) → `POST /api/assets`. Register as 12th `BROWSER_ACTION_SPEC`
   entry so it auto-becomes `browser_capture_media` + `sandbox_browser_capture_media`.

7. **`upload_asset`** action — same files. Input: ElementRef (the file input) +
   `asset_id`/`uri` + optional `file_name`. Native path: read asset via
   `GET /api/storage/{key}`, materialize a path Chrome can see, resolve the input's
   nodeId/objectId, `DOM.setFileInputFiles`. Fallback (no reachable path, e.g. user's
   machine): stream bytes as `asset_chunk`, build a `File` via DataTransfer in-page, assign
   `input.files`, dispatch input/change. Register as 13th `BROWSER_ACTION_SPEC` entry.

8. **`LiveBrowserAgent` node** — `packages/code-nodes/src/nodes/tool-agents.ts`. New node
   extending the `ToolAgentNode` pattern, exposing the 11 browser tools plus
   `browser_capture_media` / `browser_upload_asset`, with a system prompt describing a live
   logged-in browser. Sets the extension transport for its execution context. Drives
   `runAgentLoop` exactly as today. Output: text + produced `AssetRef`s.

## Risks

- Service workers die after ~30s idle → `chrome.debugger` detaches. Mitigate with alarms
  keepalive and treat detach as a recoverable `browser_restart` (re-attach). Long runs are
  the main exposure.
- Synthetic-`client` reuse depends on `chrome-remote-interface`'s namespace shape (stable,
  undocumented). Verify against the two `cdp-page.ts` copies' actual usage (low risk — they
  use only the enumerated methods).
- `Network.getResponseBody` can be evicted for large/streamed media → the blob-src and
  `chrome.downloads` fallbacks are essential, not optional.
- `DOM.setFileInputFiles` needs a path on the machine running Chrome; for the user's
  machine that forces the DataTransfer fallback, which some upload widgets reject. Test
  against a real target site.
- Single-session v1: one extension socket, one active tab; concurrent live-browser nodes
  would collide on the shared singleton — documented as unsupported for v1.
