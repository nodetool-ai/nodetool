# Project scoping release verification

This record maps each release acceptance criterion to the regression check
that exercises its boundary. Run the named test files with `npm run
test:affected`; the repository gate selects the affected workspaces and their
dependent apps.

| Acceptance criterion | Deterministic evidence | UI walkthrough evidence |
| --- | --- | --- |
| AC1: A → B → A restores the session | `web/src/stores/__tests__/WorkspaceTabsStore.test.ts` restores independent tab orders and selected chats. | Switch Aurora → Beacon → Aurora with a dirty script. Confirm Aurora's tab order, active document, draft, and selected chat return, with no Beacon tab visible. |
| AC2: first open and empty state | `WorkspaceTabsStore.test.ts` covers first overview creation and closing the last tab while retaining project scope. | Create a project, confirm its overview opens, close every tab, and confirm the selector still names it. |
| AC3: scoped browsing | `packages/websocket/tests/trpc-assets.test.ts`, `packages/agents/tests/project-scope.test.ts`, and `web/src/components/workspace/__tests__/OpenMenuProjects.test.tsx` cover scoped assets, agent defaults, and project-aware opening. | Give A and B identically named assets and entities. Check search, picker, mention, and agent resource results in each scope. |
| AC4: scoped creation | `packages/agents/tests/project-scope.test.ts`, `packages/websocket/tests/trpc-workspace.test.ts`, and `packages/websocket/tests/chat-project-spend.test.ts` cover agent, workspace, and chat project attribution. | Create from the UI and API in A. Attempt creation against an unavailable project and confirm it fails. |
| AC5: switching while work runs | `WorkspaceTabsStore.test.ts` runs the A/B round trip with A's selected chat/output and B's upload; `packages/websocket/tests/chat-project-spend.test.ts` attributes an asynchronous A chat turn; `packages/models/tests/project.test.ts` keeps A's completed output separate from B's upload and rejects delayed writes after deletion. | Start A's generation and chat, switch to B, upload an asset, return to A, and confirm A owns its outputs while B owns the upload. Use each activity link to return to its project. |
| AC6: independent chats | `packages/websocket/tests/trpc-projects.test.ts` and `WorkspaceTabsStore.test.ts` cover project thread creation and selected-chat restoration. | Create two A threads and one B thread. Switch between projects and reopen each thread without cross-project history or resource results. |
| AC7: independent copy | `packages/websocket/tests/project-document-copy.test.ts` covers duplicate references, remapping, cycles, source deletion, missing dependencies, and large graphs. | Copy a document from A to B, edit the B copy, delete A, then open B and confirm its assets and entities still resolve. |
| AC8: Personal migration | `packages/models/tests/project.test.ts` covers mixed ownership, dangling legacy rows, and repeatable migration. | Upgrade an account with assigned and unassigned content. Restart twice and confirm one Personal project, preserved assignments, and preserved content. |
| AC9: archive and deletion | `packages/websocket/tests/trpc-projects.test.ts` and `packages/models/tests/project.test.ts` cover archive/restore, idempotent deletion, Personal protection, owned-resource removal, and write tombstones. | Archive a project, find it in management, restore it, then confirm deletion after its named confirmation leaves an independent B copy intact. |
| AC10: interrupted navigation and restart | `web/src/hooks/__tests__/useProjects.test.tsx` rejects stale and failed project loads; `WorkspaceTabsStore.test.ts` covers persisted-session migration and unavailable documents. | Rapidly select A then B, open a direct A document link, and restart. Confirm selector, tabs, and resource scope agree after each transition. |
| AC11: inventory completeness | `docs/project-resource-inventory.md` records resource ownership and entry points. `packages/models/tests/project.test.ts` deletes the owned document, asset, workflow, thread, job, workspace, and prediction inventory. | Repeat the A/B resource scan in web and Electron. On mobile, use existing document backends with distinct project ids and confirm requests retain their supplied ownership. |

## UI release pass

Run the walkthroughs above in both web and Electron. At a narrow viewport,
open the selector with Enter, filter with the keyboard, select with Enter, and
confirm the selected project remains visible above the tab bar. The deterministic
keyboard check is `web/src/components/projects/__tests__/ProjectSelector.test.tsx`.

## Resolved implementation questions

- Q10 is returned for product decision: legacy cross-project references are
  preserved during migration and dangling membership is reported rather than
  reassigned. The release needs an explicit repair policy before promising
  automatic correction of those legacy references.
- Q11: copy traversal remaps supported asset and linked-document dependencies;
  unavailable or unsupported dependencies fail before a visible copy exists.
- Q12: deletion removes owned resources and leaves a tombstone that rejects
  delayed or retried writes.
- Q13: supported moves are explicit document membership changes. Copy is the
  dependency-safe cross-project reuse path.
