# @nodetool-ai/server

Private entry point that starts the NodeTool HTTP and WebSocket server with every built-in node pack bundled. It is not published to npm.

The package has two files:

- `src/main.ts` is the executable (`dist/main.js`). It calls `startServer` from `@nodetool-ai/websocket/server` with `bundledPackSource`.
- `src/index.ts` exports `bundledPackSource`, a `PackSource` built by `createBundledPackSource` from `@nodetool-ai/base-nodes/server-pack-source`.

Its `dependencies` list every node pack and runtime library the server loads, including the optional peers of the core packages. `tests/bundled-dependencies.test.ts` fails when a core package's optional peer is missing from this manifest or from the packs.

## Run

From the repository root, after `npm run build:packages`:

```bash
node packages/server/dist/main.js
```

The server reads the usual settings: `PORT`, `HOST`, `NODETOOL_ENV`. See [Configuration](../../docs/configuration.md#environment-variables-index). For development, `npm run dev:server` starts the backend on port 7777.

## Test

```bash
npm run test --workspace=packages/server
```

For the design behind a bundled host with separately installed packs, see [CLI pack system plan](../../docs/cli-pack-system-plan.md).
