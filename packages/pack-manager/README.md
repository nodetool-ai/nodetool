# Pack manager

Canonical authorized npm pack installation, removal, repair and CLI feature loading.
Catalog metadata lives in `@nodetool-ai/pack-core` so execution processes do not
depend on the installer.

## Pack project

Global and local CLIs install packs into an npm project the installer owns,
never into the CLI's own directory:

```
<data dir>/packs/<core version>/
  current.json          names the active generation
  g-<time>-<random>/    package.json, package-lock.json, node_modules/
  .nodetool-packs.lock  serializes installers
```

`package.json` records the requested pack and runtime library ids under
`nodetool` and their exact catalog versions under `dependencies`. npm resolves
the rest, and the lockfile is the source of truth for the tree.

Every add, remove and repair builds a new generation: copy the active
lockfile, write the new `package.json`, run `npm install` with scripts off,
check catalog integrity pins, run allowlisted install scripts, and load the
packs in a fresh process. Only then does `current.json` move to the new
generation, with one atomic rename. A failure deletes the new generation and
leaves the active one untouched. The previous generation stays for running
servers. Older generations are deleted.

`src/packs/project.ts` owns this layout and `src/packs/installer.ts` the
transaction.

## Module resolution

A pack's own `node_modules` can hold copies of core packages such as
`@nodetool-ai/config`. Each core package must exist once per process, so
`src/packs/resolution.ts` registers a `module.registerHooks` resolve hook
(Node.js 22.15 or later) when the CLI loads its pack snapshot:

- An import from inside the pack project of an `@nodetool-ai/*` package that is
  not a catalog pack, or of a catalog shared-identity library, resolves from
  the CLI when the CLI has that package.
- The same applies to a project package whose install script npm skipped
  because no catalog pack allowlists it. Its native addon is unbuilt in the
  project, so the CLI's built copy (for example `better-sqlite3`) is used.
- A bare import from host code that the CLI's tree cannot satisfy resolves from
  the pack project, so core code reaches runtime libraries installed as packs.

`require.resolve` bypasses hooks, so load checks use `resolvePackDependency`,
which applies the same rule.

A command feature installed in the pack project has no CLI among its
ancestors, yet it configures the pack host from its own entry, sometimes in a
child process (`nodetool server serve`). Activation records the CLI root in
`NODETOOL_PACKS_CLI_ROOT`, and the host uses that CLI when the entry lies inside
its pack project.
