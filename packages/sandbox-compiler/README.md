# @nodetool-ai/sandbox-compiler

Turns a sandbox pack's npm dependency into a guest module.

A pack does not have to author code for the QuickJS guest. It can point at an
npm dependency instead:

```jsonc
{
  "name": "@acme/sandbox-yaml",
  "dependencies": { "js-yaml": "^4.1.0" },
  "nodetool": {
    "apiVersion": 1,
    "sandboxModules": [{ "name": ".", "kind": "js", "npm": "js-yaml" }]
  }
}
```

This package produces the module. Three stages, in order:

1. **Bundle** — esbuild, `bundle`, `format: "esm"`, `platform: "neutral"`,
   pinned `conditions` (`import`, `module`, `default`) and `mainFields`
   (`module`, `main`), no externals, no minification. An import of a Node
   builtin fails the bundle by name; that is the filter, not a bug.
2. **Scan** — a scope-aware walk of the bundle's AST. A *free* reference to a
   global the guest does not have (`process`, `Buffer`, `require`, `eval`,
   `Function`, timers, `WebAssembly`, DOM names) is an error; a shadowed one is
   not a reference at all. A reference the module feature-detects — the
   argument of a `typeof`, or one in a branch such a check guards — is a
   warning. The warning is a heads-up, not a compatibility promise.
3. **Probe** — the bundle is imported in the real engine, because bundling
   proves resolution and nothing else. The probe context is capability-free:
   no `fetch`, no filesystem, no bridges, no env, a short deadline and capped
   output. It proves the module initializes; runtime loading stays
   authoritative after that.

Nothing here throws at a pack author. Every way admission can end short is a
named skip: `npm-module-builtin-import`, `npm-module-unresolved`,
`npm-module-too-large`, `npm-module-forbidden-global`,
`npm-module-scan-rejected`, `npm-module-probe-failed`.

## Cache

Keys are digests, never `name@version` — a linked pack, a transitive update, a
lockfile change and an esbuild upgrade all change the bundle while the version
stays put. The key covers every input file's content hash from esbuild's
metafile, the esbuild version, this compiler's contract version, and the
normalized options. The stored value carries the scan report and the probe
verdict, so a warm cache skips the probe too.

Writes are temp-file-plus-rename; a key is validated against
`^[a-f0-9]{64}$` before it reaches a path. The root is
`getNodetoolCacheDir()/sandbox-modules` (`NODETOOL_CACHE_DIR` overrides).

## Hosts

Discovery in `@nodetool-ai/node-sdk` stays synchronous and engine-free — it
never runs esbuild and never starts QuickJS. Hosts compile here and inject:

```ts
import { compileSandboxCatalog } from "@nodetool-ai/sandbox-compiler";

const host = await compileSandboxCatalog();   // compile, then discover with the results
```

The server does this in its catalog refresh, Electron after a pack installs,
and `nodetool packs compile` on demand. A synchronous host reads the cache
only:

```ts
import { createCachedNpmLookup } from "@nodetool-ai/sandbox-compiler/cache";

discoverSandboxCatalog(undefined, { compiled: createCachedNpmLookup() });
```

A miss there is `pending-compile`, naming `nodetool packs compile`.

Design: [docs/sandbox-package-design.md](../../docs/sandbox-package-design.md)
§ Config-only modules from npm packages. Measured candidates and the size cap:
[docs/m3-implementation-plan.md](../../docs/m3-implementation-plan.md).
