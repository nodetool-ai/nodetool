# M6 implementation plan — bridge packs

> **Landed.** Three packs ship in `packages/sandbox-packs/`; four
> libraries stay on the host bridge. The table below is what M3's
> measurement decided, not what this plan originally listed.

## Disposition

| Pack | Library | Outcome |
|---|---|---|
| `@nodetool-ai/sandbox-yaml` | js-yaml | ships — 101 KB bundle, 15 exports through the probe |
| `@nodetool-ai/sandbox-zip` | fflate | ships — 61 KB, 49 exports; warns on `queueMicrotask`/`setTimeout`, which only the async API touches |
| `@nodetool-ai/sandbox-dates` | date-fns | ships — 176 KB, 250 exports; added here because it is admitted |
| `@nodetool-ai/sandbox-csv` | papaparse | stays host-side — imports `node:stream`, so the bundle fails |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | stays host-side — reads a bare `window` with no `typeof` guard |
| `@nodetool-ai/sandbox-diff` | diff | stays host-side — schedules with `setTimeout` |
| `@nodetool-ai/sandbox-html` | cheerio | stays host-side — imports 25 Node builtins |

The four unshipped libraries keep `data.parseCsv`, `data.parseXml`,
`data.diff`, and `data.selectHtml` as their only route until the library
drops what the guest lacks, or a byte ABI makes the host call cheap enough
that the import path stops mattering. An authored `kind: "js"` pack is the
design's alternative for exactly this case, and `diff` was the one
candidate worth attempting — its `setTimeout` sits in the async API, so a
sync-only core could pass the scan. It was not attempted: the compiler is
the only npm path, so an authored pack means vendoring a fork of the
library into this repo and owning its updates and its licence trail
forever. That is a larger commitment than one import path is worth.

What landed against the tasks below: Task 1 as three pack directories plus
`packages/sandbox-packs/README.md` (they are **not** root workspaces —
the `workspaces` array is an explicit path list, so leaving them out makes
host-side import impossible rather than merely discouraged); Task 2 as one
SKILL.md per pack; Task 3 as a drift pin on `MAX_UNZIP_TOTAL_BYTES` plus
the steering language in `sandbox-zip`'s SKILL.md and package description;
Task 4 as `sandbox-bridge-packs.ts` in node-sdk (the install hint) and the
`nodetool.recommended` mark the external registry index reads; Task 5 as
`packages/sandbox-compiler/tests/packs.test.ts` and the extended
`sandbox-packages` surface in the harness registry.

---

Task breakdown for milestone M6 of
[sandbox-package-design.md](sandbox-package-design.md): one config-only
pack per migratable bridge library, living in the monorepo, consumed
only via install. This is an **added import path, not a migration** —
every `data.*` bridge stays, with its safety limits.

## Task 1 — The pack workspace

New directory `packages/sandbox-packs/` holding one npm package per
library, each just a package.json (config-only manifest, M3 form) plus
SKILL.md:

| Pack | npm dependency | Note |
|---|---|---|
| `@nodetool-ai/sandbox-csv` | papaparse | |
| `@nodetool-ai/sandbox-yaml` | js-yaml | |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | |
| `@nodetool-ai/sandbox-diff` | diff | |
| `@nodetool-ai/sandbox-zip` | fflate | see Task 3 |
| `@nodetool-ai/sandbox-html` | cheerio | only if the M3 size
measurement admitted it; otherwise dropped here and recorded |

Each manifest is `{"name": ".", "kind": "js", "npm": "<lib>"}` — the
single-module root form, so usage reads
`import Papa from "@nodetool-ai/sandbox-csv"`. These packages are
**not** part of the root workspace build graph the way backend
packages are: they ship no compiled output and are consumed only via
the package-manager install flow. Whatever workspace wiring they get
must not let anything import them in-process.

## Task 2 — Skills

A SKILL.md per pack: the specifier, the main functions with one
example each written for the sandbox context, and the gotchas that
matter there — input size caps, the 64 MB guest heap, no timers, and
where the hardened `data.*` bridge remains the better route. The M5
disclosure machinery serves them; nothing new here beyond the files.

## Task 3 — The zip-bomb boundary, written down

fflate's bridge enforces a 50 MB decompression cap
(`MAX_UNZIP_TOTAL_BYTES`) that the guest heap does not replicate — a
64 MB heap does not bound what a stream inflates through. The
`sandbox-zip` SKILL.md and the pack description must steer
decompression of untrusted archives to the `data.unzip` bridge, and
the design doc's bridge table stays authoritative: exceljs (Node
streams), turndown (DOM), `format.*` (no Intl), image/canvas
(native), and every capability bridge stay host-side permanently.
Nothing in this milestone touches a bridge limit.

## Task 4 — Registry and validation presence

- The registry index entries for the six packs carry the
  `sandboxModules` summary and a recommended mark.
- Presence is never assumed: `nodetool validate` on a workflow
  declaring an uninstalled bridge pack fails with "install <pack>"
  (the M1 unknown-specifier error already names the pack; this adds
  the install hint for known registry packs).
- Prompts advertise only installed packs — already M1's rule; the
  test here proves an uninstalled bridge pack never appears in the
  one-line tier.

## Task 5 — End-to-end proof and CI

- An integration test installs `sandbox-yaml` through the real
  scripts-disabled install flow, compiles it (M3), and runs
  `import yaml from "@nodetool-ai/sandbox-yaml"` in a Code node on
  the kernel — the full path a third-party pack will take.
- The `harness gate` surface registry gains the sandbox-packs
  surface with this test as its selfcheck, keeping the packs from
  shipping uncovered.

## Sequencing

Task 1 → 2 → 4 → 5; Task 3 is wording inside 1–2. Depends on M3 (the
compiler is what turns these config-only manifests into modules) and
M5 (skill disclosure). cheerio's fate is decided by M3 Task 1's
measurement, not here.

## Exit criteria

- Each shipped pack installs, compiles, probes, and imports in a Code
  node and CodeAct step; the yaml pack's path is CI-proven end to end.
- A workflow naming an uninstalled pack fails validation with the
  install hint.
- The `data.*` bridges and their limits are byte-for-byte untouched by
  this milestone.
- `npm run check` green.
