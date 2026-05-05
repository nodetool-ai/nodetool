# Sketch shortcuts refactor — actionable task plan

## Ordered implementation tasks

- [ ] Inventory the current sketch shortcut surface and freeze the migration target list across `useEditorKeyboardShortcuts.ts`, `sketchCanvasHooks/useKeyboardModifiers.ts`, `SketchLayersPanel.tsx`, `SketchToolbar.tsx`, `SketchModal.tsx`, `toolDefinitions.ts`, and `tool-settings-panels/adjustMoveCropPanels.tsx`.
- [ ] Define sketch-local shortcut primitives: action id format, scope model, binding metadata, repeat behavior, rebindable flag, and OS-display helpers in a pure data module under `web/src/components/sketch/`.
- [ ] Add a sketch shortcut catalog that covers the current global, tool, mode, and panel shortcuts without changing runtime behavior yet.
- [ ] Add normalization helpers for matching `KeyboardEvent` input, including `Control`→`Meta` expansion on macOS via `isMac()`, `Delete`→`Backspace` handling where needed, and the `key` vs `code` split documented in the source plan.
- [ ] Add catalog validation tests for duplicate bindings, missing action ids, OS expansion, and invalid scope metadata.
- [ ] Extract a sketch shortcut dispatcher that resolves active scope in one place with the planned precedence: ignore typing/IME → mode → panel → tool → global.
- [ ] Convert `useEditorKeyboardShortcuts.ts` from a monolithic key switch into dispatcher wiring plus action handlers keyed by action id.
- [ ] Move global editor shortcuts into action handlers first: undo/redo, zoom, export, select-all, deselect/reselect/invert selection, copy/cut/paste, layer via copy/cut, free transform, repeat transform, clear layer, panel toggle, and color swap/reset.
- [ ] Move plain tool-switch bindings into the catalog and action map, including shape sub-variants and selection-mode shortcuts.
- [ ] Move tool-setting shortcuts into shared action handlers so size, hardness, opacity, and mirror actions stop living as inline branches in the keyboard hook.
- [ ] Centralize spring-loaded move behavior, held-arrow nudge behavior, and blur/cleanup reset rules so transient keyboard state is managed beside the dispatcher instead of being scattered through the hook.
- [ ] Fold transform and crop mode bindings into explicit mode-scoped actions for Enter/Escape and transform undo/redo behavior.
- [ ] Introduce panel-scoped shortcut registration/lookup for the layers panel flows that currently use local capture handlers, starting with blend-mode cycling and canvas preset cycling.
- [ ] Replace hard-coded shortcut display strings in `SketchToolbar.tsx`, `SketchModal.tsx`, `SketchLayersPanel.tsx`, and other sketch UI surfaces with catalog-driven display helpers.
- [ ] Replace the static shortcuts reference block in `SketchLayersPanel.tsx` with data derived from the same catalog, grouped by context where needed.
- [ ] Add or update tests for dispatcher resolution, mode/tool/panel precedence, UI-control ignore behavior, spring-loaded modifier cleanup, nudge repeat behavior, and layers-panel quick-cycle behavior after migration.
- [ ] Remove obsolete ad-hoc shortcut branches, local duplication, and outdated comments once catalog-driven wiring is complete.
- [ ] Do a final pass for future remapping readiness by confirming every runtime shortcut flows through action id → effective binding → dispatcher, with no leftover direct key checks outside approved pointer-modifier code.

## Problematic parts

- `useEditorKeyboardShortcuts.ts` currently mixes binding definition, scope resolution, side effects, repeat-loop management, and handler execution in one capture listener.
- OS logic is inconsistent today: the sketch hook uses `navigator.platform`-style checks while the wider app already has `isMac()` and Node editor mapping helpers.
- Shortcut discovery is duplicated across runtime code and UI strings: toolbar tooltips, modal tooltips, transform/crop buttons, and the layers-panel shortcut reference all drift independently.
- Some behavior is focus-local instead of catalog-driven, especially the layers panel arrow-key and wheel quick-cycling paths.
- Pointer modifiers and keyboard modifiers are split between `useKeyboardModifiers.ts`, pointer hooks, and sketch store state, which makes spring-loaded and held-key behavior easy to desynchronize.
- The current hook relies on many direct `useSketchStore.getState()` calls, so scope decisions and side effects are hard to test in isolation.
- Repeat behavior is special-cased for arrow nudging instead of being expressed as explicit shortcut metadata.

## Open questions

- Should panel-scoped shortcuts remain active only when the specific control is focused, or should some of them become broader sketch-panel shortcuts once they move into the shared dispatcher?
- Which current shortcuts should stay non-rebindable from day one besides spring-loaded and pointer-modifier behaviors?
- Do any sketch shortcuts need explicit Mac-only display combos beyond `Control`→`Meta` and `Delete`→`Backspace` normalization?
- When the future on-canvas text flow lands, which scope should fully suppress tool-letter shortcuts and which navigation shortcuts should remain available?
