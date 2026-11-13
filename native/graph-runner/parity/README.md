# Native runner parity suite

Runs every node in `ALL_BASE_NODES` (`@nodetool-ai/base-nodes`) through the
TypeScript runner and the native runner, compares the message streams, and
gives each node one status with a reason. The baseline in `baseline.json`
records the statuses, and `--check` fails when a node at parity loses it.

## Run

From `native/graph-runner/`, with Node 24:

```bash
node parity/run.mjs            # classify every node
node parity/run.mjs --check    # same, then exit 1 if a baseline parity node regressed
node parity/run.mjs --update   # same, then write the result into parity/baseline.json
node parity/run.mjs --only nodetool.control. --check   # a subset
node parity/run.mjs --from build/parity/result.json --check   # check an earlier result
```

By default it uses the runner at
`~/.cache/graph-runner-parity/snapshot/nodetool-graph-runner`
(`--runner <path>` picks another), builds the parity guest into
`build/parity/` and compiles it to bytecode (`--bundle <path>` uses a prebuilt
one). `--modules <comma-separated package subpaths>` builds a guest for a
specific qualification inside the same offline sandbox. Include the helper
modules its graphs use, and select the qualified types with `--only`.
Results go to `build/parity/result.json` and `build/parity/summary.md`.
The reference stream of each case is kept next to its graph in
`build/parity/graphs/`. A full run takes a few minutes, most of it native
runs: each loads the whole guest in about two seconds.

## Safety

Every child process, the guest build included, runs under `unshare -rn` (no
network) with `env -i` and only `PATH`, `HOME`, `TMPDIR`, `NODE_ENV` and the
lavapipe Vulkan driver variables set. `HOME` and the working directory are
empty directories under `build/parity/sandbox/`, so no `.env` file, settings
file or keychain is reachable, and the reference has no secret resolver. The
run stops if a test connection from inside the sandbox succeeds. Nodes that
start host programs, browsers or local models, wait for outside events, or
output the wall-clock time are never run (`SKIP_RULES` in `rules.mjs`).

The TypeScript side is `reference-batch.mjs`: two long-lived processes that
load the node library once and run cases from a queue, each with a timeout.
It hydrates graphs as `tools/ts-reference.mjs` does, and gives the context
in-memory storage. Its SQLite databases (the vector store) are files under the
sandbox `HOME`. The native runner gets no `--sqlite-dir`, so its node code opens
in-memory databases only, and no run can reach the user's NodeTool database.
It gets `--allow-media`, so media decodes in the case workspace as libav
does on the reference side, with no encoder granted.

## Statuses

| Status | Meaning |
|---|---|
| `parity` | Every measured case produces the same streams on both sides. Reasons ending in "only the error path is covered" mean both sides failed the same way. |
| `mismatch` | Both ran and the streams differ. The reason holds the first divergence. A crash or timeout of the native runner is also a mismatch. |
| `native-unsupported` | The class does not load or construct in QuickJS, or the native run fails where the reference does not. `capability` names what is missing. |
| `reference-unavailable` | The TypeScript run fails offline because it needs the network, a secret, a selected model, a GPU, a host binary or a database model interface, which the sandboxed context lacks (`OFFLINE_REASONS` in `rules.mjs`), or it timed out. |
| `skipped` | Not run, by the named skip rule. |

A node with several cases takes the worst measured status. Cases the reference
cannot run are ignored when another case of the node was measured.

Streams are compared by `diffStreams` from `tools/conformance.mjs`
(`compare.mjs` loads it), per job, edge and node. A mismatching case is run on
the reference a second time, and the reason says so when the reference
disagrees with itself.

Image values are the one exception to a strict comparison. `compare.mjs`
decodes both sides' pixels and accepts a difference of at most
`PIXEL_TOLERANCE` (1) 8-bit level per premultiplied channel. TypeScript
compiles the shared WGSL with Dawn's Tint and the native runner with
wgpu-native's naga, so byte-identical output is not guaranteed even on the
same Vulkan driver. Only the pixels, the decoded size and the ref's other
fields are compared, not the encoding: the reference carries raw RGBA (which
`reference-batch.mjs` keeps as `data: {__rgba__: <base64>}`), and the native
runner sends PNG or raw RGBA with `data: {__bytes__: <base64>}`. `summary.md` lists the largest measured difference of every
case with images, and `result.json` records it per case as `images`.

## Cases

`cases/generated/` holds one default case per node: the node with its
declared defaults, a constant feeding each required input that a constant can
carry, and an Output node on every declared output. Regenerate after the node
library changes:

```bash
node parity/inventory.mjs          # parity/inventory.json
node parity/generate-cases.mjs     # parity/cases/generated/
```

`cases/hand/` holds written cases for the control, text, constant, input and
variable nodes, where defaults exercise little, and `media.json` for media
nodes with small real inputs (WAV, PNG, PDF and text as `data:` URIs or
workspace files). A case is `{"id", "node", "graph", "params"?, "workspace"?}`.
`node` is the type it covers, and the graph may contain helper nodes.
`workspace` lists files to put in the case's workspace, as
`{"<relative path>": "<text>" | {"base64": "..."}}`. Add a case by adding an
object to a file there. Case ids must be unique.

Every case runs with a workspace directory on each side: the reference gets a
local workspace and works in that directory, the native runner gets
`--workspace`. Before comparing, each side's workspace path becomes
`$WORKSPACE`, the `%Y-%m-%d-%H-%M-%S` stamps in default file names of save
nodes become `$TIME`, and native bytes (`{"__bytes__": "<base64>"}`) become the
reference's `{"__bytes__": <length>}`, so equal lengths match and the node's
own outputs carry the exact bytes where it encodes them as base64.

Vector cases index strings, embeddings and an image URI, then count, read and
keyword-query the collection. A control dependency orders each read after the
write. Cases are idempotent because the reference shares one vector store.
variable nodes, where defaults exercise little. `cases/hand/image.json` is
written by `node parity/generate-image-cases.mjs`: the image nodes on small
real PNG inputs, the `lib.image.draw` generators at a small size, and chains
of GPU nodes. Those cases leave the node unconnected, because an Output node
makes the reference store the image as an asset, which needs a database. A case is
`{"id", "node", "graph", "params"?}`. `node` is the type it covers, and the
graph may contain helper nodes. Add a case by adding an object to a file
there. Case ids must be unique.

## The parity guest

`node guest/build.mjs --profile parity` bundles every module base-nodes
imports its node lists from (`modules.mjs`), or the list in `--modules a,b`.
The default profile is unchanged. The generated module that loads them uses a
dynamic `import()` per module, so a module with top-level await bundles and a
module that throws or rejects at load removes only its own nodes.
Modules the guest cannot provide become stubs that throw a named error with
the reason the [module contract](../guest/host/README.md#the-module-contract)
gives. `guest/parity/probe.mjs` is the load probe whose report `run.mjs` reads
first.

## Updating the baseline

Run `--check`. It prints the nodes that newly reach parity. When the changes
are intended, run `--update` and commit `baseline.json`. With `--only`,
`--update` replaces only the listed nodes.

## Example workflows

`examples.mjs` runs every shipped example in
`packages/base-nodes/nodetool/examples/nodetool-base/` on the native runner
with fake providers, and `examples-baseline.json` records each outcome. From
`native/graph-runner/`, with Node 24:

```bash
node parity/examples.mjs            # run every example
node parity/examples.mjs --check    # same, then exit 1 if an outcome differs from the baseline
node parity/examples.mjs --update   # same, then write the outcomes into parity/examples-baseline.json
node parity/examples.mjs --only "Trim a Clip" --check   # examples whose file name contains the text
```

The runner defaults to `build/nodetool-graph-runner`, and `--runner <path>`
picks another. Like `run.mjs`, the script builds and compiles the parity
guest, which admits provider nodes, unless `--bundle` names one. `--jobs` (default 2, at most 3) and `--timeout`
(milliseconds per example, default 60000) bound the runs. Work goes to
`~/.cache/graph-runner-examples/` (`--out`): one directory per example under
`runs/` with its graph, workspace, asset and SQLite directories, stdout and
stderr, and `result.json` and `summary.md` for the whole run. The summary
counts the groups, splits them into examples with and without providers,
groups failures by reason, counts the failures before execution by the module
contract reason of the unavailable export, and lists each example's nodes
that are not at parity in `baseline.json`.

Each example is prepared by `prepareForFakeRun` from
`packages/base-nodes/tests/support/example-run-preparation.ts`, the file the
TypeScript example suite uses. Each run gets `--fake-providers`,
`--package-assets` for the shipped sample media, `--allow-media`, and a model
database, so Output nodes can store assets. Each runs under `unshare -rn` and
`env -i`, with only loopback up and a check that the sandbox is offline, so no
provider key or network is reachable.

| Group | Meaning |
|---|---|
| `comfy` | The graph has a `comfy.*` node. Not run. |
| `unrunnable` | The graph has a node `unrunnableNodeTypes` names: one that opens its own network connection or never stops. Not run. |
| `completed` | The job's last `job_update` is `completed`. |
| `failed` | The job failed or the runner exited without completing. `error` holds the first error line, with run paths, generated ids, times and durations replaced so it stays the same between runs. When the runner refused the graph before any node ran, `error` is the first validation issue after `Before execution: `. |
| `timeout` | The run passed `--timeout` and was killed. |

`ts` is the example's status in `tests/example-workflows-execute.test.ts`:
`completes`, `cannot complete` (listed in `CANNOT_COMPLETE`) or `skipped`.

`--check` fails when an outcome differs from the baseline: an example that
stops completing, a failure whose error changes, an example that newly
completes, and an example added or removed. It prints each change. Fix a
regression. When a change is intended, run `--update` and commit
`examples-baseline.json`. With `--only`, `--update` replaces only the listed
examples.
