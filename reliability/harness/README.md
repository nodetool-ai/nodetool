# @nodetool-ai/reliability-harness

Core of NodeTool's reliability harness: journey manifests, the `RunRecord`
format, output normalization, and per-channel stream diffing.

A journey replays a scripted workload against a driver and records everything
it emitted as a `RunRecord`. Normalization strips the parts that legitimately
change between runs (ids, timestamps, durations) so two records compare on
behavior alone; the diff is per channel, so a change in log output does not
mask a change in results.

## Layout

| Path | Holds |
|---|---|
| `core/journey.ts` | Journey manifest schema and loading |
| `core/record.ts` | `RunRecord` — what one replay captured |
| `core/normalize.ts` | Run-to-run variance stripped before comparison |
| `core/diff.ts` | Per-channel stream diff |
| `core/golden.ts` | Golden-record read/write |
| `core/invariants/` | Assertions that must hold across every journey |
| `drivers/` | What a journey drives |
| `faults/` | Fault injection |

## Usage

```bash
npm install @nodetool-ai/reliability-harness
```

The package also ships a CLI entry (`cli.ts`) used by the repo's Ring 0
reliability journeys, which `nodetool harness gate` selects for diffs touching
`packages/kernel/`.

