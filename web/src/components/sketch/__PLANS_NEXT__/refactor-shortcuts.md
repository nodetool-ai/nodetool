# Sketch editor — shortcuts refactor (plan)

**Goal:** One coherent shortcut system for the image/sketch editor: discoverable (tooltips, future cheatsheet), maintainable, and aligned with **Affinity-style modifier behavior** (spring-loaded tools, modifier semantics) rather than legacy Photoshop-centric assumptions—without sharing runtime wiring with the node graph editor.

**Non-goals (initial implementation phases):** Shortcut **settings UI**, **persisted user overrides**, and **import/export** of bindings. **Vim-style multi-key sequences** (unless product explicitly asks). Also: full parity with any single desktop app, or importing `NODE_EDITOR_SHORTCUTS` from `web/src/config/shortcuts.ts`.

**In scope for design now:** The refactor **must** use **stable action ids** (slugs) and a **single resolution path** (defaults → optional overrides → dispatcher) so remapping can land later without another rewrite.

## Interaction manifesto (Affinity-informed — not a clone)

Short principles for sketch shortcuts and modifiers, inspired by how Serif surfaces **contextual** behavior (tool, mode, gesture) rather than one app-wide folklore. We **do not** copy Affinity’s full shortcut map or claim parity.

1. **Context defines meaning** — A modifier’s job depends on **`mode` + active tool + what the user is doing** (dragging a handle vs picking a layer). There is **no** undocumented rule like “Alt always means subtract everywhere.”
2. **One catalog, many surfaces** — The same scoped entries drive **dispatch**, **tooltips**, and **contextual hint UI** (filter by `activeTool` / mode). No second matrix maintained by hand.
3. **Show what applies now** — Prefer UI that reflects **current** tool/mode shortcuts (spirit of Affinity’s status bar: modifiers relevant to the **selected** tool).
4. **Temporary and pointer-modifier actions** — **Spring-loaded** keys and **modifier + pointer** behaviors are **first-class** in implementation (metadata `rebindable: false` when user prefs arrive). Centralize rules; avoid scattered `if (activeTool)` copies.
5. **Shift / Alt / primary modifier** — Common **patterns** (e.g. Shift for constrain or stepped motion) are **defaults we document per row**, not magic constants inferred only in code. **Primary chord modifier** follows NodeTool **`Control`→Cmd/Mac** convention for display and matching (`mapSketchComboForOS`).
6. **Predictability over nostalgia** — When choosing defaults, prefer **coherent context-local** behavior over “because Photoshop did it,” unless we explicitly document a Photoshop-compat exception.

Record deliberate differences vs `__PLANS__/old/SHORTCUTS.md` in the catalog or **Decisions (record)** when implementing.

---

## Current state (snapshot)

- **Main sink:** `useEditorKeyboardShortcuts.ts` — large capture-phase handler, mixes global keys, tool switching, nudge loop, spring-loaded move, transform/crop escapes, etc.
- **Elsewhere:** Panel-local capture handlers (e.g. blend mode / preset cycling on `SketchLayersPanel`), context menus, modal escape paths — reasonable for focus-scoped behavior, but **not** discoverable from one catalog.
- **Modifier tracking:** `useKeyboardModifiers.ts` + bits inside pointer/canvas hooks — should stay the source of truth for *pointer* behavior; keyboard path should not duplicate semantics inconsistently.

---

## Reference: how NodeTool does it (do not reuse the list)

`web/src/config/shortcuts.ts` defines a **`Shortcut`** shape: stable `slug`, `title`, `description`, **`keyCombo`** (+ optional **`keyComboMac`**), categories, and helpers like **`expandShortcutsForOS`** / **`mapKeyForMac`** for **tooltip display** (e.g. Control→⌘, Alt→Option). Registration lives in hooks, not in that file.

**Primary modifier (Cmd vs Ctrl) — verified pattern** (see `useNodeEditorShortcuts.ts`, `KeyPressedStore.ts`):

| Layer | Behavior |
|-------|----------|
| **Config** | Chords use **`"Control"`** as the **semantic** primary modifier (not “physical Ctrl only”). |
| **Registration / binding key** | **`mapComboForOS`**: on Mac, replace each **`"Control"`** with **`"Meta"`**; on Windows/Linux keep **`"Control"`**. Use **`isMac()`** from **`web/src/utils/platform.ts`** (`userAgent.includes("Mac")`). Mac: **`"Delete"`** → **`"Backspace"`** where needed. |
| **Runtime state** | **`KeyPressedStore`** sets **`control` = ctrlKey**, **`meta` = metaKey** (both may exist; combos are registered so the **sorted string** matches the OS, e.g. `c+meta` vs `c+control`). |
| **String tokens** | Lowercase **`control`**, **`meta`**, **`shift`**, **`alt`**; `registerComboCallback` normalizes **`ctrl` → control**. |

Ad-hoc hooks sometimes pass explicit `["meta","k"]` vs `["control","k"]` — same idea as `mapComboForOS`.

**Takeaway for sketch:** sketch-only catalog + **`mapSketchComboForOS`** mirroring **`mapComboForOS`**; **do not import** node configs. **Do not** rely on today’s sketch mix of `navigator.platform` vs **`isMac()`** — standardize on **`isMac()`** for chord expansion unless a documented exception (e.g. spring-load **physical** key discrimination).

**Registration nuance (node editor today):** `useNodeEditorShortcuts` builds combos from each shortcut’s **`keyCombo`** + **`altKeyCombos`** only. **`keyComboMac`** is used for **tooltips** (`expandShortcutsForOS`); if a Mac chord differs **beyond** Control→Meta, the **extra** Mac binding must also appear in **`altKeyCombos`** (or equivalent) or it will not fire. Sketch’s registrar should document the same rule to avoid “Mac shows ⌘/ but only Ctrl/ registered.”

---

## Target architecture (broad)

1. **Catalog** — declarative entries: **action id** (stable slug), human title, optional description, **default** chords using NodeTool **semantic tokens** (`Control`, `Shift`, `Alt`, key names). Optional **`keyComboMac`** only when Mac differs **other** than Control→Meta (mirror `shortcuts.ts`). Optional **scopes** per entry. Runtime **`mapSketchComboForOS`** + normalizer match **`KeyboardEvent`**. Pure data; no React. Handlers **by action id** only.
2. **Binding table (conceptual)** — `Map<BindingKey, ActionId>` per scope (or one table with scope columns). Phase A–D use **defaults only**; the same shape later holds **merged** defaults + user overrides.
3. **Dispatcher** — normalizes `KeyboardEvent` → binding lookup → **action id** → handler. Keeps “what key” and “what it does” apart; remapping only changes the table, not handler code.
4. **Scopes / precedence** — define **where** a binding applies, e.g.:
   - `global` — whole editor when canvas owns focus and not typing in controls
   - `tool:<name>` — only when `activeTool` matches
   - `transform` / `crop` / `segment` — overrides while a mode is active
   - `panel` — only when focus is inside a specific panel (today: some combos on layers panel)

   **Precedence (first match wins, Affinity-informed):** Serif does not publish a formal “priority stack,” but their docs show **context switches meaning**: *Persona* (Liquify vs Photo vs Develop) remaps the same letter to different tools; some rows are *tool-gated* (“Crop Tool enabled,” “Marquee/Freehand only”). **Our ordering (high → low):**  
   `ignore (IME / form-like control)` → **`mode` (transform, crop, segment; future on-canvas text)** → **`panel` (focused panel)** → **`tool:<name>`** → **`global`**.  
   Document this in the dispatcher; do not scatter ad-hoc `if (activeTool)` ahead of mode checks.

   **Affinity behaviors to mirror conceptually:** spring/temporary tool on **held** key (e.g. View/Zoom in their tables); **modifier + pointer** rows (Alt-click, Shift-drag); optional **customize shortcuts** per workspace ([Serif help](https://affinity.help/photo2/en-US.lproj/pages/Workspace/shortcuts.html), [customizing](https://affinity.help/photo2/en-US.lproj/pages/Workspace/customizingShortcuts.html)).

5. **Spring-loaded and held modifiers** — Affinity-style: temporary tool / mode while key(s) held, clear rules for which tools allow spring move vs. block it (already partially encoded). Refactor should **centralize the rule table** instead of scattering `if (activeTool === …)` through the handler. These may stay **implementation-defined** (not in user overrides) at first; catalog flags them as `rebindable: false` when you add prefs.

6. **Tooltips & UI** — toolbars/menus resolve **display chord** from the **effective** binding for current OS (defaults now; user chord later) plus title/description from catalog. **`tool:<name>`** (and **`mode`** rows) in the catalog are the **query surface** for **contextual hints** (e.g. status strip, context bar, or “modifiers for this tool” popover): filter entries where scope matches `activeTool` and current **mode**, Affinity-style, without maintaining a second list.

7. **Electron** — if sketch runs in Electron with menu-accelerators later, mirror NodeTool’s `skipInElectron` pattern at the catalog level; not required for first iteration.

---

## Future: user-defined remapping (recommended system, out of scope until Phase E+)

Ship **after** catalog + dispatcher + scopes are stable.

| Piece | Recommendation |
|-------|----------------|
| **Identity** | One **action id** per command (`undo`, `tool.brush`, `transform.commit`, …). Catalog is the **source of truth** for title, description, default chord(s), scope, and **`rebindable`** / **`requiresChord`** metadata. |
| **Overrides** | `SketchShortcutPrefs`: e.g. `Record<ActionId, KeyChord[]>` — multiple chords per action allowed if desired; **or** single chord with “add alternate” in UI later. Store **normalized chord** (modifiers + `code` or stable key) — same philosophy as NodeTool’s combo arrays, but sketch-local types. |
| **Resolution** | `effectiveBindings = merge(defaultCatalog, userOverrides)` with clear rules documented when Phase E starts. **TBD:** full *replace* of default chord vs *additive* alternates — see **Decisions (record)**. Dispatcher always consults **effective** table for the active scope. |
| **Conflicts** | Detect duplicate `(scope, normalizedChord)` when saving prefs; surface in settings UI. Global vs tool scope reduces accidental clashes. |
| **Non-rebindable** | Spring-load, pointer-driven modifiers, and odd repeat/RAF paths may stay fixed; flag in catalog so UI hides or disables them. |
| **Persistence** | Web: `localStorage` or existing Zustand `persist` slice keyed to sketch/user. Electron: in-app only first; OS menu integration optional later. |
| **Tests** | Golden tests: given prefs JSON → expected resolution for a few `KeyboardEvent` fixtures per scope. |

This stays **sketch-only** (no shared prefs with node editor shortcuts).

---

## Coexistence with NodeTool (workflow) shortcuts

- **Keep sketch and node-editor shortcut systems separate** (no shared `NODE_EDITOR_SHORTCUTS`, no shared prefs). Parallels in `web/src/config/shortcuts.ts` are **shape-only** reference.
- **Today:** sketch uses **capture**-phase `keydown` on `window` and **`stopPropagation()`** so the event does not reach other listeners (`useEditorKeyboardShortcuts.ts`). Node shortcuts use **`KeyPressedStore`** on `window` in the **bubble** phase (`keydown` without capture). Capture + stop propagation runs before target and prevents later phases from seeing the event when sketch handles it — **sketch wins** for keys it consumes.
- **Defense in depth:** When the image editor is open, **also** treat workflow shortcuts as inactive where practical (e.g. ensure `NodeEditor` / modal stack passes `active: false` into `useNodeEditorShortcuts` if focus is owned by sketch — align with existing “sketch modal open” behavior documented in `SKETCH_FEATURES_DONE.md`). Refactor should **not** rely only on stopPropagation without a clear story for edge keys.
- Single listener **inside sketch** remains a local implementation detail; it does not need to plug into `KeyPressedStore`.

---

## Decisions (record)

| Topic | Decision |
|-------|----------|
| **Scope precedence** | Affinity-informed stack: **mode → panel → tool → global**, after IME/form ignore. |
| **`e.code` vs `e.key`** | Locked: see **Best practices** → *Physical vs logical keys (plain language)*; document in normalizer. |
| **`e.repeat`** | Locked: catalog/metadata per action class (one-shot vs repeat). |
| **Capture listener** | Locked: **one sketch dispatcher** (capture phase), consistent with today. |
| **`actionId` shape** | Locked: **namespaced dot ids** (`tool.brush`, `transform.commit`, …). |
| **Arrow nudge / opacity digits** | **Catalog entries** that delegate to shared action handlers; **repeat/hold** and digit sequences stay **thin adapter code** referenced from metadata (`handlerKind` or equivalent) so the table stays the index of truth. |
| **Panel shortcuts (layers)** | **Phase C:** fold into **`panel` scope** in the same catalog + conflict surface for future remapping; until then local capture is acceptable. |
| **Cmd / Ctrl / Meta** | **Locked:** catalog **`Control`** = semantic primary modifier; expand with sketch **`mapSketchComboForOS`** using **`isMac()`**; matching uses **`ctrlKey` / `metaKey`** consistently with expanded chord (or **`ctrlKey || metaKey`** when using `e.key`-style checks). Tooltip display mirrors **`mapKeyForMac`**. Standardize **`isMac()`**; drop ad-hoc **`navigator.platform`** in sketch shortcut code unless one **documented** exception (e.g. spring-loaded **physical** key). |
| **User overrides merge (Phase E+)** | **Decide later**; add UX note: *replace-default* is simpler for conflicts; *additive alternates* is nicer for power users. |

---

## Migration strategy (phased)

| Phase | Focus |
|-------|--------|
| **A** | Add sketch `shortcutCatalog` + types + **`mapSketchComboForOS`** (and display helper mirroring `mapKeyForMac`); document scopes; no behavior change. |
| **B** | Extract dispatcher from `useEditorKeyboardShortcuts`; wire catalog to existing handlers; add tests per scope. |
| **C** | Fold panel-local shortcuts into catalog or explicit “panel scope” registration; unify tooltip sources. |
| **D** | Optional: **contextual hints strip** + **full cheatsheet**, both **filtered from the catalog** (no hand-maintained shortcut matrix). |
| **E+** | **User remapping:** prefs model, settings UI, persistence, conflict errors, tooltips reading effective chords — only after A–C prove the binding table. |

---

## Best practices & edge cases

- **Naming:** Use **`actionId`** in TypeScript and handlers. The catalog field can mirror NodeTool’s `slug` — **same string** as `actionId` (one glossary entry, no drift).
- **IME / composition:** Do not run sketch shortcuts while the user is composing text (`keydown`/`keyup` with **`isComposing`**, or between `compositionstart` and `compositionend`). Same for any future on-canvas text tool.
- **Physical vs logical keys (`code` vs `key`) — plain language:**
  - **`key`** = the character the OS produces *right now* (depends on layout, Shift, caps). Examples: `"b"`, `"B"`, `"5"`, `"é"`. On **AZERTY**, the key cap that still means “brush slot” might not produce the letter `"b"`.
  - **`code`** = which **physical key** was pressed (roughly the US QWERTY label), e.g. **`KeyB`**, **`Digit5`**, **`BracketLeft`**. Same `code` regardless of whether that key types `"b"` or something else.
  - **Rule:** Tool shortcuts tied to **muscle position** (B brush, V move) → match on **`code`** so layout changes do not move tools. **Opacity / numeric entry** where the user means the **digit character** → use **`key`** (often `DigitN` + `key` check together for clarity).
  - If this still feels fuzzy: *`code` = “which key cap”; `key` = “what letter/number printed.”*
- **`repeat`:** Define per action whether **`e.repeat`** should no-op (one-shot) or continue (nudge loop, bracket resize). Centralize so behavior matches catalog metadata where useful.
- **`preventDefault` / `stopPropagation`:** Only **`preventDefault`** when the browser default would fight the editor (scroll, tab trap, etc.). Keep **`stopPropagation`** where sketch must not bubble to the workflow/node editor (existing pattern in `useEditorKeyboardShortcuts`).
- **Discovery & a11y:** Shortcuts are supplementary; commands stay reachable from buttons/menus. Tooltips pull from the **same** catalog as the dispatcher so strings do not diverge.
- **Debugging:** Optional dev-only trace (e.g. `sessionStorage` flag) logging `actionId` + scope helps avoid “why didn’t V fire?” sessions.
- **Tests:** Table-driven unit tests: synthetic `KeyboardEvent` + scope state → `actionId | null`. Keep existing RTL tests for “typing in combobox must not steal arrows.” **Assert `mapSketchComboForOS`** + dispatcher: same catalog row registers as **Meta** on Mac and **Control** on Windows for primary-modifier shortcuts. Cover **Delete vs Backspace** on Mac if catalog includes delete-like actions.

---

## Open questions (remaining)

- **Conflict policy** when a tool letter clashes with typing in a **future on-canvas text** tool (likely: text-edit **mode** disables tool-letter bindings, Affinity-style separate Text shortcuts table).
- **Remapping merge rule:** replace-default vs additive alternates — **defer to Phase E** (see Decisions table).

---

## Follow-ups & gaps (easy to overlook)

- **Catalog invariants (Phase A/B):** Validate **no duplicate** `(scope, normalized chord)` in defaults; every **`actionId`** used in the dispatcher has a catalog row and handler. Run in **tests** or a small build step.
- **Stuck modifier / spring state:** On **`window` blur**, **`visibilitychange`** (hidden tab), or when the sketch **closes**, reset **spring-loaded / held modifier** flags so a released key never “sticks” after alt-tab. (`KeyPressedStore` clears on blur for the node editor; sketch needs the same discipline where it keeps transient keyboard state.)
- **Browser/OS reserved chords:** Some combos never reach the page (tab close, find, devtools). **Never** make mission-critical actions *only* available via those chords; treat unreliable shortcuts as convenience only.
- **Embedded surfaces:** Sketch may run in **modal** vs **inline** (`AssetEditor`, node preview). Same catalog/dispatcher; confirm **when** shortcuts are armed (open + focused) and **`active: false`** for workflow shortcuts is consistent everywhere sketch mounts.
- **Prefs schema (Phase E+):** Version **`SketchShortcutPrefs`** and migrate or strip unknown **`actionId`** keys when the catalog changes.
- **`isMac()` quirks:** iPad / “desktop mode” may report Mac-like UA; behavior is acceptable if it matches user expectations; note in tests if something breaks.

---

## Related

- `__PLANS__/SKETCH_FEATURES.md` — “SHORTCUTS REFACTOR” line → this document
- `__PLANS__/SKETCH_FEATURES_DONE.md` — sketch-modal vs workflow shortcut behavior (regression context)
- `__PLANS__/old/SHORTCUTS.md` — parity checklist (implementation status)
- `useEditorKeyboardShortcuts.ts`, `useEditorCommands.ts`, `SketchLayersPanel.tsx` (panel capture)
- `web/src/config/shortcuts.ts` — NodeTool (`Shortcut` shape, `mapKeyForMac`, **reference only**)
- `web/src/hooks/useNodeEditorShortcuts.ts` — **`mapComboForOS`**, `ControlOrMeta` (**reference only**)
- `web/src/stores/KeyPressedStore.ts` — **`control` / `meta` tracking** (**reference only**; sketch stays off this store)
- `web/src/utils/platform.ts` — **`isMac()`** (**use** for sketch OS branching)
