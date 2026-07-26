# Applications as the Only Mini-App Resource

Status: draft, 2026-07-26. Scope: retire `workflows.app_doc` as a storage
location and make the `applications` table (added 2026-07-25, PR #4479) the
single place a mini app lives. The shared `ApplicationDocument` type
(`packages/app-runtime/src/document.ts`) stays exactly as it is — only the row
it is stored in changes.

## Why

A mini app is not a workflow. The document schema already says so:
`ApplicationDocument.operations` is a list where every operation carries its
own `workflowId`, so one app can bind several workflows (or the same workflow
twice with different mappings). Storing the document on `workflow.app_doc`
collapses that into 1:1, gives the app no identity, no version history, no
publish/release cycle, no budget, and no telemetry — all of which exist on the
`applications` table and none of which make sense on a workflow row.

Keeping both paths has a live failure mode: `CreateApplicationFromWorkflowButton`
copies an `app_doc` into an application row and the two silently fork. Nothing
syncs them and nothing marks either as canonical.

## Current state

Two storage paths over one document type:

- **`workflow.app_doc`** — reached by the web builder route
  (`/app-builder/:workflowId`), the `/miniapp/:workflowId` runtime and the
  workspace View tab, mobile (read-only), the CLI `nodetool app debug`, the
  REST workflow API, the ~40 shipped templates
  (`scripts/generate-template-apps.mjs`), the app-preview/marketing pipeline,
  and the agent `ui_app_*` tools. The `hostWorkflowId` option on
  `parseApplicationDocument` exists solely to serve this storage.
- **`applications` + `application_versions`** — web + tRPC only
  (`packages/websocket/src/trpc/routers/applications.ts`): sidebar Apps panel,
  workspace `application` tab, Design/Run/Settings surface, publish with
  pinned `workflow_graphs`, budgets, invocation metering in
  `unified-websocket-runner.ts`.

## Target state

- The `applications` table is the only persisted home for an
  `ApplicationDocument`. `workflow.app_doc` is accepted on import as a legacy
  field, lifted into an application row, and never written again.
- The workspace View tab / `/miniapp` free preview survives, but as a **derived,
  unpersisted** rendering: the doc is generated in memory per render, exactly
  as `mobile/src/components/app_runtime/generateAppDoc.ts` already does.
  Saving from that surface creates an application.
- Templates ship application documents; installing an example creates both the
  workflow and an application row bound to it.
- CLI, mobile, REST, and the agent tools address apps by application id.

## Tasks

Each task is scoped for one subagent: it names its files, has a checkable
outcome, and states its dependencies. Tasks in the same phase are independent
and can run in parallel. Every task ends with `npm run check` green and, where
it touches a package with tests, tests for the new behavior.

### Phase 0 — decisions locked in this doc

No agent work; recorded so tasks below don't re-litigate them.

- The free "view any workflow as an app" on-ramp **stays**, as pure derivation
  (never persisted). Rationale: it is the cheapest path from graph to app and
  mobile already proves the in-memory approach works.
- `workflow.app_doc` is **deprecated, not dropped**, until Phase 4. Reads keep
  working for import/lift; writes stop in Phase 2.
- Application id becomes the public identity for app surfaces. Workflow-scoped
  app URLs (`/miniapp/:workflowId`) keep working for the ephemeral preview.

### Phase 1 — foundations (parallel)

**T1. Lift-on-read helper in app-runtime**
Add `liftLegacyAppDoc(workflow) → ApplicationDocument | null` to
`packages/app-runtime`: wraps `parseApplicationDocument` with
`hostWorkflowId`, returns a document ready to insert as an application row.
Single implementation both the server import path and the CLI reuse.
Files: `packages/app-runtime/src/document.ts` (+ tests in `__tests__/`).
Done when: unit tests cover schemaVersion-3 docs, legacy `{version,data}`
docs, and empty-`workflowId` operations getting the host id.

**T2. Server: applications REST surface**
The applications router is tRPC-only. Add REST routes mirroring the tRPC
procedures that external clients need: list, get, create (incl.
`fromWorkflowId`), update, delete, releasedDocument. Reuse the router's
handlers; do not duplicate logic.
Files: `packages/websocket/src/http-api.ts`,
`packages/protocol/src/api-schemas/applications.ts` (already has the Zod
contract), tests in `packages/websocket/src/__tests__/`.
Done when: REST and tRPC return identical shapes for the same app.

**T3. Server: lift `app_doc` on workflow import/example-install**
When a workflow is created from an example or imported (REST
`http-api.ts` create/import paths, tRPC `workflows.ts` example path that
currently copies `app_doc`), also create an application row via T1's helper
and stop copying the raw field onto the new workflow. Existing workflows are
untouched.
Depends on: T1. Files: `packages/websocket/src/http-api.ts`,
`packages/websocket/src/trpc/routers/workflows.ts`, tests.
Done when: installing an example yields a workflow with empty `app_doc` and
one application row whose `main` operation binds that workflow.

**T4. Docs: rewrite the mini-apps pages**
`docs/mini-apps.md` still says the document "lives on `workflow.app_doc`" and
never mentions the applications table. Rewrite `docs/mini-apps.md`,
`docs/mini-apps-guide.md`, `docs/mini-apps-reference.md`, and the stale parts
of `docs/app-builder.md` around the target state: applications are the
resource, `app_doc` is a legacy import field, the View tab is a derived
preview. Follow `docs/WRITING_STYLE.md`.
Done when: no doc presents `app_doc` as where apps live.

### Phase 2 — stop writing `app_doc` (parallel, after Phase 1)

**T5. Web: builder saves to applications only**
`AppBuilderPage.tsx` (route `/app-builder/:workflowId`) writes
`workflow.app_doc` via `saveWorkflow`. Change the flow: opening the builder
for a workflow that has no application creates one (via
`applications.create({ fromWorkflowId })`), then edits go through
`applications.update` like `ApplicationAppBuilder.tsx` already does. Retire
the duplicate container or reduce `AppBuilderPage` to a redirect into the
application surface.
Depends on: T3 (so template installs already have rows).
Files: `web/src/components/appbuilder/AppBuilderPage.tsx`,
`persistence.ts`, `WorkflowManagerStore.ts` (drop `app_doc` from save
payloads), `web/src/index.tsx` routes, Jest tests.
Done when: no web code path writes `app_doc`.

**T6. Web: View tab / `/miniapp` becomes ephemeral**
`WorkflowAppView.tsx` generates an `app_doc` when absent **and saves it**.
Keep the generation, drop the save — hold the generated document in memory
(mirror mobile's `generateAppDoc.ts` contract). Add a "Save as app" action
that creates an application row.
Files: `web/src/components/appbuilder/WorkflowAppView.tsx`,
`generateAppDoc.ts`, tests.
Done when: viewing a bare workflow never mutates it.

**T7. Agent tools: key `ui_app_*` by application id**
The Puck agent bridge keys editors by workflow id because workflow id is
currently the app identity. Move the tool contract to application id, with a
workflow-id fallback that resolves (or creates) the backing application.
Files: `web/src/lib/tools/builtin/puck.ts`,
`web/src/components/appbuilder/puck/puckAgentBridge.ts`,
`puck/PuckAgentBinder.tsx`, `web/src/lib/chat/uiContext.ts`; update the
`app-tools` eval suite in `packages/agents/src/evals/`.
Done when: `nodetool eval app-tools` passes against the new contract.

**T8. Templates: generate application documents**
`scripts/generate-template-apps.mjs` writes `example.app_doc` into every
example JSON and preview bundle. Keep the output document shape but move it to
a sibling field/file consumed by T3's install path (e.g. `example.app` or a
manifest entry), and regenerate `web/public/app-preview/*.json`. Update
`marketing/scripts/generate-miniapp-entries.mjs` and
`web/src/app_preview/AppPreviewApp.tsx` to read the new location.
Depends on: T3. Done when: `node scripts/generate-template-apps.mjs` and
`npm run gen:apps` (marketing) both run clean and previews render.

### Phase 3 — port the read-only surfaces (parallel, after Phase 2)

**T9. CLI: `nodetool app debug` accepts an application id**
Today the harness loads "the `app_doc` on a workflow". Accept an application
id (resolve via models layer, no server needed) or a JSON file carrying an
`ApplicationDocument`; keep workflow-id input as a legacy path that lifts via
T1. Multi-operation apps already work in the harness — this is a loader
change, not an engine change.
Files: `packages/cli/src/commands/app.ts`,
`packages/cli/src/app-debug/app-spec.ts`, `debug/target.ts`, Vitest tests.
Done when: `app debug <application_id>` produces the same report an
`app_doc` run did, and `--json` reports the application id.

**T10. Mobile: read applications**
Mobile parses `workflow.app_doc` read-only. Point it at the applications API
(REST from T2 — mobile has no tRPC client), keeping the in-memory
`generateAppDoc` fallback for bare workflows. Respect
`mobile/ARCHITECTURE.md` § Documents.
Depends on: T2. Files: `mobile/src/components/app_runtime/WorkflowAppView.tsx`
and its data hooks, Jest tests.
Done when: an app published on the server renders on mobile without the
workflow carrying any `app_doc`.

**T11. One-time lift migration for user data**
A models-layer migration (`packages/models/src/migrations/versions.ts`) that
walks workflows with a non-null `app_doc`, creates an application row per doc
via T1's helper (skipping workflows already imported through
`fromWorkflowId` — dedupe on a marker or document equality), and nulls the
column value. Reversible in the sense that the doc is preserved verbatim in
the new row.
Depends on: T1, and must land only after Phase 2 (no writers left).
Done when: migration test proves a seeded `app_doc` workflow ends up with an
equivalent application and an empty `app_doc`.

### Phase 4 — remove the field

**T12. Drop `app_doc` from schema and API**
Remove the column (SQLite + PG schemas, raw DDL in `db.ts`), the Zod/API
fields (`packages/protocol`), the `hostWorkflowId` lift paths that are no
longer reachable, `web` persistence helpers, and the screenshot-server read.
Grep-clean: `rg app_doc` returns only migration history and this plan.
Depends on: everything above shipped and the migration (T11) released at
least one version earlier, so old clients have upgraded.

## Sequencing summary

```
Phase 1: T1  T2  T3(←T1)  T4        — parallel
Phase 2: T5(←T3)  T6  T7  T8(←T3)   — parallel
Phase 3: T9(←T1)  T10(←T2)  T11(←T1, after Phase 2)
Phase 4: T12 (one release after T11)
```

## Risks

- **Fork already in the wild**: users who used `create({ fromWorkflowId })`
  have divergent copies. T11's dedupe must not clobber the (newer) application
  row with the (stale) `app_doc`; when both exist, the application wins and
  the `app_doc` is archived into a new draft version, not merged.
- **Old mobile/CLI clients** read `app_doc` from the API. T12 waits a release
  after T11 for this reason; T2/T9/T10 must ship first.
- **Preview bundles** (`web/public/app-preview/*.json`) are consumed by the
  marketing screenshot pipeline; T8 must regenerate both sides in the same PR
  or `/apps/*` pages break silently.
