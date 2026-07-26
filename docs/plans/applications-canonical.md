# Applications as the Only Mini-App Resource

Status: draft v2, 2026-07-26. Scope: retire `workflows.app_doc`, make the
`applications` table (added 2026-07-25, PR #4479) the single place a mini app
lives, and keep apps and workflows **orthogonal** in the UI: apps get their own
sidebar panel and their own tabs, and a workflow bound to an app opens only
when the user asks for it from the app surface. A new bundle format ships an
app together with its workflows, and the shipped examples become a curated set
of app bundles instead of one generated form per template.

v2 supersedes the v1 draft: the "view any workflow as an app" on-ramp is
dropped, and the plan gains the bundle format and the examples overhaul.

## Why

A mini app is not a workflow. The document schema already says so:
`ApplicationDocument.operations` is a list where every operation carries its
own `workflowId`, so one app can bind several workflows (or the same workflow
twice with different mappings). Storing the document on `workflow.app_doc`
collapses that into 1:1, gives the app no identity, no version history, no
publish/release cycle, no budget, and no telemetry — all of which exist on the
`applications` table and none of which make sense on a workflow row.

The UI inherited the same conflation: the app builder is routed by workflow id
(`/app-builder/:workflowId`), the workspace View tab toggles a workflow into an
app, and viewing a bare workflow silently writes a generated `app_doc` onto it.
Users never chose to have an app; every workflow grew one. The result is ~40
shipped templates whose apps are copies of the same form, and a live fork bug:
`CreateApplicationFromWorkflowButton` copies an `app_doc` into an application
row and nothing syncs or marks either copy as canonical afterward.

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

- **Storage**: the `applications` table is the only persisted home for an
  `ApplicationDocument`. `workflow.app_doc` is accepted on import as a legacy
  field, lifted into an application row, and never written again.
- **UI orthogonality**: no workflow/app switch anywhere. The Apps sidebar
  panel is where apps are listed and opened — one workspace tab per app. A
  workflow never presents itself as an app, and an app tab never morphs into a
  workflow editor. The workflows an app binds are loaded in the background
  (graphs prefetched for the app's operations) and surface only through a
  **Linked workflows** menu on the app surface; clicking one opens a normal
  workflow tab.
- **Creation is explicit**: an app exists because a user (or an example
  install) created one — "New app" in the Apps panel, or "Create app from
  workflow" as a one-way scaffold. No auto-generated per-workflow app.
- **Portability**: an `ApplicationBundle` JSON format serializes an app
  together with the full graphs of every workflow it binds, so apps ship,
  export, and import as one artifact.
- **Examples**: shipped example apps are curated bundles — each one a real
  use case carrying one or more workflows. Workflow templates without a good
  app use case ship no app at all.

## The ApplicationBundle format

One JSON document (zippable for assets), defined in `packages/app-runtime`:

```jsonc
{
  "schemaVersion": 1,
  "app": { /* ApplicationDocument — operations reference workflows[].key */ },
  "workflows": [
    { "key": "draft", "name": "...", "graph": { "nodes": [], "edges": [] } }
  ]
}
```

- Inside a bundle, `OperationBinding.workflowId` holds a bundle-local `key`;
  import creates real workflows and rewrites keys to the new ids (the same
  indirection `.nodetool` bundles use for `bundle://` asset refs).
- Asset-carrying bundles reuse the existing `.nodetool` zip machinery: the
  bundle JSON rides alongside the asset entries, refs stay `bundle://`.
- Export pins what `application_versions.workflow_graphs` pins today — a
  released app exports reproducibly.

## Tasks

Each task is scoped for one subagent: it names its files, has a checkable
outcome, and states its dependencies. Tasks in the same phase are independent
and can run in parallel. Every task ends with `npm run check` green and, where
it touches a package with tests, tests for the new behavior.

### Phase 0 — decisions locked in this doc

No agent work; recorded so tasks below don't re-litigate them.

- Apps and workflows are orthogonal resources with orthogonal UI. There is
  **no** workflow→app view, toggle, or tab. The workspace View tab and the
  auto-generated `app_doc` are removed, not made ephemeral (supersedes v1).
- Application id is the identity on every surface (tabs, routes, agent tools,
  CLI, API). Workflow-scoped app routes (`/app-builder/:workflowId`,
  `/miniapp/:workflowId`) go away; a redirect covers old links where cheap.
- `ApplicationBundle` (above) is the interchange format for examples, export,
  and import. Examples ship as bundles, not as `example.app_doc`.
- `workflow.app_doc` is deprecated on day one, written by nothing after
  Phase 2, and dropped in Phase 5.

### Phase 1 — foundations (parallel)

**T1. Lift-on-read helper in app-runtime**
Add `liftLegacyAppDoc(workflow) → ApplicationDocument | null` to
`packages/app-runtime`: wraps `parseApplicationDocument` with
`hostWorkflowId`, returns a document ready to insert as an application row.
Single implementation shared by the server import path, the migration, and
the CLI.
Files: `packages/app-runtime/src/document.ts` (+ tests in `__tests__/`).
Done when: unit tests cover schemaVersion-3 docs, legacy `{version,data}`
docs, and empty-`workflowId` operations getting the host id.

**T2. Server: applications REST surface**
The applications router is tRPC-only. Add REST routes mirroring the tRPC
procedures external clients need: list, get, create, update, delete,
releasedDocument. Reuse the router's handlers; do not duplicate logic.
Files: `packages/websocket/src/http-api.ts`,
`packages/protocol/src/api-schemas/applications.ts` (Zod contract exists),
tests in `packages/websocket/src/__tests__/`.
Done when: REST and tRPC return identical shapes for the same app.

**T3. ApplicationBundle format**
Implement the schema, parser, serializer, and key-rewriting in
`packages/app-runtime` (new `src/bundle.ts`), with the Zod contract in
`packages/protocol`. Includes `bundleFromApplication(app, graphs)` and
`applyBundle(bundle) → { app, workflows }` (pure — persistence stays in the
server/CLI callers).
Files: `packages/app-runtime/src/bundle.ts` + tests,
`packages/protocol/src/api-schemas/applications.ts`.
Done when: round-trip test — export an app binding two workflows, import it,
operations point at the newly created workflow ids.

**T4. Docs: rewrite the mini-apps pages**
`docs/mini-apps.md` still says the document "lives on `workflow.app_doc`" and
never mentions the applications table. Rewrite `docs/mini-apps.md`,
`docs/mini-apps-guide.md`, `docs/mini-apps-reference.md`, and the stale parts
of `docs/app-builder.md` around the target state: apps are their own
resource, opened from the Apps panel, linked workflows on demand, bundles for
sharing. Follow `docs/WRITING_STYLE.md`.
Done when: no doc presents `app_doc` as where apps live or describes a
workflow/app toggle.

### Phase 2 — UI orthogonality (parallel, after Phase 1)

**T5. Apps panel is the front door**
Make the existing sidebar Apps panel
(`web/src/components/applications/ApplicationListPanel.tsx`) the only entry
point: list, search, "New app", "Create app from workflow" (explicit
scaffold), each app opening one `application` workspace tab
(`WorkspaceTabsStore` already has the tab type). Remove the workflow-keyed
entry points: the `/app-builder/:workflowId` route and container
(`AppBuilderPage.tsx`), the workspace View tab, and `WorkflowAppView.tsx`'s
generate-and-save path. `/miniapp/:workflowId` redirects to the app tab when
a backing application exists, else 404s.
Files: `web/src/components/appbuilder/` (delete/reduce `AppBuilderPage`,
`WorkflowAppView`, `generateAppDoc`, `persistence.ts`),
`web/src/index.tsx` routes, `web/src/stores/WorkflowManagerStore.ts` (drop
`app_doc` from save payloads), `PanelLeft.tsx`, Jest tests.
Done when: no web code path writes `app_doc` and no route keys an app by
workflow id.

**T6. App surface: linked workflows in the background**
On the app tab (`ApplicationSurface.tsx`), prefetch the graphs of every
workflow the document's operations bind (TanStack Query, `enabled` on tab
focus) without opening editor tabs. Add a **Linked workflows** menu listing
them (name, operation(s) using it, released-pin status); clicking opens a
normal workflow tab via the workspace tab store. Broken links (deleted
workflow) render as errors in the menu, not crashes.
Files: `web/src/components/workspace/ApplicationSurface.tsx`, a new
`LinkedWorkflowsMenu` component (ui_primitives only), hooks in
`web/src/hooks/useApplications.ts`, tests.
Done when: opening an app never opens a workflow tab; the menu opens one on
click; graphs are fetched once and cached.

**T7. Agent tools: key `ui_app_*` by application id**
The Puck agent bridge keys editors by workflow id because workflow id is
currently the app identity. Move the tool contract to application id (no
workflow-id fallback — orthogonality applies to agents too; the scaffold
tool covers "make an app for this workflow").
Files: `web/src/lib/tools/builtin/puck.ts`,
`web/src/components/appbuilder/puck/puckAgentBridge.ts`,
`puck/PuckAgentBinder.tsx`, `web/src/lib/chat/uiContext.ts`; update the
`app-tools` eval suite in `packages/agents/src/evals/`.
Done when: `nodetool eval app-tools` passes against the new contract.

### Phase 3 — bundles everywhere (parallel, after Phase 1; T8 also after T2)

**T8. Server + CLI: bundle export/import**
API: `GET /api/applications/:id/export-bundle`,
`POST /api/applications/import-bundle` (creates the app and its workflows,
rewrites keys via T3). CLI: `nodetool apps export-bundle <id> -o my.app.json`
and `nodetool apps import-bundle my.app.json`, direct-DB like the existing
`workflows export-bundle`. Editor command-menu entries mirror the workflow
bundle ones.
Depends on: T2, T3. Files: `packages/websocket/src/http-api.ts`,
`packages/cli/src/commands/` (new `apps.ts`), web command menu, tests.
Done when: export → import on a clean DB reproduces a working app with its
workflows.

**T9. CLI: `nodetool app debug` accepts application id and bundle files**
Today the harness loads "the `app_doc` on a workflow". Accept an application
id (models layer, no server) or an ApplicationBundle JSON file; keep
workflow-id input as a legacy path that lifts via T1. Multi-operation apps
already work in the harness — this is a loader change.
Depends on: T1, T3. Files: `packages/cli/src/commands/app.ts`,
`packages/cli/src/app-debug/app-spec.ts`, `debug/target.ts`, Vitest tests.
Done when: `app debug <application_id>` and `app debug my.app.json` produce
the same report shape an `app_doc` run did.

**T10. Mobile: read applications**
Mobile parses `workflow.app_doc` read-only. Point it at the applications REST
API (T2 — mobile has no tRPC client): list apps, open one per screen per
`mobile/ARCHITECTURE.md` § Documents. Remove the in-memory per-workflow
`generateAppDoc` path along with the concept it served.
Depends on: T2. Files: `mobile/src/components/app_runtime/`, data hooks,
Jest tests.
Done when: an app published on the server renders on mobile without the
workflow carrying any `app_doc`.

### Phase 4 — examples overhaul (after Phase 3)

**T11. Curate the example apps**
Audit the 37 templates (see `docs/plans/examples-revamp.md` for the shape
census) and produce a curation spec: which use cases deserve an app, which
templates stay workflow-only, and what each example app contains. Selection
criteria — user-centric, in priority order: (1) the app is how a real person
would want to use it (a form/dashboard beats opening a node graph), (2) it
exercises something the platform is good at (multi-workflow operations,
streaming, variables), (3) it runs on a fresh install or degrades clearly
without keys. Target ~8–12 apps, several binding more than one workflow
(e.g. generate + refine, transcribe + summarize + translate). Deliverable: a
table in this file's companion `docs/plans/example-apps.md` with per-app
operations, workflows, and widgets.
Done when: the spec is reviewed and merged; no code.

**T12. Build the example app bundles**
Implement the curated apps as ApplicationBundle files shipped with
`packages/base-nodes` (new `examples/apps/` dir). Replace the per-template
generation in `scripts/generate-template-apps.mjs` (curation table +
Output-node augmentation) with a build step that validates each bundle
(`nodetool app debug --no-run`) and emits the preview bundles in
`web/public/app-preview/`. Server exposes example apps for install; install
goes through T8's import path.
Depends on: T8, T11. Files: `scripts/` (replace `generate-template-apps.mjs`),
`packages/base-nodes/nodetool/examples/`, `packages/websocket` example
routes, tests.
Done when: installing an example app creates the app + its workflows; no
example JSON carries `app_doc`.

**T13. Preview + marketing pipeline on bundles**
Point `web/src/app_preview/AppPreviewApp.tsx`,
`web/scripts/screenshot-app-previews.mjs`, and
`marketing/scripts/generate-miniapp-entries.mjs` at the bundle-derived
previews. `/apps/*` pages regenerate from the curated set only — fewer,
better pages.
Depends on: T12. Done when: `npm run gen:apps` runs clean and every `/apps/*`
page corresponds to a shipped example app.

### Phase 5 — data migration and removal

**T14. One-time lift migration for user data**
A models-layer migration (`packages/models/src/migrations/versions.ts`) that
walks workflows with a non-null `app_doc`, creates an application row per doc
via T1's helper, and nulls the value. Where a `fromWorkflowId` import already
created a (possibly newer) application, the application wins and the
`app_doc` is archived as a new draft version, not merged.
Depends on: T1; lands only after Phase 2 (no writers left).
Done when: migration test proves a seeded `app_doc` workflow ends up with an
equivalent application and an empty `app_doc`.

**T15. Drop `app_doc` from schema and API**
Remove the column (SQLite + PG schemas, raw DDL in `db.ts`), the Zod/API
fields (`packages/protocol`), the now-unreachable `hostWorkflowId` lift
paths, and the screenshot-server read. Grep-clean: `rg app_doc` returns only
migration history and this plan.
Depends on: everything above shipped, and T14 released at least one version
earlier so old clients have upgraded.

## Sequencing summary

```
Phase 1: T1  T2  T3  T4                    — parallel
Phase 2: T5  T6  T7                        — parallel, after Phase 1
Phase 3: T8(←T2,T3)  T9(←T1,T3)  T10(←T2)  — parallel
Phase 4: T11 → T12(←T8) → T13
Phase 5: T14(←T1, after Phase 2) → T15 (one release later)
```

## Risks

- **Fork already in the wild**: users who used `create({ fromWorkflowId })`
  have divergent copies; T14's application-wins rule covers it, but the
  archived draft version must be visible in the version history or the user's
  edits look lost.
- **Old mobile/CLI clients** read `app_doc` from the API. T15 waits a release
  after T14 for this reason; T2/T9/T10 must ship first.
- **Removing the View tab regresses a flow** people may use today (instant
  form for any workflow). The mitigation is the explicit scaffold ("Create
  app from workflow") being one click from both the Apps panel and the
  workflow editor — cheap to invoke, but a deliberate act that creates a real
  resource.
- **Example count drops** from ~40 auto-generated apps to ~8–12 curated ones;
  `/apps/*` marketing pages shrink accordingly. That is the point, but
  existing inbound links need redirects (`docs/redirects/`).
