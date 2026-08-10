# M6 implementation plan — bridge packs

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
