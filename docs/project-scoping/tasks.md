# Project scoping tasks

Companion: [PRD](prd.md). All tasks are pending. Task IDs identify dependencies,
not separate agent assignments.

## Delivery order

| Phase | Tasks | Outcome |
| --- | --- | --- |
| A1 | T1–T3 | Complete ownership, Personal migration, and operations bound to their originating project. |
| A2 | T4–T7 | Project selection, isolated sessions, scoped resource surfaces, and multiple chats. |
| A3 | T8–T10 | Independent copying, archive and deletion, and release verification. |

## T1 — Inventory ownership and resource entry points

- [ ] Enumerate document types, workflows, assets and folders, entities,
      workspace files, threads, runs, and outputs. Record storage, ownership,
      references, creation paths, list/search paths, and deletion behavior.
- [ ] Cover web, Electron renderer, API, agent tools, background jobs, and
      existing mobile consumers of affected contracts.
- [ ] Classify each resource as project-owned or explicitly global using D3
      and D5. Identify gaps beyond the existing project summary union.
- [ ] Resolve legacy cross-project references and dependency-copy coverage
      (Q10, Q11), and identify existing move behavior needing constraints (Q13).

Depends on: none.

Acceptance: a concrete file and entry-point inventory supports AC11. Every
project-owned type has a planned owner, migration path, and resource boundary.

## T2 — Complete project ownership and Personal migration

- [ ] Add missing ownership fields and protocol contracts for the T1 inventory.
      Keep backend schemas and supported database variants consistent.
- [ ] Create or resolve one permanent Personal space per resource owner.
- [ ] Implement an idempotent, restartable migration of unassigned resources.
      Preserve existing assignments, IDs, content, and references.
- [ ] Preserve access to existing tabs and threads after migration. Handle
      malformed or dangling legacy membership explicitly without silently
      moving valid assigned resources.
- [ ] Add scoped model operations and project ownership validation. Preserve
      compatibility of existing resource operations during rollout.

Depends on: T1.

Acceptance: AC8 and ownership portions of AC4/AC11. Verify empty accounts,
mixed assigned/unassigned content, repeat startup, and interrupted migration.

## T3 — Bind creation and execution to the originating project

- [ ] Carry project identity through document creation, imports, uploads,
      generation requests, runs, and agent sessions.
- [ ] Capture scope when work starts. Persist enough context for delayed
      completions and retries to use the original project.
- [ ] Scope agent resource operations through backend contracts rather than
      relying on prompts or the foreground tab.
- [ ] Apply project file ownership through the workspace interface on local
      and virtual storage. Keep global prerequisites outside project storage.
- [ ] Expose project-attributed activity for the selector and navigation back
      to running work.

Depends on: T2.

Acceptance: AC4, AC5, and AC11. Start work in A, switch to B before completion,
and verify writes and resource reads still belong to A.

## T4 — Persist separate project sessions

- [ ] Store each project's open tabs, order, active document, and selected
      chat independently from its full resource list.
- [ ] Switch sessions without discarding drafts or reopening every document.
- [ ] Define first-open overview, empty-tab state, restart restoration, and
      Personal fallback.
- [ ] Reconcile deleted or unavailable documents without changing another
      project's saved session. Migrate existing persisted tab state.
- [ ] Make rapid switches and failed loads leave one consistent active scope.

Depends on: T2.

Acceptance: AC1, AC2, and session portions of AC10. Verify switching with dirty
editors and restart with multiple saved project sessions.

## T5 — Put project selection above the tabs

- [ ] Replace the tab-group scope control with a persistent top-level selector.
      Add project search, creation, management access, and Personal.
- [ ] Render only the selected project's tabs and project navigation.
- [ ] Show activity from T3 and link it to the owning project's work.
- [ ] Resolve direct document links to their owning project before opening.
- [ ] Cover loading, failure, empty project, keyboard navigation, narrow
      layouts, and Electron window controls using existing UI primitives.

Depends on: T3, T4.

Acceptance: D1, AC2, AC5, and AC10. Project identity remains visible and agrees
with the tabs and content during every navigation transition.

## T6 — Scope resource browsing and selection

- [ ] Apply project scope to every T1 list, search, folder browser, asset
      picker, entity picker, mention source, and project overview resource type.
- [ ] Include project identity in query/cache and selection state where
      required. Clear or restore panel state when switching projects.
- [ ] Keep explicitly global resources available with clear scope.
- [ ] Ensure entity membership and its backing/reference assets follow the
      agreed ownership and migration rules.

Depends on: T2, T3, T5.

Acceptance: AC3 and AC11. Fixtures with identically named resources in A and B
prove that browsing, selection, and mentions resolve the intended resource.

## T7 — Support multiple chat threads per project

- [ ] Replace the single-thread assumption with project-owned thread listing,
      creation, selection, and history loading.
- [ ] Preserve existing project conversations through migration.
- [ ] Supply project context to new threads without merging thread histories.
- [ ] Restore the selected chat through T4 and retain the thread's project
      identity through background agent turns.

Depends on: T3, T4, T5.

Acceptance: AC6 and chat portions of AC1/AC5. Two threads in A and one in B
retain their histories, selected state, and correct resource access.

## T8 — Copy documents with independent dependencies

- [ ] Implement destination selection and dependency discovery from the T1
      reference inventory. Resolve Q11 and Q13 before finalizing behavior.
- [ ] Copy required assets and entities, assign destination ownership, and
      remap references. Handle repeated references and cycles without
      duplicating the same dependency within one operation.
- [ ] Preserve independent lifetimes even if immutable storage bytes are
      internally deduplicated. Source deletion must not remove copied media.
- [ ] Define failure and retry behavior so incomplete copies are not presented
      as successful. Report unavailable or unsupported dependencies clearly.
- [ ] Verify dependency traversal on a large resource graph.

Depends on: T3, T6.

Acceptance: AC7. Edit destination copies and delete the source project, then
open and use the destination document with its assets and entities intact.

## T9 — Archive and delete projects

- [ ] Add archive and restore actions plus archived-project discovery.
- [ ] Add confirmation naming the project and explaining content deletion.
- [ ] Replace the existing return-to-unassigned deletion behavior with the
      agreed content deletion behavior for the complete T1 inventory.
- [ ] Protect Personal from deletion through both UI and backend operations.
- [ ] Resolve Q12 and prevent active jobs, delayed responses, and retries from
      writing into a deleted project.
- [ ] Reconcile selected project, sessions, and caches after deletion. Preserve
      independent copies and global resources.

Depends on: T5, T7, T8.

Acceptance: AC9 and deletion portion of AC7. Include deletion with active work,
repeated deletion requests, and attempts to delete Personal.

## T10 — Verify the complete project experience

- [ ] Map every PRD acceptance criterion to a deterministic check or an
      explicit UI walkthrough. Extend the existing relevant verification
      surfaces and registry where needed.
- [ ] Run the A/B scenario: restore A's tabs and chat, start work in A, switch
      to B and upload, return to A, and verify session and output ownership.
- [ ] Verify migration, dependency copying followed by source deletion,
      archive/restore, direct links, rapid switching, and failed requests.
- [ ] Check the final resource inventory for omitted types and entry points.
- [ ] Perform web and Electron UI checks, including keyboard operation and
      narrow layouts. Verify affected mobile contracts retain ownership
      behavior without expanding this into a mobile navigation redesign.

Depends on: T6, T7, T8, T9.

Acceptance: AC1–AC11 have recorded evidence. Unresolved implementation
questions are closed or explicitly returned for product decision before release.

## Verification for implementation changes

After each code change, run the repository's required checks:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

Use meaningful regression fixtures for the boundaries each task changes.
Prove any new validator can fail with a deliberately invalid fixture, and
verify inventories contain actual entries. Follow the repository's additional
requirements when a change crosses a dependency seam its affected-test
selection cannot detect.
