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
