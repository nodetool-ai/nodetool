# M6 implementation plan — library packs

> **Landed, then reworked.** The first M6 shipped three packs and kept the
> `data.*` bridges beside them — "an added import path, not a migration". The
> repo owner rejected that: *"I don't want to keep the `data.*` bridges. I want
> every module to be imported properly — even the nodetool modules."* The
> rework makes `import` the only way to reach a library.
>
> What changed:
>
> - **`data.*` is gone.** The namespace, its eleven members, its entries in the
>   sandbox manifest and `SANDBOX_GLOBALS`, its prelude block, and every prompt
>   and snippet that named it.
> - **Host-facade modules.** A new manifest kind, `{"kind": "host", "host":
>   "<id>"}`, is the host-JS analog of M4's WASM path: a generated ESM facade
>   over a per-run dispatcher, with the implementation in
>   `packages/agents/src/host-modules/` — the moved bridge code, limits
>   included. A pack declares an **id**; NodeTool owns the code.
> - **Eight packs**, two guest and six host (table below).
> - **Limits moved, not dropped.** `MAX_UNZIP_TOTAL_BYTES` (50 MB),
>   `DEFAULT_SELECT_HTML_LIMIT`/`MAX_SELECT_HTML_LIMIT`, and the shared
>   5 MB/10 MB input caps live in the implementations now, each with its test.
> - **zip moved from guest to host.** M3 admitted fflate, so the first M6
>   shipped it in the guest. The 50 MB inflation cap cannot be enforced there —
>   a guest module *is* the guest, so there is no boundary below it to cap — and
>   the 64 MB heap does not replicate the policy. Host it is.

## Disposition

| Pack | Library | Runs | Why |
|---|---|---|---|
| `@nodetool-ai/sandbox-yaml` | js-yaml | guest | 101 KB bundle, 15 exports through the probe |
| `@nodetool-ai/sandbox-dates` | date-fns | guest | 176 KB, 250 exports |
| `@nodetool-ai/sandbox-csv` | papaparse | host | imports `node:stream`, so the bundle fails |
| `@nodetool-ai/sandbox-html` | cheerio + turndown | host | 25 Node builtins; turndown wants a DOM |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | host | reads a bare `window` with no `typeof` guard |
| `@nodetool-ai/sandbox-xlsx` | exceljs | host | Node streams; never a guest candidate |
| `@nodetool-ai/sandbox-diff` | diff | host | schedules with `setTimeout` |
| `@nodetool-ai/sandbox-zip` | fflate | host | compiler admits it; the inflation cap does not survive the move |

The M3 measurement still decides guest admission. What it no longer decides is
whether a library gets a pack: a library the compiler rejects gets a **host**
pack instead of a global. The earlier alternative — vendoring an authored
`kind: "js"` fork of each rejected library — stays rejected, for the same
reason: owning someone else's code and its licence trail forever is a larger
commitment than one import path is worth. A host module costs nothing like
that, because the code was already in this repo, running host-side, behind the
bridge that just went away.

### Trust

`kind: "host"` is the one manifest kind that names NodeTool's own code, so it
is the one that had to be closed. Two checks, both by identity and both
repeated:

- **Discovery** refuses an id that is not in `SANDBOX_HOST_MODULES`, and
  refuses a known id declared by a package that table does not pin it to.
- **The dispatcher** repeats both when it is built — a resolution can arrive
  from a catalog this process did not build, since the browser fetches one over
  HTTP — and then validates the module key, the export name, and the argument
  list on every call.

`packages/sandbox-compiler/tests/packs.test.ts` drives both refusals with real
crafted manifests; `packages/agents/tests/host-modules.test.ts` drives the
dispatcher's.

### Migration

Everything that named a `data.*` member moved to the import form with the
matching `packages` declaration: the sandbox manifest and its drift tests, the
node-sdk `SANDBOX_GLOBALS` set, the `run_code`/`js` tool prompts, the Code
node's own description, the editor's chat sandbox docs, five HTML code
snippets (which now carry a `packages` list the palette seeds onto the node),
the CodeAct batching example, and the live API script. `js-sandbox-data-libs.test.ts`
became `host-modules.test.ts`.

`data.parseYaml`/`toYaml` had no host pack of its own — js-yaml already ships
as a *guest* pack, so YAML is `@nodetool-ai/sandbox-yaml` and nothing was
duplicated. `data.parseXlsx` and `data.htmlToMarkdown` had no pack at all
before; they became `@nodetool-ai/sandbox-xlsx` and the second export of
`@nodetool-ai/sandbox-html`. No member survived as a global.

---

Task breakdown for milestone M6 of
[sandbox-package-design.md](sandbox-package-design.md): one config-only
pack per migratable bridge library, living in the monorepo, consumed
only via install. The original plan is kept below as written; the banner
above records where the rework departed from it.

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

- Each shipped pack installs, compiles where it compiles, and imports in a
  Code node and CodeAct step; every pack's path is CI-proven end to end.
- A workflow naming an uninstalled pack fails validation with the
  install hint.
- No `data.*` global survives, and every limit those bridges enforced has an
  equivalent inside a host module, with its test.
- A crafted manifest declaring `kind: "host"` with an unknown or forged id is
  refused at discovery and by the dispatcher.
- `npm run check` green.
