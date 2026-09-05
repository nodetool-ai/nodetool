# Nodetool Chrome Extension

A Manifest V3 extension with two surfaces:

- **Chat side panel** — the Nodetool chat UI in Chrome's side panel, talking to
  your Nodetool server over the same `/trpc` and `/ws` endpoints the web app
  uses. Chat only: no media generation modes, no workflow editing.
- **CDP proxy** — a thin relay between the user's logged-in Chrome and the
  server's live browser agent, over the Chrome DevTools Protocol.

## Build status: manual-only

This package is **intentionally outside the npm workspace** (it is not listed
in the root `package.json` `workspaces`, Turbo pipeline, or CI). It has its own
self-contained dependency tree and is built on demand, not as part of
`npm run build:packages` or the PR quality gate.

If this extension grows enough to warrant automated checks, add a dedicated
GitHub Actions workflow that runs `npm ci && npm run typecheck && npm run build`
on `chrome-extension/**` changes.

## Development

```bash
cd chrome-extension
npm install        # standalone install — not part of the root workspace
npm run typecheck  # tsc --noEmit
npm run build      # vite build -> dist/
npm run dev        # vite build --watch
npm run clean      # remove dist/
```

## Loading the unpacked extension

1. Run `npm run build` to produce `dist/`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `chrome-extension/dist` directory.

## The chat side panel

Open it from the toolbar popup's **Open chat** button. The panel picks a
language model from every provider the server has configured, streams the
assistant's reply, shows the tool calls the agent makes along the way, and
keeps the conversation list the web app writes to — they are the same threads.

Source layout:

| Path | What it is |
|---|---|
| `src/sidepanel/App.tsx` | Threads, messages, socket lifecycle, one turn's state |
| `src/sidepanel/components/` | Composer, transcript, model picker, drawers |
| `src/lib/chat-socket.ts` | Mirror of `packages/sdk/src/chat.ts` |
| `src/lib/nodetool-client.ts` | Trimmed mirror of `packages/sdk/src/client.ts` |
| `src/lib/settings.ts` | Server URL, token and model selection in `chrome.storage.local` |

**Where the code came from.** The panel is a port of
[`examples/chat_app`](../examples/chat_app), which is itself built on
[`@nodetool-ai/sdk`](../packages/sdk). The extension cannot depend on either —
it is outside the workspace — so the SDK's chat socket and the handful of tRPC
procedures the UI needs are mirrored under `src/lib/`, the same arrangement
`src/lib/protocol.ts` already has with `packages/browser`. **Change one, change
the other.** The `src/lib/chat-socket.ts` header lists where it diverges from
the SDK original.

**A turn ends on `chunk.done`, not on an assistant `message` frame.** The agent
loop persists an assistant message carrying only `tool_calls` before any text
streams, so treating that frame as the end of the turn drops the answer that
follows. `web/src/core/chat/chatProtocol.ts` uses `done` for the same reason.

**The server host must match `host_permissions`.** A cross-origin `fetch` from
an extension page is CORS-checked, and the Nodetool server sends no
`Access-Control-Allow-Origin` for a `chrome-extension://` origin — so a host
outside the manifest's grant fails every request while the WebSocket, which is
not CORS-gated, still connects. `localhost`, `127.0.0.1` and any HTTPS host
ship in `host_permissions`; anything else (a LAN box over plain HTTP) is
covered by `optional_host_permissions` and requested when you save it in the
panel's server settings.

The panel sends turns with `permission_mode: "auto"`. It renders no approval
cards, so a gated tool call would otherwise stall the turn with nothing to
answer it.

## The CDP proxy

Nothing in here originates a command. The server side does, through the
`browser_*` agent capabilities — `browser_view`, `browser_click`,
`browser_input_text`, `browser_capture_media` and the rest — which drive one
CDP page over either transport: a headless Chrome the server launched, or the
tab this extension attached. `browser_status` reports which, and whether an
extension currently holds the `/ws/extension` socket.

Implementations: `packages/agents/src/capabilities/browser.ts` (the
capabilities), `packages/browser/src/actions.ts` (the action loop),
`packages/browser/src/extension/client.ts` (this wire protocol, host side). Full documentation:
[docs/chrome-extension.md](../docs/chrome-extension.md).

### Wire protocol

`src/lib/protocol.ts` is a **mirror** of
`packages/browser/src/extension/protocol.ts` — the extension
cannot import from `packages/`, so the two files are kept byte-identical apart
from their header comments. Change one, change the other.

Three declared frame kinds are **not implemented on either side**:
`asset_chunk`, `media_chunk`, and `media_end`. They are the shape a
`chrome.downloads` capture fallback would take. Uploads currently reach a file
input through an in-page `DataTransfer` injection and media is captured with
`Network.getResponseBody` or an in-page `fetch`, so nothing needs them yet.
