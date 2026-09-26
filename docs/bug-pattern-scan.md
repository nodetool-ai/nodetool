# Bug Pattern Scan

This guide lists the bug families found in fix commits on `main` over four
weeks, with commands that find siblings of each bug in the current tree. Use it
to audit an area, or to review a diff for a known failure shape.

The source set was every non-merge commit on `origin/main` whose message
matched `fix` or `bug` (461 commits). About 240 changed behavior. The rest were
checkpoints, docs, refactors, or CI tweaks. Regenerate the list with:

```bash
git log origin/main --since="4 weeks ago" --no-merges -i -E --grep='fix|bug' --format='%h %s'
```

## How to Use This Guide

1. Pick a family and run its search commands from the repository root.
2. Treat every hit as a hypothesis. Read the code and apply the manual check.
3. Confirm a suspect with a failing test before fixing it, as the
   [Harness-First rules](HARNESS_FIRST.md#the-rules) require.
4. Scope any conclusion to the hits you read.

Families are ordered by how often they recurred.

## P1. Races and Lost Updates Across `await`

A writer reads state, awaits, then overwrites without re-checking. A user edit,
an agent write, a running generation, or a recovery worker clobbers the other.
Merge flows replace an accumulated list with the latest result.

Evidence: `0ef7ee26`, `a7797dd4`, `aea51e12`, `2b9d993c`, `992d54ad`,
`fb6a70bf`, `3be3dafd`, `799354ed`, `5d7714f4`, `b0123af1`, `72c0696b`.

```ts
// before: a concurrent render marked the doc dirty during the fetch
const doc = await trpcClient.timeline.get.query({ id });
adopt(doc);
// after: re-check after the await and route through the merge path
const doc = await trpcClient.timeline.get.query({ id });
if (isDirty()) { mergeRemote(doc); } else { adopt(doc); }
```

```bash
rg -n "await trpcClient\..*\.query" web/src/hooks web/src/stores -A4
rg -n "setConflicts\(|lastSyncedRef\.current\s*=" web/src
rg -n "db\.select" packages/models/src -A6 | rg -n "insert|update"
rg -n "reserve\(|commit\(|release\(" packages/runtime/src
```

Manual check: after each `await`, does the code write state it captured before
the `await` without comparing a version, dirty flag, or timestamp? Is a
check-then-write pair (project exists, then insert) inside one transaction?
Does a shared budget or limiter hand each caller its own reservation handle?

## P2. Pricing and Cost Recording Errors

A per-second or per-megapixel rate is returned as the run total. A flat scalar
is used where a resolution or duration grid exists. Some node types or the
streaming path never record cost.

Evidence: 7 to 8 commits in the pricing cluster, plus `76355344`, `e86d6089`,
`d88ea441`.

```bash
rg -n "resolvePrice|priceScalarUnit|priceGenspendEntry" packages/model-pricing packages/node-sdk
rg -n "recordPrediction|recordCost|nodetool_predictions" packages
```

Manual check: does every per-unit rate multiply by its quantity? Are
resolution and duration passed to a grid lookup? List every node and tool that
calls a paid provider and confirm each one records usage on every path,
including streaming and errors.

## P3. Scope Leaks and Wrong Default Scope

State, queries, or tabs from one project appear in another. An omitted
`project_id` falls into a `default` bucket. An `undefined` argument means
"inherit the current workflow" when the caller meant "none". A key unique only
within one scope is reused across scopes.

Evidence: `a7ae40b8`, `20c652a7`, `21104cdc`, `cf473afb`, `f13e4261`,
`f5ae0da8`, `5eef8ad7`, `d62fad2c`, plus the three cross-scope key commits in
batch 1.

```bash
rg -n "project_id\s*(\?\?|\|\|)\s*[\"']default" packages web/src
rg -n "openTab\(" web/src | rg -v projectId
rg -n "createNewThread\([^,]*,\s*undefined" web/src
rg -n "projectId ===" web/src/stores web/src/components
rg -n "new Map<string," packages/agents/src/capabilities
```

Manual check: for each callee, does `undefined` mean "use the current X" or
"no X"? For each map keyed by an entity ID, is that ID unique across the outer
loop's scope?

## P4. Lookup by a Non-Unique Key or Unstable Identity

`.find(x => x.id === value)` ignores a second dimension such as provider. A
preview matches "any video output" instead of its own node and output handle.

Evidence: `25cbf492`, `03781867`.

```bash
rg -n "\.find\(\(\w+\)\s*=>\s*\w+\.id\s*===" web/src packages
rg -n "outputHandle|output_handle" web/src/components/node -A3
```

Manual check: can the collection hold two entries with the same ID? Does the
selector filter by node ID and output handle together?

## P5. Duplicated Logic That Drifts

The same value, parser, type, or renderer exists twice. One copy is edited and
the other is not. Examples: a staleness hash over `clipPrompt` while the render
sends `directClipPrompt`, GPU and Canvas2D renderers, a hand-written request
interface beside its Zod schema, a second frontmatter parser, a hand-kept build
order list that covered 21 of 49 dependencies.

Evidence: `c5436b22`, `2d81b96a`, `cc1ad8fc`, `a7790498`, `e942bc39`,
`3d48196c`, `c05efcf1`, `e84c4de2`, plus the frontmatter parser fix in batch 4.

```bash
rg -n "^export interface \w+(Request|Response)" packages/protocol/src
rg -n "sha256Hex|prompt_hash|isVersionStale" packages
rg -l "canvas2d|gpu" packages/timeline/src/render
rg -n "workspaces = \[" scripts
rg -n "frontmatter" packages --type ts -l
```

Manual check: for each interface, is there a schema with the same name? If so,
derive the type with `z.infer`. Is the value compared in a staleness check
produced by the same function that the work site calls?

## P6. Guards Missing on Some Sibling Operations

A containment, ownership, or permission check covers most methods in a family
but not all. `deleteAll` and `mkdir` skipped `assertContained`, which allowed a
symlink escape. Approvers defaulted to allow. Capability mounts bypassed the
shared gate.

Evidence: `3be1f1c4`, `224981b8`, `f6fc6466`, `d1be6585`, `9721099e`.

```bash
rg -n "async (write|delete|move|copy|mkdir|deleteAll|rename)\(" packages/runtime/src
rg -n "approver:\s*\(\)\s*=>\s*[\"']allow" packages
rg -n "ungatedCapabilityRun" packages
rg -n "requireUserId\(\)" packages/websocket/src
```

Manual check: count guard calls per method in each storage or workspace class.
A method without the guard its siblings use is a suspect. Every capability
mount must go through the one shared gate.

## P7. Regex ReDoS and Single-Pass Sanitizing

Anchored repeats like `/^\/+|\/+$/g`, or a repeated group around overlapping
alternatives, backtrack polynomially on long input. CodeQL flagged most of
them. A single `.replace()` strips nested tags incompletely.

Evidence: `04f8d69b`, `64f80c39`, `0c690863`, `67cd8808`, `0e61f4d4`,
`1a538402`, `3564ef7c`, `d8ad0317`.

```bash
rg -n "\.replace\(/\^?\\\\/\+" packages web/src
rg -n "\+\$/" packages web/src --type ts
rg -n "\(\?:[^)]*\|[^)]*\)[*+]" packages web/src --type ts
rg -n "\.replace\(/<\[\^>\]\*>/" packages web/src
```

Manual check: time each candidate on 50,000 repeated characters. Replace
trailing-trim regexes with a loop, and strip markup with a parser or a loop
that runs until the output stops changing.

## P8. Schemas Too Narrow, or Fields Accepted and Ignored

MsgPack sends `null` where the schema allows only an optional string. A closed
enum rejects a valid spelling. A stripping schema drops unknown fields during
a save and reports success. A validated field is never read downstream.

Evidence: `d124efcf`, `e942bc39`, `5f85fef0`, `8c8a1fbc`, `da92dcbc`,
`1d4b765e`, `aff17ed1`, `d88ea441`, `c05efcf1`.

```bash
rg -n "z\.string\(\)\.optional\(\)" packages/protocol/src
rg -n "\.parse\(|\.safeParse\(" packages/websocket/src packages/execution/src
```

Manual check: can the field arrive as `null` over MsgPack? Does a save handler
persist parsed output without reporting stripped keys? For each schema field,
search its name in the consuming process or render code. Zero references
outside the schema means a silent no-op.

## P9. Media and Asset Handling

A node resolves media through a helper that handles inline bytes and the
temporary store but not `asset://` URIs. A chat attachment is inlined as a
base64 data URI instead of uploaded. Video goes to a provider without a
capability check, and the error names the wrong provider. iOS Safari never
fires `canplay` before `play()`.

Evidence: `465e46b6`, `6c234230`, `74f0cdb2`, the video-input capability fix
and the two iOS fixes in batch 4.

```bash
rg -n "decodeImage\(|decodeAudio\(" packages --type ts
rg -n "readAsDataURL|toDataURL\(" web/src
rg -n "not supported by \"?openai" packages/runtime/src/providers
rg -n "onCanPlay|canplay" web/src marketing
```

Manual check: does each media input reach `loadMediaRefBytes` or the asset
store? Is every attachment uploaded and referenced by ID? Does each gated path
call the matching `providerSupports*` check?

## P10. Provider Contract Mismatches

A generic spec field is never mapped to a vendor API. Numeric fields pass to
an API that declares `int` within a range, and the API returns 422. An enum
tier is written into a free-string field. `context.signal` is not forwarded, so
a cancelled run keeps polling a paid API.

Evidence: `b244198d`, `1a7eec1f`, `a59bfd06`, `296476b6`, the AtlasCloud size
fix in batch 4.

```bash
rg -n "async process\(context" -A12 packages/*-nodes/src | rg -n "fetch\(|Execute\(|poll"
rg -n 'propType === "(int|float)"' packages/runtime/src/providers
rg -n "spec\.\w+" packages/compute/src/providers
rg -n "this\.serialize\(\)" packages/*-nodes/src
```

Manual check: does every paid call receive `context.signal`? Is every
`WorkerSpec` field read by each provider? Are numeric fields clamped and
rounded like enums are coerced? Code that reads dynamic properties must read
the instance, since `serialize()` returns only declared properties.

## P11. Identifier Collisions

IDs built from `Date.now()` collide within one millisecond. Migration version
strings were reused across branches. A duplicate-ID pass disqualified the
rightful owner of an ID.

Evidence: `9c4b24a3`, plus the migration and glTF ID fixes in batch 4.

```bash
rg -n 'Date\.now\(\)\.toString\(36\)|\$\{Date\.now\(\)\}' packages web/src
rg -n 'version:\s*"[0-9]{8}_' packages/models/src/migrations
rg -n "used\.has\(" packages
```

Manual check: IDs need a counter or random component. Resource IDs follow the
[Resource ID Principles](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#resource-id-principles).

## P12. Compact Resource IDs Not Resolved at a Boundary

An agent-facing tool accepts only the full 32-character ID, although agents
receive 12-character prefixes.

Evidence: `670a215f`, `cf473afb`.

```bash
rg -n "shortResourceId|resolveResourceId" packages/agents/src packages/protocol/src
rg -ln "_id" packages/agents/src/capabilities packages/agents/src/tools
```

Manual check: every tool input that takes an agent-visible ID must resolve an
exact 12-character prefix uniquely and return an ambiguity error otherwise.

## P13. Failure Handling Errors

One failing sub-read fails a whole aggregate through `Promise.all`. A cache
stores a rejected or null result, so one transient error disables a resource
for the rest of the run. An inner timeout equals its outer timeout, so the
outer one fires with a generic message.

Evidence: `5917e4fa`, `dbcef8c2`, `91719bdc`, `f59c1cc1`.

```bash
rg -n "Promise\.all\(" packages/models/src web/src/stores
rg -n "\.catch\(\(\) => null\)" packages --type ts
rg -n "_TIMEOUT_MS|TIMEOUT_MS\b" packages/agents/src packages/cli/src
```

Manual check: should independent parts degrade separately with
`Promise.allSettled`? Does a memo cache evict failures? Is each nested
timeout strictly smaller than the one enclosing it?

## P14. Falsy Defaults and Wholesale Replacement

`x ?? "image.png"` keeps an empty string, and `path.resolve(folder, "")`
returns the folder. A `setX(partial)` API replaced the whole default object.

Evidence: `443a9187`, `b56d5516`.

```bash
rg -n '\?\?\s*"' packages --type ts
rg -n "path\.resolve\(\w+,\s*(this\.)?\w+\)" packages
rg -n "set[A-Z]\w*Interfaces?\(" packages/runtime/src
```

Manual check: can the string be `""` from a text field? Does the setter merge
keys over the defaults?

## P15. UI Stacking, Focus, and Keyboard Scope

A dialog opened from inside a popover renders beneath it. Opening a picker
leaves a sibling menu open. Background tabs kept mounted as `inert` still
consume key combos. A `:hover` reveal on a list wrapper shows every row's
button. A flex child without `min-width: 0` overflows on phones.

Evidence: `8af16e41`, `5b09d431`, `e4d347d1`, `98891619`, `103cb769`,
`e7d6a80f`, `fac29e8d`, `576448dd`, `814e9e3c`, plus the hover fix in batch 4.

```bash
rg -ln "Popover" web/src/components | xargs rg -ln "Dialog|Modal"
rg -n "useCombo\(" web/src/components
rg -n "\.[\w-]+:hover &" web/src/components
rg -n "align-items:\s*flex-start|alignItems:\s*\"flex-start\"" web/src
```

Manual check: use `Z_INDEX` tokens for nested surfaces. The combo dispatcher
must check reachability when a key is pressed. Scope hover reveals to the row.

## P16. Unregistered Tools and Unthreaded Parameters

A tool was implemented but missing from `BUILTIN_TOOL_NAMES`. A new callback
parameter reached one loop call site but not the others.

Evidence: `11d76701`, `e297798a`.

```bash
rg -n "export const \w+Tool\b" packages/agents/src/tools
rg -n "BUILTIN_TOOL_NAMES" packages/agents/src/tools/builtin-tools.ts
```

Manual check: every exported tool appears in a registry. When you add a
parameter, list every call site of the function.

## P17. Shell Scripts and Deploy Ordering

Under `set -euo pipefail`, a `grep` with no match kills the script before its
empty-result branch runs. A deploy step proceeds when a request is accepted
rather than when the machine is healthy.

Evidence: `2f22cabe`, `8177ad65`, `c652fe6d`, `dd0dd7d2`, `d8c7be77`.

```bash
rg -l "pipefail" scripts | xargs rg -n "\| *grep"
rg -n "fly machine (run|update)" scripts
```

Manual check: add `|| true` where "no match" is valid. Wait on the health
state the next step depends on.

## P18. Geometry and Aggregation Math

An overlap test uses a value from before a clamp. An append boundary folds over
`kept` and `added` but not foreign clips on the same track. A quaternion to
Euler conversion had a sign error at gimbal lock.

Evidence: `66f1a969`, `d19e962e`, `60336f71`.

```bash
rg -n "Math\.(max|min)\(" packages/timeline/src/placement
rg -n "\.reduce\(.*Math\.max" packages/timeline/src
rg -n "atan2" packages/model3d/src packages/timeline/src
```

Manual check: after a clamp, no later code should use the unclamped input.
Boundary math must include every group that stays in the result. Test
degenerate math on a full grid of inputs.
