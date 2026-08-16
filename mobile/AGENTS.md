# Mobile App

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Mobile**

> **Read [docs/DEVELOPMENT_STANDARDS.md](../docs/DEVELOPMENT_STANDARDS.md) first** for the shared
> TypeScript / React / Zustand / TanStack Query / testing standards. This file is the
> area-specific overlay for `mobile/`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full
> component/data-flow breakdown.

React Native / Expo app for browsing and running NodeTool workflows and AI chat from a phone.

## Quick Commands

```bash
cd mobile
npm test                 # Jest test suite
npm run test:coverage    # Jest with V8 coverage + thresholds
npm run typecheck        # tsc --noEmit
npm run lint             # oxlint src
npm run lint:fix         # oxlint --fix
npm start                # Expo dev server
npm run ios | android | web
npm run build:preview    # EAS cloud build (also: build:dev, build:production)
```

Cloud builds go through EAS (`eas.json`), by hand with the scripts above or from
the `EAS Build (mobile)` GitHub workflow, which authenticates with the
`EAS_TOKEN` secret. See [README.md § Building for Production](README.md#building-for-production).

## Important: not in the npm workspaces

`mobile/` is **deliberately excluded** from the root npm workspaces. Consequences:

- Install dependencies from inside `mobile/` (`cd mobile && npm install`), not from the root.
- `npm run typecheck` references the built backend packages (`@nodetool-ai/*` resolve to
  `packages/*/dist`). **Build the packages first** from the repo root:
  `npm run build:packages`. If `tsc` only complains about missing `@nodetool-ai/*` modules,
  the dists aren't built.
- Use **Node 22.22.1** (repo root `.nvmrc`; `nvm use`).

`@nodetool-ai/app-runtime` is the exception: it is dependency-free TypeScript
and is compiled **from source**, so it needs no build. Three places must agree —
`metro.config.js` (bundler; it also maps the package's ESM `.js` specifiers back
to `.ts`), `paths` in `tsconfig.json` (types), and `moduleNameMapper` in
`jest.config.js` (tests). Wire any further shared package the same way.
`app.json` turns off `experiments.onDemandFilesystem` for the same reason —
read the comment at the top of `metro.config.js` before changing any of it.

## Stack

- React Native 0.85 + Expo SDK 56, React 19, TypeScript 6.
- **Server state**: tRPC v11 client + TanStack Query v5. REST goes through the global `fetch`
  (`services/api.ts` — **no Axios**); most domains (workflows, assets, jobs, secrets,
  collections, threads, models) use tRPC.
- **Local state**: Zustand v5 stores in `src/stores/` (one domain each; select narrowly).
- **Realtime**: WebSocket + MsgPack. `WebSocketService` is the singleton that routes
  workflow/job messages; `WebSocketManager` is the per-connection chat socket.
- **Auth**: Supabase + Google Sign-In (`stores/AuthStore.ts`, `services/supabase.ts`).
- **UI**: React Native core components with `StyleSheet` (no MUI / web primitives here).
- **Mini apps**: `components/app_runtime/` renders an application document (fetched over
  `/api/applications/*` by `hooks/useApplications.ts`) with native widgets on
  top of `@nodetool-ai/app-runtime` — the same core the web runtime and the CLI `app debug`
  harness use. See [ARCHITECTURE.md § Mini apps](ARCHITECTURE.md#mini-apps-srccomponentsapp_runtime).
- **Documents**: `documents/` + the document screens open storyboards, scripts, JS scripts,
  timelines, and sketches. No tabs — one document per pushed screen. Edits are expected to come from
  the chat agent through the `ui_*` tools registered there, so `kinds.ts` tracks
  `agentEditable` separately from `surface`: the timeline has no touch editor but the agent
  writes it. Each kind's transport lives in `backends.ts` (scripts are not a
  `resources.*` kind — neither their table nor the JS scripts table has a
  `revision`), which is why the store's concurrency token is opaque.
  See [ARCHITECTURE.md § Documents](ARCHITECTURE.md#documents-srcdocuments).

## Testing

- **Jest** + `@testing-library/react-native`. Tests live next to the code as
  `*.test.ts` / `*.test.tsx`.
- Query by role/label, drive with `userEvent`, await with `waitFor`.
- Coverage uses the **V8** provider — babel-plugin-istanbul's `test-exclude` is incompatible
  with the hoisted `minimatch` v9 in this monorepo and crashes `--coverage`. `jest.config.js`
  sets `coverageProvider: 'v8'` and keeps `coverageThreshold.global` below the measured numbers
  so the gate is honest and enforceable; raise it as coverage grows.

## Screenshotting every screen

`scripts/screenshot-screens.mjs` drives the **Expo web** build with Playwright and
captures one PNG per screen, walking the deep-link paths in
`navigation/linking.ts`. It's how layout regressions get caught without a device.

```bash
npm run dev:server                                   # repo root: API on :7777
npm --prefix mobile run web                          # Expo web on :8081
node mobile/scripts/screenshot-screens.mjs --out ./mobile-shots
node mobile/scripts/screenshot-screens.mjs --width 320   # narrow-phone pass
```

Two things to know:

- **Auth**: `App.tsx` treats an unconfigured Supabase as logged in
  (`isSupabaseConfigured`), so temporarily drop `extra.supabaseUrl` /
  `extra.supabaseAnonKey` from `app.json` — otherwise every route lands on the
  login wall. Restore it afterwards.
- **Parameterized routes** (a document, an asset, a job) need real ids; pass them
  with `--ids ids.json` (keys: `workflowId`, `threadId`, `applicationId`,
  `assetId`, `jobId`, `scriptId`, `jsScriptId`, `storyboardId`, `timelineId`, `sketchId`,
  `noteId`). Routes whose id is missing are skipped, so a partial seed still runs.

The emitted `report.json` flags any screen whose document scrolls horizontally —
a reliable signal that a row is clipped off the right edge on a phone.

## Rules

- TypeScript strict, no `any`; throw `Error` objects, not strings.
- Functional components, typed prop interfaces.
- Zustand: select the slices you need, never the whole store.
- Keep types in sync with the backend protocol (`src/types/ApiTypes.ts` re-exports them).
- Run `npm run lint && npm run typecheck && npm test` before committing.
