# Sandbox bridge packs

One npm package per library that the sandbox compiler admits, so guest code can
`import` it instead of calling across the host bridge. Each pack is two
declarative files — a config-only `nodetool.sandboxModules` manifest in
package.json and a SKILL.md. No pack here authors a line of guest code.

| Pack | npm dependency | Specifier |
|---|---|---|
| `@nodetool-ai/sandbox-yaml` | js-yaml | `@nodetool-ai/sandbox-yaml` |
| `@nodetool-ai/sandbox-zip` | fflate | `@nodetool-ai/sandbox-zip` |
| `@nodetool-ai/sandbox-dates` | date-fns | `@nodetool-ai/sandbox-dates` |

This is an added import path, not a migration. Every `data.*` bridge stays,
with its limits: `data.parseYaml`, `data.zip`, and `data.unzip` are unchanged,
and `data.unzip`'s 50 MB inflation cap remains the hardened route for an
archive you did not create (see `sandbox-zip/SKILL.md`).

## What is not here, and why

The M3 measurement decided the list. A config-only pack exists only for a
library the compiler admits, and admission is bundle → scope-aware scan →
QuickJS probe:

| Library | Intended pack | Disposition |
|---|---|---|
| papaparse | `-csv` | imports `node:stream`; stays on `data.parseCsv` |
| fast-xml-parser | `-xml` | reads a bare `window`; stays on `data.parseXml` |
| diff | `-diff` | schedules with `setTimeout`; stays on `data.diff` |
| cheerio | `-html` | imports 25 Node builtins; stays on `data.selectHtml` |

Each stays on the host bridge until the library drops what the guest lacks, or
until a byte ABI makes a host call cheap enough not to care. The measurements
are in [docs/m3-implementation-plan.md](../../docs/m3-implementation-plan.md);
reproduce one with `nodetool packs compile --json`.

## Not workspaces, on purpose

The root `workspaces` array names every workspace by path — there is no
`packages/*` glob — and these directories are deliberately absent from it. A
pack is consumed the way any third-party pack is: installed into the
optional-node root, discovered from disk, compiled, and mounted into the guest
by the loader. Nothing in the repo may `import "@nodetool-ai/sandbox-yaml"` in
host code, and leaving them out of the workspace list is what makes that
impossible rather than merely discouraged — npm links no symlink into
`node_modules`, so the specifier does not resolve for the host at all.

The compiler still finds the dependency in this tree: esbuild resolves from the
pack directory upward, and js-yaml, fflate, and date-fns are hoisted to the
repo root by the workspaces that already depend on them. Each pack pins the
range the repo already resolves, which is the version M3 measured.

## Registry metadata

The package index lives in the external `nodetool-ai/nodetool-registry`
repository, so nothing in this repo writes an index entry. What the index reads
is here, in each pack's package.json: `name`, `description`, the
`nodetool-sandbox-pack` keyword, `nodetool.sandboxModules` (the specifier
summary the design asks index entries to carry), and `nodetool.recommended`,
the mark M6 asks for. Discovery ignores every key but `apiVersion`,
`sandboxModules`, and `internal`, so the extra metadata costs the host nothing.

## Adding a pack

1. Compile the candidate first: a pack for a library the compiler skips is a
   pack nobody can import. `nodetool packs compile --json` reports the named
   skip.
2. `packages/sandbox-packs/<pack>/package.json` with the config-only manifest
   and the dependency pinned to a range this tree already resolves.
3. `SKILL.md`: the specifier, each main function with one example written for
   the guest, and the gotchas that bite there — heap, no timers, and where the
   `data.*` bridge is still the better route.
4. Add it to the shipped-pack list in
   `packages/sandbox-compiler/tests/packs.test.ts`, which discovers, compiles,
   and runs every pack in this directory.
