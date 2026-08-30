# @nodetool-ai/browser

Driving one real Chrome page over the Chrome DevTools Protocol.

The page is either a **headless Chrome** this process launched or, through the
NodeTool **Chrome extension**'s `/ws/extension` relay, the tab the user is
already signed in to — cookies, sessions and 2FA in place, which is what makes
sites that block headless browsers reachable at all. The action loop is the
same either way: only `browserStatus` (which transport is live) and
`browserRestart` (change it) mention transports.

```ts
import { browserStatus, browserNavigate, browserView } from "@nodetool-ai/browser";

await browserNavigate({ url: "https://example.com" });
const { elements, screenshot_png_b64 } = await browserView({});
```

## What it does not do

It knows nothing about NodeTool's agents, nodes, assets, or workflows. Inputs
are plain values and outputs are plain data — a screenshot comes back as
base64, never as a persisted asset — so the layer holding a `ProcessingContext`
decides what to do with the bytes. That is what lets the `browser_*` agent
capabilities (`packages/agents/src/capabilities/browser.ts`) and the
`lib.browser.Screenshot` node share one implementation without either
depending on the other.

Chrome is reached through dynamic imports, so importing this package launches
no browser and loads no CDP client until an action runs.

## Layout

| Path | What lives there |
|---|---|
| `src/cdp-page.ts` | `CdpPage` — navigation, evaluation, clicks, keyboard, screenshots — plus `launchBrowser` and `withPage` |
| `src/actions.ts` | The action loop: one process-wide session, element indexing, and the fourteen `browser*` functions |
| `src/schemas.ts` | Zod schemas for every action's input and output |
| `src/capture.ts` | Pulling generated media out of a page (response body, then in-page fetch) |
| `src/upload.ts` | Injecting bytes into a page's file input (native, then in-page `DataTransfer`) |
| `src/extension/` | The `/ws/extension` transport: wire `protocol`, the RPC `client`, the synthetic CDP `page`, and the in-process `channel` seam the server registers |

## The session is a process singleton

One page exists per process and every caller shares it, so concurrent runs
drive the same tab. `browserRestart` is the only place the transport can
change, because switching tears the current session down first.

## Tests

`npm test` covers what can be checked without a browser: the extension wire
protocol and RPC client, and transport resolution.

`npm run test:integration` builds the Chrome extension, launches a real
headless Chrome with it loaded, and drives the production transport end to end
against local fixtures. It needs Chrome and a free port 7777, so it is not on
the CI path — run it by hand after touching the relay.

Extension setup, the wire protocol, and the agent-facing capabilities:
[docs/chrome-extension.md](../../docs/chrome-extension.md).
