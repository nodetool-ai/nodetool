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
| `@nodetool-ai/sandbox-markdown` | marked | guest | compiler admits it |
| `@nodetool-ai/sandbox-qr` | uqr | guest | compiler admits it |
| `@nodetool-ai/sandbox-subtitle` | subtitle | host | stream internals |
| `@nodetool-ai/sandbox-color` | culori | guest | compiler admits it |
| `@nodetool-ai/sandbox-decimal` | decimal.js | guest | compiler admits it |
| `@nodetool-ai/sandbox-expr` | expr-eval | host | bundle uses Function |
| `@nodetool-ai/sandbox-jmespath` | jmespath | guest | compiler admits it |
| `@nodetool-ai/sandbox-chrono` | chrono-node | host | locale tables / Date internals |
| `@nodetool-ai/sandbox-exif` | exifr | host | workers / DOM-shaped globals |
| `@nodetool-ai/sandbox-stats` | simple-statistics | guest | compiler admits it |
| `@nodetool-ai/sandbox-rrule` | rrule | guest | compiler admits it |
| `@nodetool-ai/sandbox-ics` | ics | host | Node-shaped helpers |
| `@nodetool-ai/sandbox-gif` | gifenc | guest | compiler admits it |
| `@nodetool-ai/sandbox-csv` | papaparse | host | imports `node:stream` |
| `@nodetool-ai/sandbox-html` | cheerio + turndown | host | 25 Node builtins; turndown wants a DOM |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | host | reads a bare `window` |
| `@nodetool-ai/sandbox-xlsx` | exceljs | host | Node streams |
| `@nodetool-ai/sandbox-diff` | diff | host | schedules with `setTimeout` |
| `@nodetool-ai/sandbox-zip` | fflate | host | the 50 MB inflation cap (below) |
| `@nodetool-ai/sandbox-ocr` | tesseract.js | host | WASM engine, workers, downloads its language data |
| `@nodetool-ai/sandbox-tfjs` | TensorFlow.js + model zoo | host | model weights outlive a run and outsize the guest heap |
| `@nodetool-ai/sandbox-docx` | docx | host | builds from class instances, not data |
| `@nodetool-ai/sandbox-mammoth` | mammoth | host | Node's own zip/XML stack |
| `@nodetool-ai/sandbox-epub` | epub2 | host | reads from a file path, not a buffer |
| `@nodetool-ai/sandbox-fabric` | fabric | host | DOM/Canvas APIs, rasterization |
| `@nodetool-ai/sandbox-pdflib` | pdf-lib | host | builds from class instances, not data |
| `@nodetool-ai/sandbox-pptxgen` | pptxgenjs | host | builds from class instances, not data |
| `@nodetool-ai/sandbox-pptx` | office-text-extractor | host | Node's own zip/XML stack |
| `@nodetool-ai/sandbox-pdf` | pdf-parse | host | pdf.js wants Node builtins and a canvas |
| `@nodetool-ai/sandbox-aws` | NodeTool's SigV4 signer | host | signing chain the guest has no library for |
| `@nodetool-ai/sandbox-notion` | NodeTool's Notion helper | host | first-party, so a pack cannot bring it |
| `@nodetool-ai/sandbox-supabase` | NodeTool's PostgREST helper | host | first-party |
| `@nodetool-ai/sandbox-twilio` | NodeTool's Twilio helper | host | first-party |

**Guest** means the M3 compiler bundles the library into the QuickJS guest and
the pack ships that manifest entry (`{"kind": "js", "npm": "…"}`). **Host**
means the library runs where the sandbox itself runs and the guest reaches it
through a generated ESM facade over a per-run dispatcher; the pack's manifest
entry is `{"kind": "host", "host": "<id>"}` and the implementation lives in
`packages/agents/src/host-modules/`.

### The service packs build requests; they never send one

The last five packs replace the S3, Notion, Supabase, Twilio and Apify nodes.
They are not libraries: each is a pure function that turns a description of a
request into `{url, method, headers, body}`, or in `-aws`'s case into signed
headers. The guest passes that to its own `fetch`, so the run's fetch cap, its
SSRF guard and its body limit still apply — moving the header math to the host
must not move the network call with it.

They run on the host for the reason `kind: "host"` exists at all: the code is
NodeTool's, and a config-only pack cannot ship code. `-aws` has a second reason
— SigV4 is an HMAC-SHA256 chain over a canonical form of the request, and the
guest has no library that can build one.

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
pack is consumed the way any third-party pack is: discovered from disk and
mounted into the guest by the loader. Nothing in the repo may
`import "@nodetool-ai/sandbox-yaml"` in host code, and leaving them out of the
workspace list is what makes that impossible rather than merely discouraged —
npm links no symlink into `node_modules`, so the specifier does not resolve for
the host at all.

The compiler still finds a guest pack's dependency in this tree: esbuild
resolves from the pack directory upward, and js-yaml and date-fns are hoisted to
the repo root by the workspaces that already depend on them. A host pack has no
dependency of its own at all — the library is a dependency of
`@nodetool-ai/agents`, where the implementation lives.

## Shipped, not installed

Being outside `node_modules` once meant being absent: a checkout, the desktop
app and the server image all discovered zero of these packs, so every library
NodeTool documents failed a Code node with "Sandbox module … is not installed".
Discovery now reads this directory directly. `shippedPackSearchPaths()` in
`packages/node-sdk/src/pack-loader.ts` returns it — found by walking up from the
loader module in a checkout, and read from `_sandbox/` beside `server.mjs` in
the packaged app and the Docker image, where `scripts/bundle-backend.mjs` stages
every pack here (manifest, declared files, SKILL.md) and
`scripts/verify-backend-bundle.mjs` fails a build that misses one. Both are
scans, so a pack added to this directory ships with no list to update.
`NODETOOL_SHIPPED_PACKS_DIR` overrides the root for a host that stages them
elsewhere.

The shipped root comes last in the search order. A pack installed from npm
through the Package Manager therefore shadows the copy that ships with the app,
with no duplicate-pack diagnostic: that name has an owner, and it is the one the
user installed.

Availability is not new authority. These packs declare modules; they register no
nodes and run no code at load, so the pack allowlist that gates node packs has
nothing to gate here. A host module still resolves only through
`SANDBOX_HOST_MODULES`, a Code node still has to declare the specifier, and the
credentials the service packs use still come from `nodetool.secrets.get`,
narrowed to the names that node declares.

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
