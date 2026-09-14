# Temp Storage Garbage Collection

## Problem

The runtime writes workflow media outputs to the `temp/` storage prefix and never deletes them.

- `ProcessingContext` writes `temp/<uuid>.<ext>` for every `temp_url` output
  (`packages/runtime/src/context.ts`, the `mode === "temp_url"` branch). Workflow
  jobs and chat turns select this mode for every non-text session
  (`packages/websocket/src/session/job-execution.ts`,
  `packages/websocket/src/session/chat-turn.ts`).
- The SDK temporary-asset service writes `temp/sdk-inputs/<id>.<ext>` and
  returns `expires_at: null`
  (`packages/websocket/src/sdk/sdk-temporary-asset-service.ts`).
- No code lists or deletes keys under `temp/`. The retention sweep
  (`cleanupStorage` in `packages/models/src/storage-maintenance.ts`) deletes
  database rows only.

On the `file` backend, `temp/` shares the assets directory
(`~/.local/share/nodetool/assets/temp`). One developer machine measured
3.9 GB in 20,561 files. On S3 and Supabase, `TEMP_BUCKET` has no documented
lifecycle rule (`docs/storage.md`).

## Durable references to temp keys

A temp URL is meant to be short-lived, but some durable rows store it. A
measurement on one local SQLite database found:

| Table | Rows | Distinct temp refs | Refs with an `asset_id` |
|---|---|---|---|
| `storyboards.document` | 3 | 20 | 19 |
| `nodetool_jobs.graph` | 16 | 13 | 1 |
| `nodetool_jobs.metadata_json` | 1 | not measured | not measured |
| `nodetool_workflows.graph` | 0 | 0 | 0 |
| `nodetool_assets` (all columns) | 0 | 0 | 0 |

No asset row points at `temp/`. An asset owns a separate file
(`<assetId>.<ext>`, or `<userId>/<assetId>.<ext>` in the new layout). A temp
ref that carries an `asset_id` can therefore switch to the asset without data
loss.

Storyboards leak temp URLs because `packages/storyboard/src/io/render-shots.ts`
copies `asset.uri` next to `asset_id` into `KeyframeVersion` and
`ClipVersion`. The `asset_id` is the durable locator, so the `uri` is redundant
and expires.

## Decisions

### D1. Sweep by age through the storage adapter

Add `sweepTempStorage` to `packages/storage`. It takes a `StorageAdapter`, a
cutoff time, and a pin predicate. It uses the existing `list("temp/")`,
`stat`, and `delete` methods, so it works on the file, S3, Supabase, and
in-memory backends without backend branches.

```ts
interface TempSweepOptions {
  olderThanMs: number;          // age threshold, measured on StorageEntry.modifiedAt
  now: number;                  // injected for tests
  isPinned: (key: string) => boolean;
  dryRun: boolean;
  maxDeletes?: number;          // bound one pass
}

interface TempSweepResult {
  scanned: number;
  deleted: number;
  pinned: number;
  bytesFreed: number;
  errors: number;
}
```

Rules:

- Consider only keys that start with `temp/`. Refuse any other prefix.
- Delete an entry only when `now - modifiedAt >= olderThanMs` and it is not pinned.
- Continue after a failed delete. Count it in `errors`.
- Delete with bounded concurrency. Log one summary line per pass.

### D2. One global retention window, not a per-user setting

The `temp/` prefix has no owner segment. Keys from all users share it, so a
per-user policy cannot decide a key's lifetime. Use one server-wide value:
`NODETOOL_TEMP_RETENTION_HOURS`, default `168` (7 days), minimum `24`. The
minimum protects running jobs and open editor sessions, which fetch a temp URL
minutes after the write.

Register the variable in `packages/websocket/src/settings-registry.ts` and
document it in `docs/storage.md`.

### D3. Pin temp keys that durable rows still reference

Before a pass, build a set of temp keys from durable rows across all users:

- `storyboards.document`
- `nodetool_workflows.graph` and `nodetool_workflow_versions.graph`
- `nodetool_jobs.graph` and `metadata_json` for jobs that are not terminal

Terminal jobs do not pin. The job retention window (`terminalJobRetentionDays`)
already bounds their lifetime, and a finished run's preview is scratch output.

Extract keys with one pattern, `temp/(sdk-inputs/)?[0-9a-f-]{32,36}\.[a-z0-9]+`,
from the raw column text. Put the scan in `packages/models` next to
`storage-maintenance.ts`, because it reads model tables. Scan in pages. Do
not load all documents into memory at once.

The pin set is a safety net during migration. D4 removes the cause.

### D4. Store the asset locator, not the temp URL

Change `render-shots.ts` to write `uri: \`asset://${assetId}\`` on keyframe and
clip versions. Check other writers that copy a run output `uri` next to an
`asset_id` into a durable document, and fix them the same way.

Add a one-time data migration: in `storyboards.document`, replace a
`/api/storage/temp/...` `uri` with `asset://<asset_id>` when the same object
carries an `asset_id` and that asset row exists. Leave refs without an
`asset_id` unchanged. D3 keeps them pinned.

### D5. Run the sweep with the existing maintenance timer

Call the sweep from the 6-hour `runHistoryCleanup` timer in
`packages/websocket/src/server.ts`, through a new function in
`packages/websocket/src/storage-retention.ts`. The temp adapter comes from
`getTempAdapter()` (`packages/websocket/src/lib/storage.ts`). Run one pass at
startup, like the history cleanup. Log a failure and continue. A sweep error
must not stop the server.

### D6. Give the sweep a headless surface

Add a CLI command, for example `nodetool storage temp-gc [--dry-run]
[--older-than <hours>]`, that prints the `TempSweepResult`. Register a
selfcheck in `packages/cli/src/harness/registry.ts` per
[Harness-First Engineering](HARNESS_FIRST.md). Follow the existing CLI
command layout in `packages/cli/src/`.

### D7. Make the SDK expiry contract true

Set `expires_at` in the SDK temporary-asset upload response to the upload time
plus the retention window. Update the protocol schema if it requires `null`.

## Cloud backends

The adapter sweep (D1) works on S3 and Supabase. Verify that `list` in
`s3-storage-adapter.ts` and `supabase-storage-adapter.ts` follows continuation
tokens. A single unpaginated call returns at most 1,000 keys, and the sweep
then misses everything after that. Also add a bucket lifecycle rule on
`TEMP_BUCKET` that expires objects after 30 days, as a backstop for a stopped
sweep. Document the rule in `docs/storage.md` and
`docs/fly-production-deploy.md`.

## Tests

| Test | Location | Asserts |
|---|---|---|
| Sweep age cutoff | `packages/storage/tests/` | Deletes old keys, keeps new keys, with injected `now`. |
| Sweep prefix guard | `packages/storage/tests/` | Never deletes a key outside `temp/`, even when it is old. |
| Sweep pins and dry run | `packages/storage/tests/` | Pinned keys survive. Dry run deletes nothing and reports the same counts. |
| Sweep pagination | `packages/storage/tests/` | More than 1,000 entries are all scanned (adapter stub). |
| Pin scan | `packages/models/tests/` | Finds keys in a storyboard, a workflow graph, and a running job. Ignores a terminal job. |
| Storyboard migration | `packages/models/tests/` | Rewrites a ref with `asset_id` to `asset://`. Keeps a ref without one. |
| Render writer | `packages/storyboard/tests/` | New keyframe and clip versions carry `asset://<id>`. |

Prove each new test fails against the unfixed code before you keep it.

## Risks

- **R1.** A client holds a temp URL longer than the window, for example a tab
  left open for a week. The preview breaks. The job result is still in history
  only as a dead link. The 7-day default makes this rare.
- **R2.** A durable writer that D3 does not scan stores a temp URL. The sweep
  then deletes a file the row still needs. Mitigation: search for writers
  during D4, and run the first production pass with `--dry-run`, then compare
  the delete list against a full-text search of the database.
- **R3.** A pin scan over large JSON columns is slow on PostgreSQL. Scan in
  pages, and filter with `LIKE '%temp/%'` before the regex.

## Open questions

- **Q1.** Is 7 days the right default window, or is 24 hours enough for the
  hosted service?
- **Q2.** Should refs without an `asset_id` (1 storyboard ref and 12 job refs on
  the measured machine) stay pinned forever, or expire after a longer window?

## Implementation Prompt

Give this section to the implementing agent. It builds on the decisions above.

### Tasks

Do the tasks in this order. Each task must leave the tree green.

1. Read `AGENTS.md`, `packages/AGENTS.md`, and the storage, models, websocket,
   and cli package overlays that apply.
2. Reproduce the leak. Write a failing test in `packages/storyboard/tests/` that
   renders a keyframe through `render-shots.ts` and asserts the stored `uri`
   is `asset://<assetId>`. Then fix the writer (D4). Search for other writers
   that copy a run output `uri` next to an `asset_id` into a durable document,
   and fix them the same way.
3. Add `sweepTempStorage` to `packages/storage` (D1). Use only the
   `StorageAdapter` interface. Refuse keys outside `temp/`. Inject `now`.
   Write the storage tests from the Tests table first.
4. Verify that `list` in the S3 and Supabase adapters follows continuation
   tokens. If it does not, write a failing test, then fix the pagination.
5. Add the pin scan to `packages/models` (D3). Scan across all users, page
   through rows, and pin only non-terminal jobs. Add its tests.
6. Add the one-time storyboard migration (D4) through the existing migration
   mechanism in `packages/models`. Rewrite a temp `uri` to `asset://<asset_id>`
   only when the asset row exists.
7. Add `NODETOOL_TEMP_RETENTION_HOURS` (default 168, minimum 24) to
   `packages/websocket/src/settings-registry.ts` (D2). Wire one sweep pass into
   the startup call and the 6-hour `runHistoryCleanup` timer in
   `packages/websocket/src/server.ts`, through
   `packages/websocket/src/storage-retention.ts` (D5). A sweep failure logs a
   warning and never stops the server.
8. Add the CLI command with `--dry-run` and `--older-than <hours>`, and
   register its selfcheck in `packages/cli/src/harness/registry.ts` (D6).
9. Set `expires_at` in the SDK temporary-asset upload response (D7).
10. Update `docs/storage.md` with the retention variable, the sweep, and the
    recommended `TEMP_BUCKET` lifecycle rule. Update
    `docs/fly-production-deploy.md` if it lists bucket configuration.

### Constraints

- Deliver only this scope. Do not refactor the storage adapters or the
  retention settings UI.
- Do not add a per-user temp retention setting. The `temp/` prefix has no owner
  segment (D2).
- Do not branch on the storage backend inside the sweep.
- Prove each new test fails against the unfixed code, then restore the fix.
  Use `git checkout <base> -- <files>` for the red proof, not `git stash`.
- Do not run the sweep against a real user data directory. Use temp
  directories and `InMemoryStorageAdapter` in tests.
- Do not add a co-author line to commits.

### Verification

Run all four checks from the repository root. All must pass:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

Then run the new CLI command with `--dry-run` against a scratch storage
directory that holds old files, new files, and one file a test storyboard
references. Report the printed counts.

### Report

In the final response, state:

1. The files changed, grouped by task.
2. The red-proof evidence for each new test.
3. The output of the four checks.
4. The dry-run output.
5. Any other durable writer of temp URLs you found, and the fix you applied.
6. Your answers or evidence for open questions Q1 and Q2.
