# Sandbox library packs

One npm package per library the sandbox offers. Each pack is two declarative
files — a config-only `nodetool.sandboxModules` manifest in package.json and a
SKILL.md. No pack here authors a line of code.

There is one import surface and no second route: a library is reached with
`import`, from a pack that is installed and declared on the node. The `data.*`
guest globals are gone.

## The packs

| Pack | Library | Runs | Why |
|---|---|---|---|
| `@nodetool-ai/sandbox-dates` | date-fns | guest | compiler admits it |
| `@nodetool-ai/sandbox-yaml` | js-yaml | guest | compiler admits it |
| `@nodetool-ai/sandbox-csv` | papaparse | host | imports `node:stream` |
| `@nodetool-ai/sandbox-html` | cheerio + turndown | host | 25 Node builtins; turndown wants a DOM |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | host | reads a bare `window` |
| `@nodetool-ai/sandbox-xlsx` | exceljs | host | Node streams |
| `@nodetool-ai/sandbox-diff` | diff | host | schedules with `setTimeout` |
| `@nodetool-ai/sandbox-zip` | fflate | host | the 50 MB inflation cap (below) |

**Guest** means the M3 compiler bundles the library into the QuickJS guest and
the pack ships that manifest entry (`{"kind": "js", "npm": "…"}`). **Host**
means the library runs where the sandbox itself runs and the guest reaches it
through a generated ESM facade over a per-run dispatcher; the pack's manifest
entry is `{"kind": "host", "host": "<id>"}` and the implementation lives in
`packages/agents/src/host-modules/`.

### Why zip is a host pack

fflate is pure JavaScript and the compiler admits it — it shipped as a guest
pack once. It does not now, because of `MAX_UNZIP_TOTAL_BYTES`. A zip bomb is a
policy question, and a policy enforced inside the guest is enforced by code the
guest can decline to call; the 64 MB guest heap does not replicate it either,
because fflate inflates into host memory first. The library therefore runs on
the host, where the cap sits between the archive and the guest with nothing
around it.

## A pack cannot bring a host module

`kind: "host"` carries an **id**, never an implementation. Discovery admits the
entry only when the id is in `SANDBOX_HOST_MODULES`
(`packages/protocol/src/sandbox-host.ts`) *and* the declaring package is the one
that table pins to the id — so `@evil/x` declaring `{"host": "csv"}` is refused,
and an unknown id is refused outright. The per-run dispatcher repeats both
checks on every call, because the boundary is enforcement, not declaration.

Adding a host module is a NodeTool change: a row in the protocol table and an
implementation in `packages/agents/src/host-modules/registry.ts`. A third-party
pack cannot reach host execution through this path.

## Not workspaces, on purpose

The root `workspaces` array names every workspace by path — there is no
`packages/*` glob — and these directories are deliberately absent from it. A
pack is consumed the way any third-party pack is: installed into the
optional-node root, discovered from disk, and mounted into the guest by the
loader. Nothing in the repo may `import "@nodetool-ai/sandbox-yaml"` in host
code, and leaving them out of the workspace list is what makes that impossible
rather than merely discouraged — npm links no symlink into `node_modules`, so
the specifier does not resolve for the host at all.

The compiler still finds a guest pack's dependency in this tree: esbuild
resolves from the pack directory upward, and js-yaml and date-fns are hoisted to
the repo root by the workspaces that already depend on them. A host pack has no
dependency of its own at all — the library is a dependency of
`@nodetool-ai/agents`, where the implementation lives.

## Registry metadata

The package index lives in the external `nodetool-ai/nodetool-registry`
repository, so nothing in this repo writes an index entry. What the index reads
is here, in each pack's package.json: `name`, `description`, the
`nodetool-sandbox-pack` keyword, `nodetool.sandboxModules` (the specifier
summary the design asks index entries to carry), and `nodetool.recommended`.
Discovery ignores every key but `apiVersion`, `sandboxModules`, and `internal`,
so the extra metadata costs the host nothing.

## Adding a pack

**Guest pack.** Compile the candidate first — a pack for a library the compiler
skips is a pack nobody can import; `nodetool packs compile --json` reports the
named skip. Then write the package.json with `{"kind": "js", "npm": "<dep>"}`
and the dependency pinned to a range this tree already resolves.

**Host pack.** Add the row to `SANDBOX_HOST_MODULES` and the loader to
`packages/agents/src/host-modules/registry.ts`, with the implementation beside
it and every limit inside it. Then write the package.json with
`{"kind": "host", "host": "<id>"}`.

Either way: a `SKILL.md` with the specifier, each export with one example
written for the guest, and the gotchas that bite there; a row in
`packages/node-sdk/src/sandbox-bridge-packs.ts` so an uninstalled specifier gets
an "Install …" hint; and the pack directory added to
`packages/sandbox-compiler/tests/packs.test.ts`, which discovers, compiles, and
runs every pack in this directory.
