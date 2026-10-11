# nodetool-mutator

Mutation testing for TypeScript and JavaScript, ported from
[unclebob/mutator](https://github.com/unclebob/mutator) and restricted to its
TypeScript rules. It finds mutation sites with the TypeScript compiler API,
runs the owning package's tests against each mutant, and writes a snapshot per
namespace to `.metrics/mutate/`.

A mutant is killed when the tests fail or time out, and survives when they
pass. A site on a line the coverage report does not hit is uncovered and is
not run. The score is killed / (killed + survived).

## Run

Build once with `npm run build --workspace=packages/mutator` (or
`npm run build:packages`), then from the repository root:

```bash
npm run mutate -- packages/kernel/src/graph.ts        # one file, or a directory
npm run mutate -- --scan packages/kernel/src          # list sites, run nothing
npm run mutate -- --changed                           # files in git status
npm run mutate -- --base origin/main packages/kernel  # functions changed since the merge-base
npm run mutate -- --mutate-all packages/kernel/src    # rerun killed mutants too
npm run mutate -- --no-coverage packages/auth/src     # run uncovered sites too
npm run test:mutation --workspace=packages/kernel     # the package's configured run
```

`npm run mutate -- --help` lists every option. The first run of a tree
executes every covered mutant, so start with the file you are working on.

Exit codes: `0` when every executed mutant was killed, `1` for a usage error,
`2` when the baseline tests fail (the snapshot is not rewritten), and `3` when
a mutant survives.

## Mutations

The Java set from mutate4java, spelled in TypeScript, plus the TypeScript
additions:

| Category | Mutation |
| --- | --- |
| Arithmetic | `+` ↔ `-`, `*` ↔ `/` |
| Comparison | `<` ↔ `<=`, `>` ↔ `>=` |
| Equality | `==` ↔ `!=`, `===` ↔ `!==` |
| Logical | `&&` ↔ `\|\|`, `??` → `\|\|` |
| Unary | delete `!`, delete unary `-` |
| Constant | `true` ↔ `false`, `0` ↔ `1` |
| Optional | `a?.b` → `a.b`, `a?.()` → `a()`, `a?.[i]` → `a[i]` |

Only expressions are visited, so strings, comments, templates, type
annotations, interfaces, and type aliases are never mutated. A replacement
that does not compile fails the test run and counts as killed.

## Functions and snapshots

Each site belongs to the tightest named function around it: a function
declaration, a class method, accessor or constructor, an object-literal
method, or an arrow or function expression bound to a variable, property, or
class field. Anonymous callbacks belong to the enclosing function. A site at
module top level belongs to no function and is skipped.

The namespace is the dotted module path relative to the root
(`packages.kernel.src.graph`), or `module.Class` for class members. A form id
is `defn/<name>`, or `defn-/<name>` for a `private` or `#` member.

Snapshots use mutator's keys, written as JSON instead of EDN:

```json
{
  "version": 1,
  "tested-at": "2026-10-10T15:20:44.086Z",
  "source": "packages/security/src/master-key.ts",
  "namespace": "packages.security.src.master-key",
  "outcomes": {
    "[\"packages/security/src/master-key.ts\",\"packages.security.src.master-key\",\"defn/getMasterKey\",4423,4426,\"!==\",\"===\"]": "killed"
  },
  "forms": [
    { "id": "defn/getMasterKey", "kind": "defn", "file": "packages/security/src/master-key.ts",
      "line": 122, "end-line": 141, "hash": "3d417ddc…", "killed": 4, "survived": 0, "uncovered": 0, "sites": 4 }
  ]
}
```

An outcome key is `[file, namespace, form, start, end, original, mutant]`,
with UTF-16 offsets. `hash` is a SHA-256 of the function's lines with trailing
whitespace removed.

Once a snapshot exists, the next run is differential. It reruns survivors and
every site in a function whose hash changed. Killed mutants in an unchanged
function stay killed. `--base <ref>` instead mutates only the functions whose
text differs from the merge-base with `<ref>`, which is what the pull request
workflow uses. `node scripts/mutation-score.mjs` summarizes the snapshots per
package, and `--survivors` lists each surviving mutant with its line.

## Tests and coverage

The baseline command has to pass before any mutant runs. A mutant's timeout
is ten times the baseline duration, and at least two seconds
(`--timeout-factor` changes the multiple). The command runs in the directory
of the nearest `package.json`. `--test-command` replaces it, with `{file}`
expanding to the mutated file relative to that directory.

| Package | Default test command | Default coverage |
| --- | --- | --- |
| Uses Vitest | `npx --no-install vitest related --run --passWithNoTests {file}` | a V8 coverage run of the package suite |
| Has a `coverage` script | `npm test` | `npm run coverage`, read from `coverage/` |
| Other | `npm test` | none, so every site is uncovered |

`--use-existing-coverage` reads `coverage/coverage-final.json` or
`coverage/lcov.info` in the package. `--coverage-command` runs a command and
reads the same directory. A file the report does not mention is uncovered,
and the run says so.

## Workers

Mutants of one file run at the same time, one worker per core unless
`--max-workers` sets a lower cap. Files are taken one at a time. Each worker
is a directory under `target/mutation-workers`. Every directory on the way to
the owning package is real and its siblings are symlinks into the project.
The package itself is a private copy, with `node_modules`, `dist`, and other
build output linked. The project tree is never written. Overlays are removed
at the end of the run, and an interrupted run's overlays are removed at the
start of the next.

## Differences from unclebob/mutator

- TypeScript and JavaScript only, parsed with the TypeScript compiler API
  instead of tree-sitter. Function and namespace names come from this
  package, not from crapper.
- Snapshots are JSON (`.metrics/mutate/<namespace>.json`), not EDN.
- A worker copies the whole owning package rather than the mutated file and
  its relative importers. Node and Vite resolve a relative import from a
  module's real path, and copying the package keeps every one of them inside
  the copy without an import scanner.
- A Vitest package runs `vitest related` for the mutated file instead of
  `npm test`. A full suite per mutant is too slow for this repository.
- Added `--base <ref>`, `--exclude <text>`, and `--metrics-dir <path>`. A run
  with a different test oracle, like the crash fuzzer's, needs its own
  snapshot directory.
- No in-place mutation, so there is no `target/mutator-backup/` to restore.
