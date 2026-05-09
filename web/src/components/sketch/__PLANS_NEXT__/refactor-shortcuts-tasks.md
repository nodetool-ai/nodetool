# Sketch shortcuts refactor — actionable task plan

## How Photoshop and Affinity Photo handle this

Both use the same conceptual architecture:

1. **Action registry** — a flat list of named actions (`undo`, `brush.size.decrease`, `tool.brush`, etc.). Actions don't know their key bindings.
2. **Binding catalog** — a separate table mapping `(key + modifiers + scope)` → action id. This is what the user edits in the Keyboard Shortcuts dialog.
3. **Dispatcher** — on keydown: determine active scope, find the matching binding, dispatch the action.
4. **Scope is shallow** — only two or three levels: blocked (typing) → mode (transform/crop/liquify) → global. Neither app has "tool scope" in the dispatcher. Tool-letter shortcuts are just global actions that call `setActiveTool()`. Shortcuts like `[`/`]` are global actions whose handlers branch on active tool internally.
5. **Spring-loaded tools** — a separate mechanism entirely. The dispatcher does not handle held-key tool switching; a modifier-state module tracks which physical keys are held and overrides the active tool while they are down.
6. **Component-local Escape/Enter** — dialogs, rename inputs, and context menus handle their own Escape/Enter before the global dispatcher sees the event (via capture phase or stopPropagation). This is correct and stays as-is.

We will follow this pattern.

---

## Architecture

```
Action Registry          pure data, no key knowledge
  id, label, displayGroup, handler ref

Binding Catalog          pure data, no handler knowledge
  key, modifiers, actionId, scope

Dispatcher               reads both at runtime
  1. Is focused element a typing control? → block
  2. Is a mode active (transform / crop)? → mode-scope bindings first
  3. Is a panel control focused?          → panel-focus bindings
  4. Otherwise                            → global bindings

Spring-loaded module     separate from dispatch
  tracks held physical keys → overrides activeTool
  manages Ctrl/Cmd (move), Space (pan)
  cleared on window blur
```

**What does NOT go in the dispatcher:**
- Handler-internal tool branching (size, hardness, opacity handlers read activeTool themselves)
- Component-local Escape/Enter (context menus, layer rename, modal close — keep as-is)
- Pointer-gesture modifiers (S key size-drag, Alt+click eyedropper — these are canvas interaction, not shortcuts)

---

## Scope model

| Scope | When active | Examples |
|---|---|---|
| `blocked` | typing/IME input focused | skips all bindings |
| `mode:transform` | activeTool === "transform" | Ctrl+Z → transform-undo, Enter → commit |
| `mode:crop` | activeTool === "crop" | Enter → commit crop, Escape → cancel |
| `panel:layers` | blend-mode or preset dropdown has DOM focus | ArrowUp/Down → cycle blend mode |
| `global` | everything else | all tool switches, undo, zoom, copy, etc. |

No "tool scope." The dispatcher never reads `activeTool` to decide whether to dispatch — only handlers do.

---

## Display groups (for shortcut reference UI)

Each catalog entry carries a `displayGroup` used only for documentation and the shortcut reference panel:

- `Tools` — tool-switch letter keys
- `Edit` — undo/redo, copy/paste, transform, fill, clear
- `Selection` — select-all, deselect, reselect, invert
- `Canvas` — zoom, pan, export, panel toggle
- `Color` — swap, reset
- `Paint` — size, hardness, opacity (annotated "active for paint tools")
- `Layers` — layer-via-copy/cut, blend mode cycling
- `Mode: Transform` — transform-mode-only bindings
- `Mode: Crop` — crop-mode-only bindings

---

## Conflict resolutions (decided, not open)

| Conflict | Decision | Rationale |
|---|---|---|
| `M` = rectangle select vs mirror horizontal | **Rectangle select wins.** Mirror horizontal → toolbar-only, no keyboard shortcut. | Matches both Photoshop and Affinity Photo default. |
| `Shift+M` = vertical mirror | **Removed.** Mirror vertical → toolbar-only. | Follows from M decision above. |
| `S` = clone stamp vs S-held size drag | **Clone stamp wins.** Size drag via S key hold is a pointer-gesture modifier, not a shortcut — it stays in `useKeyboardModifiers.ts` unchanged. No conflict at dispatch level. | Matches Photoshop/Affinity. S = Clone Stamp is standard. |
| `W` = magic wand vs `W` = segment | Segment tool currently uses `W` in toolDefinitions but the hook maps `W` → magic wand. **Magic wand wins for now; segment gets no keyboard shortcut until it is production-ready.** | Avoids premature binding on an unfinished tool. |
| `Ctrl+I` = invert colors vs `Ctrl+Shift+I` = invert selection | No conflict (different modifier). Keep both. Add test to prevent accidental collision. | Already correct. |
| `T` = gradient (vs Photoshop's Type tool) | Keep `T` = gradient. No compatibility issue since there is no text tool yet. | Custom binding, acceptable divergence. |
| `F` = transform (vs Photoshop's screen cycle) | Keep `F` = transform. | Custom binding, acceptable divergence. |

---

## What stays component-local (not migrated to catalog)

These intercept keyboard events correctly today. Do not migrate:

- **`Escape` in `SketchCanvasContextMenu.tsx`** — closes context menu, fires before dispatcher
- **`Escape` in `TransformContextMenu.tsx`** — same
- **`Enter` / `Escape` in `LayerItem.tsx`** — layer rename confirm/cancel
- **`Escape` in `SketchModal.tsx`** — modal close (with discard confirmation guard)
- **`ArrowUp`/`ArrowDown` in `SketchLayersPanel.tsx`** — blend-mode and preset cycling via `onKeyDownCapture` on the focused dropdown; already correctly panel-scoped. Add `panel:layers` entries to the catalog for documentation and shortcut reference display, but leave the handler code in place.
- **`useKeyboardModifiers.ts`** — tracks Shift, Alt, Space, S as refs for canvas pointer gesture state. Not a shortcut dispatcher; keep as-is.

---

## Complete binding catalog (target state)

### Global scope

| Key | Modifiers | Action id | Display group |
|---|---|---|---|
| Z | Ctrl/Cmd | undo | Edit |
| Z | Ctrl/Cmd + Shift | redo | Edit |
| Y | Ctrl/Cmd | redo | Edit |
| S | Ctrl/Cmd | export-png | Canvas |
| 0 | Ctrl/Cmd | zoom-reset | Canvas |
| 1 | Ctrl/Cmd | zoom-100 | Canvas |
| + / = | — | zoom-in | Canvas |
| - | — | zoom-out | Canvas |
| Tab | — | toggle-panels | Canvas |
| A | Ctrl/Cmd | select-all | Selection |
| D | Ctrl/Cmd | deselect | Selection |
| D | Ctrl/Cmd + Shift | reselect | Selection |
| I | Ctrl/Cmd | invert-colors | Edit |
| I | Ctrl/Cmd + Shift | invert-selection | Selection |
| C | Ctrl/Cmd | copy | Edit |
| X | Ctrl/Cmd | cut | Edit |
| V | Ctrl/Cmd | paste | Edit |
| V | Ctrl/Cmd + Shift | paste-masked | Edit |
| J | Ctrl/Cmd | layer-via-copy | Layers |
| J | Ctrl/Cmd + Shift | layer-via-cut | Layers |
| T | Ctrl/Cmd | free-transform | Edit |
| T | Ctrl/Cmd + Shift | repeat-transform | Edit |
| T | Ctrl/Cmd + Shift + Alt | repeat-transform-on-copy | Edit |
| Delete / Backspace | — | clear-layer | Edit |
| Backspace | Ctrl/Cmd | fill-background | Color |
| Backspace | Alt | fill-foreground | Color |
| X | — | swap-colors | Color |
| D | — | reset-colors | Color |
| [ | — | tool-size-decrease | Paint |
| ] | — | tool-size-increase | Paint |
| { | — | tool-hardness-decrease | Paint |
| } | — | tool-hardness-increase | Paint |
| 0–9 | — | tool-opacity-preset | Paint |
| ArrowUp | — | nudge-up | Edit |
| ArrowDown | — | nudge-down | Edit |
| ArrowLeft | — | nudge-left | Edit |
| ArrowRight | — | nudge-right | Edit |
| V | — | tool-move | Tools |
| B | — | tool-brush | Tools |
| P | — | tool-pencil | Tools |
| E | — | tool-eraser | Tools |
| G | — | tool-fill | Tools |
| I | — | tool-eyedropper | Tools |
| Q | — | tool-blur | Tools |
| S | — | tool-clone-stamp | Tools |
| J | — | tool-adjust | Tools |
| W | — | tool-select-magic-wand | Tools |
| M | — | tool-select-rect | Tools |
| C | — | tool-crop | Tools |
| T | — | tool-gradient | Tools |
| F | — | tool-transform | Tools |
| U | — | tool-shape | Tools |
| L | — | tool-shape-line | Tools |
| R | — | tool-shape-rect | Tools |
| O | — | tool-shape-ellipse | Tools |
| A | — | tool-shape-arrow | Tools |
| Escape | — | cancel-or-deselect | Edit |

### Mode: transform scope (overrides global for these keys)

| Key | Modifiers | Action id | Display group |
|---|---|---|---|
| Z | Ctrl/Cmd | transform-undo | Mode: Transform |
| Z | Ctrl/Cmd + Shift | transform-redo | Mode: Transform |
| Y | Ctrl/Cmd | transform-redo | Mode: Transform |
| Enter | — | transform-commit | Mode: Transform |
| Escape | — | transform-cancel | Mode: Transform |

### Mode: crop scope

| Key | Modifiers | Action id | Display group |
|---|---|---|---|
| Enter | — | crop-commit | Mode: Crop |
| Escape | — | crop-cancel | Mode: Crop |

### Panel: layers scope (documented; dispatched by panel component)

These are not dispatched by the central dispatcher — they fire from `onKeyDownCapture` on specific dropdown elements. The focus target disambiguates the two sets; there is no actual ArrowUp collision.

| Key | Modifiers | Action id | Display group | Focus target |
|---|---|---|---|---|
| ArrowUp | — | blend-mode-prev | Layers | blend-mode dropdown |
| ArrowDown | — | blend-mode-next | Layers | blend-mode dropdown |
| ArrowUp | — | canvas-preset-prev | Layers | canvas-preset dropdown |
| ArrowDown | — | canvas-preset-next | Layers | canvas-preset dropdown |

### Spring-loaded (not in dispatch chain — managed by modifier-state module)

| Physical key | Effect | Blocked when |
|---|---|---|
| ControlLeft/Right (Win) or MetaLeft/Right (Mac) | Temporarily activates move tool | activeTool is select / crop / segment |
| Space | Temporarily activates pan | — |

---

## Ordered implementation tasks

- [x] **Keyboard test audit (do this before touching any code):** grep `__tests__/` for `keydown`, `KeyboardEvent`, and `key:` to get a full list of tests that exercise keyboard behavior. Record which files and which actions they cover. After the hook is rewritten, verify each one still reaches the new dispatcher. This is the regression baseline.

- [x] Create `shortcuts/actionRegistry.ts` — pure data module exporting the action registry type (`id`, `label`, `displayGroup`) and the full list of sketch action ids as a const enum or string union. No handlers, no keys.

- [x] Create `shortcuts/bindingCatalog.ts` — pure data module exporting the full binding catalog table above as a typed const array (`key`, `modifiers`, `actionId`, `scope`). No runtime logic.

- [x] Add normalization helpers in `shortcuts/normalize.ts` — re-export `isMac` from `web/src/utils/platform.ts` (already uses `navigator.userAgent`, not the deprecated `navigator.platform`), `normalizeKey()` for Delete→Backspace where appropriate, `buildComboString(e: KeyboardEvent)` for matching, and `displayCombo(actionId)` for OS-aware display strings (Ctrl → ⌘ on Mac). Replace the existing local `isAppleLikePlatform()` in `useEditorKeyboardShortcuts.ts`.

- [x] Add catalog integrity tests — duplicate bindings within the same scope, action ids not in registry, OS expansion correctness, all mode-scope entries have a corresponding global fallback where expected.

- [x] Create `shortcuts/dispatcher.ts` — the scope resolution function: blocked-check → mode:transform → mode:crop → panel:layers (for documentation; actual dispatch stays in panel) → global. Returns the matched action id or null. Pure function that takes the event and current store state snapshot; no side effects.

- [x] Create `shortcuts/actionHandlers.ts` — maps each action id to its handler function. Handlers call into `paramsRef.current.*` or `useSketchStore.getState().*` directly, same as today. Handler for `tool-opacity-preset`, `tool-size-*`, and `tool-hardness-*` reads `activeTool` internally and branches — no change to this logic.

- [x] Create `shortcuts/springLoadedModifiers.ts` — moves the Ctrl/Cmd spring-loaded move logic and the Space pan tracking out of the keydown handler. Exposes `useSpringLoadedModifiers()` hook that attaches its own window listeners and manages its own held-key state. Accepts the same `select/crop/segment` guard. **Space tracking split resolution:** this module owns `spacePanActive` state (is the user currently panning); `useKeyboardModifiers.ts` keeps its existing `spaceHeldRef` for pointer-gesture code that reads raw held-key state. Different concerns, no duplication. `useKeyboardModifiers.ts` remains otherwise unchanged.

- [x] Add `shortcuts/index.ts` barrel export — re-exports the public API: `displayCombo`, `bindingCatalog`, `SKETCH_ACTIONS` (the action id union/enum), and `useSpringLoadedModifiers`. Keeps consumer imports clean and makes the module boundary explicit.

- [x] Rewrite `useEditorKeyboardShortcuts.ts` to: (1) attach a single `keydown` listener, (2) call `dispatcher()` to get the action id, (3) look up and call the handler from `actionHandlers.ts`. Remove all inline key-string comparisons and tool-context branches from the listener body.

- [x] Replace hard-coded shortcut display strings in `SketchModal.tsx` (undo/redo/export/close tooltips) and `SketchToolbar.tsx` (tool tooltips) with `displayCombo(actionId)` from the normalize helpers. In the toolbar, map each tool definition to its action id using the convention `"tool-" + definition.tool` (e.g. `tool-brush`, `tool-crop`) — no special lookup needed. Update `hooks/useEditorCommands.ts` to pass the updated params shape to the rewritten keyboard hook.

- [x] Replace the static shortcut reference block in `SketchLayersPanel.tsx` (the hardcoded `<dl>`) with a component that reads the binding catalog and groups entries by `displayGroup`.

- [x] Remove mirror-horizontal and mirror-vertical keyboard shortcuts (`M` and `Shift+M`). Confirm mirror UI is accessible via toolbar buttons only. Remove the dead binding from any remaining code.

- [x] Remove the `shortcut` field from every individual tool definition file (`tools/BrushTool.ts`, `PencilTool.ts`, `EraserTool.ts`, `MoveTool.ts`, `TransformTool.ts`, `ShapeTool.ts`, `FillTool.ts`, `EyedropperTool.ts`, `BlurTool.ts`, `CloneStampTool.ts`, `GradientTool.ts`, `CropTool.ts`, `AdjustTool.ts`). Also clear the `shortcut: "W"` field from `SegmentTool.ts` — this binding was already shadowed by magic-wand and the decision is that segment gets no keyboard shortcut until production-ready. Remove the `shortcut` field from the `ToolDefinition` type once all usages are gone.

- [x] Add or update tests: dispatcher scope resolution, mode override behavior, blocked-input bypass, nudge with Shift multiplier, `Ctrl+I` vs `Ctrl+Shift+I` no-collision, spring-loaded modifier lifecycle (activate, window-blur cleanup).

- [x] Delete the old monolithic keydown handler body, any leftover `isAppleLikePlatform()` local copies, and the now-unused inline mirror toggle branches.

## Problematic parts (for reference during migration)

- `useEditorKeyboardShortcuts.ts` mixes binding lookup, scope logic, side effects, repeat-loop management, and handler execution in one 600+ line capture listener.
- OS detection is duplicated: local `isAppleLikePlatform()` vs app-level `isMac()`/Node-editor helpers.
- Shortcut display strings are scattered across four files and drift from actual bindings.
- Arrow nudge RAF loop is ad-hoc; no declarative repeat metadata (keep it ad-hoc for now — it works).
- `useSketchStore.getState()` is called inside the keydown handler multiple times; after migration this moves into handlers which are easier to test.

---

## Affected files

### New files (created by this refactor)
- `shortcuts/actionRegistry.ts`
- `shortcuts/bindingCatalog.ts`
- `shortcuts/normalize.ts`
- `shortcuts/dispatcher.ts`
- `shortcuts/actionHandlers.ts`
- `shortcuts/springLoadedModifiers.ts`
- `shortcuts/index.ts`
- `shortcuts/__tests__/catalog.test.ts`
- `shortcuts/__tests__/dispatcher.test.ts`

### Substantially rewritten
- `useEditorKeyboardShortcuts.ts` — body replaced; becomes thin wiring over dispatcher + actionHandlers

### Targeted edits
- `SketchModal.tsx` — 4 hardcoded display strings → `displayCombo()`
- `SketchToolbar.tsx` — tooltip shortcut display → `displayCombo("tool-" + definition.tool)`
- `SketchLayersPanel.tsx` — static `<dl>` shortcut reference → catalog-derived component
- `hooks/useEditorCommands.ts` — updates params passed to the rewritten keyboard hook; owns the action handler callbacks (handleUndo, handleRedo, etc.) that `actionHandlers.ts` calls into
- `tools/BrushTool.ts`, `tools/PencilTool.ts`, `tools/EraserTool.ts`, `tools/MoveTool.ts`, `tools/TransformTool.ts`, `tools/ShapeTool.ts`, `tools/FillTool.ts`, `tools/EyedropperTool.ts`, `tools/BlurTool.ts`, `tools/CloneStampTool.ts`, `tools/GradientTool.ts`, `tools/CropTool.ts`, `tools/AdjustTool.ts`, `tools/SegmentTool.ts` — remove `shortcut` field
- `toolDefinitions.ts` — remove `shortcut` from `ToolDefinition` type once all usages are cleared

### Unchanged (do not migrate)
- `sketchCanvasHooks/useKeyboardModifiers.ts` — pointer-gesture modifier refs; not a shortcut dispatcher
- `SketchCanvasContextMenu.tsx` — local Escape handler; correct as-is
- `TransformContextMenu.tsx` — local Escape handler; correct as-is
- `LayerItem.tsx` — inline rename Enter/Escape; correct as-is
- `SketchLayersPanel.tsx` blend-mode and preset `onKeyDownCapture` handlers — stay in place; only the static reference `<dl>` changes

---

## Future ideas (out of scope)

- **User remapping** — storage schema, preferences UI, per-binding persistence. Gate: every binding must flow through the catalog (final task above).
- **On-canvas text tool scope** — when a text tool lands, define which global tool-letter shortcuts it suppresses and which remain (zoom, undo, etc. should stay).
- **Shortcut conflict UI** — inline warning when a user rebinding collides with an existing entry in the same scope.
