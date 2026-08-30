# Nodetool Chrome Extension

A Manifest V3 Chrome extension that acts as a thin CDP (Chrome DevTools
Protocol) proxy — a relay between the user's logged-in Chrome and a Nodetool
server's live browser agent.

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

## What drives it

Nothing in here originates a command. The server side does, through the
`browser_*` agent capabilities — `browser_view`, `browser_click`,
`browser_input_text`, `browser_capture_media` and the rest — which drive one
CDP page over either transport: a headless Chrome the server launched, or the
tab this extension attached. `browser_status` reports which, and whether an
extension currently holds the `/ws/extension` socket.

Implementations: `packages/agents/src/capabilities/browser.ts` (the
capabilities), `packages/automation-nodes/src/lib/browser-actions.ts` (the
action layer), `packages/automation-nodes/src/lib/extension-cdp-client.ts`
(this wire protocol, host side). Full documentation:
[docs/chrome-extension.md](../docs/chrome-extension.md).

## Wire protocol

`src/lib/protocol.ts` is a **mirror** of
`packages/automation-nodes/src/lib/extension-protocol.ts` — the extension
cannot import from `packages/`, so the two files are kept byte-identical apart
from their header comments. Change one, change the other.

Three declared frame kinds are **not implemented on either side**:
`asset_chunk`, `media_chunk`, and `media_end`. They are the shape a
`chrome.downloads` capture fallback would take. Uploads currently reach a file
input through an in-page `DataTransfer` injection and media is captured with
`Network.getResponseBody` or an in-page `fetch`, so nothing needs them yet.
