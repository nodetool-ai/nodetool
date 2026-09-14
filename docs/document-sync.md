# Document synchronization

[`web/src/stores/documentSync.ts`](../web/src/stores/documentSync.ts) is the
canonical seam for editor synchronization. It owns save debounce, serialization,
flush behavior, compare-and-swap recovery, and routing external changes. Editor
integrations supply document conversion, persistence, dirty-state detection, and
merge behavior. They must not recreate that lifecycle in a hook or store.

[ADR 0001](adr/0001-document-sync-draft-wins.md) defines how external changes
merge with an open draft. The implementation plan remains in
[`document-sync-plan.md`](document-sync-plan.md).

## Checked integration inventory

`npm run check:document-sync` scans non-test TypeScript under `web/src` and
rejects synchronization entry points outside this inventory. The check follows
renamed imports and generic calls. An intentional new integration must use the
shared seam and update the inventory in the check and this table together.

| Entry-point category                     | Current integrations                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared lifecycle controller construction | JS Script `useJsScriptServerSync.ts`; Script `useScriptServerSync.ts`; Storyboard `useStoryboardServerSync.ts`; Timeline `useTimelineAutosave.ts`; Sketch `SketchSessionStore.ts`                                              |
| External-change subscription             | Application `ApplicationAppBuilder.tsx`; JS Script `useJsScriptServerSync.ts`; Script `useScriptServerSync.ts`; Storyboard `useStoryboardServerSync.ts`; Timeline `useTimelineExternalSync.ts`; Sketch `SketchSessionStore.ts` |
| Save-flush registry declaration          | `jsScriptSaveRegistry.ts`; `storyboardSaveRegistry.ts`                                                                                                                                                                         |

The two save-flush registries expose a pending shared-controller flush to agent
bridges. They do not implement debounce, retries, compare-and-swap recovery, or
external-change handling. All four migrated editors, Script, Storyboard,
Timeline, and Sketch, construct the shared controller instead of retaining a
separate synchronization lifecycle.
