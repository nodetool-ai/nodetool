# Mobile App

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Mobile**

> **Read [docs/DEVELOPMENT_STANDARDS.md](../docs/DEVELOPMENT_STANDARDS.md) first** for the shared
> TypeScript / React / Zustand / TanStack Query / testing standards. This file is the
> area-specific overlay for `mobile/`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full
> component/data-flow breakdown.

React Native / Expo app for running NodeTool mini apps and AI chat from a phone.

## Scope

The mobile app is a phone companion to the desktop and web apps, not a port of
them. It keeps the jobs a phone does better than a desktop: run mini apps,
chat, follow jobs, capture assets, and view results.

- **Kept surfaces**: Login, Settings, Apps (the home screen after login), App,
  Chat, Threads, LanguageModelSelection, Jobs, JobDetail, Assets, AssetViewer,
  Documents, StoryboardEditor, TimelineViewer, and SketchViewer.
- **Documents**: the list shows storyboards, timelines, and sketches. Other
  kinds open in the desktop or web app, and `useOpenResource` says so instead
  of pushing a screen.
- **View only**: timelines and sketches are view only on mobile. No touch
  editing and no client-side `ui_*` edit tools. The desktop editor and the
  server agent's own tools edit them. The timeline viewer reloads on focus.
  Storyboards are the one editable kind, through `StoryboardEditor` and the
  `ui_storyboard_*` tools.
- **No parity work**: a new web feature gets no mobile version unless the
  request names mobile. A mini-app widget mobile does not render shows a
  fallback that names it and points at desktop or web, so a new web widget
  never forces a mobile change.
- **Shared contracts**: a change to `packages/protocol`, `packages/app-runtime`,
  or a tRPC router that mobile calls must still keep `npm run typecheck` in
  `mobile/` green.

## Quick Commands

```bash
cd mobile
npm test                 # Jest test suite
npm run test:coverage    # Jest with V8 coverage + thresholds
npm run typecheck        # TypeScript 7 native compiler via the shared launcher
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
- Use the Node version in the repo root `.nvmrc` (`nvm use`). The `base`
  profile in `eas.json` pins the same version for cloud builds.

`@nodetool-ai/app-runtime` and `@nodetool-ai/protocol/resource-uri` are the
exceptions: they are dependency-free TypeScript compiled **from source**, so
they need no build. Three places must agree —
`metro.config.js` (bundler; it also maps the package's ESM `.js` specifiers back
to `.ts`), `paths` in `tsconfig.json` (types), and `moduleNameMapper` in
`jest.config.js` (tests). Wire any further shared package the same way.
`app.json` turns off `experiments.onDemandFilesystem` for the same reason —
read the comment at the top of `metro.config.js` before changing any of it.

## Stack

- React Native 0.85 + Expo SDK 56, React 19, TypeScript 7 native CLI / TypeScript 6 API compatibility.
- **Server state**: tRPC v11 client + TanStack Query v5. REST goes through the global `fetch`
  (`services/api.ts` — **no Axios**); most domains (assets, jobs, documents,
  threads, models) use tRPC.
- **Local state**: Zustand v5 stores in `src/stores/` (one domain each; select narrowly).
- **Realtime**: WebSocket + MsgPack. `WebSocketService` is the singleton that routes
  workflow/job messages; `WebSocketManager` is the per-connection chat socket.
- **Auth**: Supabase + Google Sign-In (`stores/AuthStore.ts`, `services/supabase.ts`).
- **UI**: React Native core components with `StyleSheet` (no MUI / web primitives here).
  Colors come from `useTheme()` (`utils/theme.ts`; text on a solid primary fill is
  `textOnPrimary`, never a literal white). Spacing, radius, type and touch-target sizes
  come from `utils/tokens.ts`. Full-screen loading, empty, failed and offline states use
  `components/ScreenState.tsx`; a failed refresh over data that is still shown uses
  `LoadErrorBanner`. `App.tsx` and `MainTabs.tsx` wrap every screen in `withScreenBoundary`, so a render
  error offers "Try again" and "Go back" instead of taking down the navigator.
- **Navigation**: Apps, Chat, Documents, Jobs, and Assets are tabs in
  `navigation/MainTabs.tsx`. Every other screen is pushed on the root stack above
  the tab bar, and reaches a tab through `navigate('Main', { screen })`. See
  [ARCHITECTURE.md § Tabs and the root stack](ARCHITECTURE.md#tabs-and-the-root-stack).
- **Mini apps**: `components/app_runtime/` renders an application document (fetched over
  `/api/applications/*` by `hooks/useApplications.ts`) with native widgets on
  top of `@nodetool-ai/app-runtime` — the same core the web runtime and the CLI `app debug`
  harness use. See [ARCHITECTURE.md § Mini apps](ARCHITECTURE.md#mini-apps-srccomponentsapp_runtime).
- **Documents**: `documents/` + the document screens open storyboards, timelines, and
  sketches. No tabs, one document per pushed screen. The storyboard is editable by touch
  and through the `ui_storyboard_*` tools. The timeline and sketch viewers register with
  the agent bridge with no handlers, so `ui_context` names them but no client tool writes
  them. See [ARCHITECTURE.md § Documents](ARCHITECTURE.md#documents-srcdocuments).
- **Inline previews**: `components/chat/resourceMentions.ts` and `InlineResourcePreview.tsx`
  draw a `sketch://` or `timeline://` reference in an assistant message, with a chip that
  opens the viewer. See [ARCHITECTURE.md § Inline Resource Previews](ARCHITECTURE.md#inline-resource-previews).

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
  with `--ids ids.json` (keys: `threadId`, `applicationId`, `assetId`, `jobId`,
  `failedJobId`, `storyboardId`, `timelineId`, `sketchId`). Routes whose id is missing are skipped, so a partial seed still runs.

The emitted `report.json` flags any screen whose document scrolls horizontally —
a reliable signal that a row is clipped off the right edge on a phone.

## Rules

- TypeScript strict, no `any`; throw `Error` objects, not strings.
- Functional components, typed prop interfaces.
- Zustand: select the slices you need, never the whole store.
- Keep types in sync with the backend protocol (`src/types/ApiTypes.ts` re-exports them).
- Run `npm run lint && npm run typecheck && npm test` before committing.
