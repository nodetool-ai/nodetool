# Mobile App

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) → **Mobile**

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
```

## Important: not in the npm workspaces

`mobile/` is **deliberately excluded** from the root npm workspaces. Consequences:

- Install dependencies from inside `mobile/` (`cd mobile && npm install`), not from the root.
- `npm run typecheck` references the built backend packages (`@nodetool-ai/*` resolve to
  `packages/*/dist`). **Build the packages first** from the repo root:
  `npm run build:packages`. If `tsc` only complains about missing `@nodetool-ai/*` modules,
  the dists aren't built.
- Use **Node 22.22.1** (repo root `.nvmrc`; `nvm use`).

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

## Testing

- **Jest** + `@testing-library/react-native`. Tests live next to the code as
  `*.test.ts` / `*.test.tsx`.
- Query by role/label, drive with `userEvent`, await with `waitFor`.
- Coverage uses the **V8** provider — babel-plugin-istanbul's `test-exclude` is incompatible
  with the hoisted `minimatch` v9 in this monorepo and crashes `--coverage`. `jest.config.js`
  sets `coverageProvider: 'v8'` and keeps `coverageThreshold.global` below the measured numbers
  so the gate is honest and enforceable; raise it as coverage grows.

## Rules

- TypeScript strict, no `any`; throw `Error` objects, not strings.
- Functional components, typed prop interfaces.
- Zustand: select the slices you need, never the whole store.
- Keep types in sync with the backend protocol (`src/types/ApiTypes.ts` re-exports them).
- Run `npm run lint && npm run typecheck && npm test` before committing.
