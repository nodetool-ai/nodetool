# Sketch editor — shortcuts refactor (plan)

**Goal:** One coherent shortcut system for the image/sketch editor: discoverable (tooltips, future cheatsheet), maintainable, and aligned with **Affinity-style modifier behavior** (spring-loaded tools, modifier semantics) rather than legacy Photoshop-centric assumptions—without sharing runtime wiring with the node graph editor.

**Non-goals (for this phase):** User-rebindable keys, full parity with any single desktop app, or importing `NODE_EDITOR_SHORTCUTS` from `web/src/config/shortcuts.ts`.

---

## Current state (snapshot)

- **Main sink:** `useEditorKeyboardShortcuts.ts` — large capture-phase handler, mixes global keys, tool switching, nudge loop, spring-loaded move, transform/crop escapes, etc.
- **Elsewhere:** Panel-local capture handlers (e.g. blend mode / preset cycling on `SketchLayersPanel`), context menus, modal escape paths — reasonable for focus-scoped behavior, but **not** discoverable from one catalog.
- **Modifier tracking:** `useKeyboardModifiers.ts` + bits inside pointer/canvas hooks — should stay the source of truth for *pointer* behavior; keyboard path should not duplicate semantics inconsistently.

---

## Reference: how NodeTool does it (do not reuse the list)

`web/src/config/shortcuts.ts` defines a **`Shortcut`** shape: stable `slug`, `title`, `description`, `keyCombo` (+ optional mac overrides), categories, and helpers like `expandShortcutsForOS`. Registration lives in editor hooks, not in that file.

**Takeaway for sketch:** adopt a **similar data shape and OS expansion idea** in a **sketch-only module** (e.g. `sketch/shortcutCatalog.ts` or under `sketch/config/`), so tooltips and docs can lookup by `slug` without coupling to workflow shortcuts.

---

## Target architecture (broad)

1. **Catalog** — declarative entries: id/slug, human title, optional description, display combos (win + mac), optional **scopes** (see below). Pure data; no React.
2. **Dispatcher** — small layer that maps `KeyboardEvent` → catalog entry → handler. Keeps “what key” and “what it does” apart; long-term easier to test.
3. **Scopes / precedence** — define **where** a binding applies, e.g.:
   - `global` — whole editor when canvas owns focus and not typing in controls
   - `tool:<name>` — only when `activeTool` matches
   - `transform` / `crop` / `segment` — overrides while a mode is active
   - `panel` — only when focus is inside a specific panel (today: some combos on layers panel)

   Order of evaluation and “when to ignore (inputs, combobox, …)” should be **one documented policy**, reusing or extending `shouldIgnoreForUiControl`-style checks.

4. **Spring-loaded and held modifiers** — Affinity-style: temporary tool / mode while key(s) held, clear rules for which tools allow spring move vs. block it (already partially encoded). Refactor should **centralize the rule table** instead of scattering `if (activeTool === …)` through the handler.

5. **Tooltips & UI** — toolbars/menus reference catalog slugs for “title + shortcut” strings so copy stays in sync.

6. **Electron** — if sketch runs in Electron with menu-accelerators later, mirror NodeTool’s `skipInElectron` pattern at the catalog level; not required for first iteration.

---

## Affinity vs Photoshop (behavior intent)

- Prefer **modifier-driven temporary** behaviors (spring tools, constrained transforms) and **consistent Alt/Option vs Ctrl/Cmd** across platforms where the code already special-cases Apple-like platforms.
- Any deliberate deviation from the old checklist in `__PLANS__/old/SHORTCUTS.md` should be recorded in the catalog description or a short “decisions” subsection when implementation starts.

---

## Migration strategy (phased)

| Phase | Focus |
|-------|--------|
| **A** | Add sketch `shortcutCatalog` + types; document scopes; no behavior change. |
| **B** | Extract dispatcher from `useEditorKeyboardShortcuts`; wire catalog to existing handlers; add tests per scope. |
| **C** | Fold panel-local shortcuts into catalog or explicit “panel scope” registration; unify tooltip sources. |
| **D** | Tight Affinity-style modifier matrix + cheatsheet UI (optional). |

---

## Open questions (to decide before deep implementation)

- Single **capture** listener vs. splitting by scope (performance vs. clarity).
- Whether **digit opacity** and **arrow nudge** stay special-cased or become catalog entries with custom “repeat/hold” handling.
- **Conflict policy** when two entries match (e.g. tool key vs. typing in a future text-on-canvas tool).

---

## Related

- `__PLANS__/SKETCH_FEATURES.md` — checklist item “SHORTCUTS REFACTOR”
- `__PLANS__/old/SHORTCUTS.md` — parity checklist (implementation status)
- `useEditorKeyboardShortcuts.ts`, `useEditorCommands.ts`, `SketchLayersPanel.tsx` (panel capture)
