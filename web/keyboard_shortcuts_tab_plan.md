# Plan: Interactive Keyboard Shortcuts Tab

## Overview

Add a third tab to the existing Help modal that shows an interactive on-screen keyboard. Keys used by any shortcut are highlighted and reveal a tooltip describing the shortcut when hovered. The layout shows macOS (⌘) and Windows/Linux (Ctrl) automatically by using global isMac boolean.
isMac to be added in 2.

We will leverage **react-simple-keyboard** for rendering, which keeps implementation lightweight while avoiding hand-rolled key positioning.

---

## 1 Dependencies

1. Add the package to the web workspace:
   ```bash
   pnpm add -w web react-simple-keyboard
   ```
2. Import its default stylesheet once in `web/src/index.tsx`:
   ```ts
   import "react-simple-keyboard/build/css/index.css";
   ```

---

## 2 Global platform helper

decide what is better:
A as /hooks/usePlatform
B create `web/src/utils/platform.ts`:

```ts
export const isMac = () => navigator.userAgent.includes("Mac");
// OR like this? (should also work in electron)
const isMac = window.navigator.platform.toLowerCase().includes("mac");
```

Exported **function** instead of constant so it can be mocked in tests.

---

## 3 Centralising shortcut metadata

1. Create a new file `web/src/config/shortcuts.ts` that exports:

```ts
export interface Shortcut {
  /** Short, human-readable name e.g. "Copy" */
  title: string;
  /** Name as stable slug/key so other components can reference this shortcut (e.g. "copy", "fit-view") */
  name: string;
  /** Key combo for Windows/Linux variant – array of key labels as used by useCombo */
  keyCombo: string[];
  /** Optional override for macOS variant – if omitted we derive it by swapping ⌘/Ctrl & PgUp/PgDn-equivalents */
  keyComboMac?: string[];
  /** A longer explanation shown in tooltip / Help list. Could be a plain string or a React node for rich text. */
  description: string | React.ReactNode;
}

/**
 * Convenience helper: provide a list with only keyCombo (ctrl-style).
 * `expandShortcutsForOS()` returns the appropriate layout for the
 * current OS by automatically replacing platform keys.
 */
export const expandShortcutsForOS = (
  shortcuts: Shortcut[],
  isMac: boolean
): Shortcut[] => {
  const mapKey = (key: string) => {
    if (!isMac) return key === "Meta" ? "Control" : key;
    // macOS replacements
    if (key === "Control") return "Meta";
    //...
    return key;
  };
  return shortcuts.map((s) => ({
    ...s,
    // Prefer explicit mac override, else automap.
    keyCombo: isMac ? s.keyComboMac ?? s.keyCombo.map(mapKey) : s.keyCombo
  }));
};

export const NODE_EDITOR_SHORTCUTS: Shortcut[] = [
  {
    title: "Copy",
    slug: "copy",
    keyCombo: ["Control", "C"],
    keyComboMac: ["Meta", "C"],
    description: "Copy selected nodes"
  }
];

/** --------------------------------------------------
 * Tooltip helper
 * Given a slug and OS flag, returns a formatted tooltip, e.g.
 * "Copy (⌘ + C)"  or  "Copy (Ctrl + C)"
 */
export const getShortcutTooltip = (slug: string, isMac: boolean): string => {
  const sc = NODE_EDITOR_SHORTCUTS.find((s) => s.slug === slug);
  if (!sc) return slug;
  const mapKey = (key: string) => {
    if (!isMac) return key === "Meta" ? "Ctrl" : key;
    return key === "Control" ? "⌘" : key;
  };
  const comboArr = isMac
    ? sc.keyComboMac ?? sc.keyCombo.map(mapKey)
    : sc.keyCombo;
  const comboStr = comboArr.join(" + ");
  return `${sc.title} (${comboStr})`;
};
```

NOTE:
should be using this classnames and <kbd>

 <div className="tooltip-span">
          <div className="tooltip-title">Run Workflow</div>
          <div className="tooltip-key">
            <kbd>CTRL</kbd>+<kbd>Enter</kbd> / <kbd>⌘</kbd>+<kbd>Enter</kbd>
          </div>
        </div>

2. Modify `NodeEditorShortcuts.ts` to import `NODE_EDITOR_SHORTCUTS` and optionally the helper so the runtime hook and UI share one source of truth.

---

## 4 Keyboard view component

File: `web/src/components/content/Help/KeyboardShortcutsView.tsx`

Props:

```ts
interface Props {
  shortcuts: Shortcut[];
  initialOs: "mac" | "win";
}
```

Responsibilities:

1. Local state `layoutOs` toggled via `ToggleButtonGroup` (Mac / Win labels). Default = `initialOs`.
2. Compute `{ [keyLabel: string]: Shortcut[] }` mapping for chosen OS.
3. Render a `Keyboard` component from _react-simple-keyboard_.
   ```tsx
   <Keyboard
     layout={customLayout[layoutOs]}
     display={displayLabels}
     buttonTheme={highlightTheme}
     physicalKeyboardHighlight={false}
     disableButtonHold={true}
     // readOnly so it doesn't affect focused inputs
     inputName="help"
   />
   ```
4. `highlightTheme` is derived from the mapping – each key present in a shortcut gets class `has-shortcut`. Additional class `highlighted` is applied when it is hovered (simple onMouseEnter/onMouseLeave callbacks).
5. Wrap `Keyboard` in a `TooltipProvider` (MUI) so each key becomes a tooltip target.
6. Accessibility: `role="button"`, `tabIndex={0}` on each rendered key.

---

## 5 Integrate into Help modal

1. Update the tab header list in `Help.tsx`:
   ```tsx
   <Tab label="Keyboard View" id="help-tab-2" />
   ```
2. Add `<TabPanel index={2}>` rendering `<KeyboardShortcutsView
  shortcuts={NODE_EDITOR_SHORTCUTS}
  initialOs={isMac() ? 'mac' : 'win'}
/>`.
3. Keep existing search & lists untouched.

---

## 6 Styling

1. Minimal CSS override for `react-simple-keyboard` keys:
   ```css
   .hg-button {
     border-radius: 4px;
     padding: 6px;
     background: var(--palette-background-default);
     color: var(--palette-text-primary);
   }
   .has-shortcut {
     border: 2px solid var(--nt-hl, #5ac8fa);
   }
   .highlighted {
     background: var(--nt-hl, #5ac8fa);
     color: #000;
   }
   ```
2. Place overrides in `web/src/styles/keyboard.css` and import in `KeyboardShortcutsView.tsx`.

---

## 7 Testing & Validation

1. Verify all shortcuts appear for both OS layouts.
2. Hovering any key shows tooltip and highlights the whole combo (all keys involved).
3. Switching OS toggle updates highlighted keys immediately.
4. Modal closes & scrolls as before; no console warnings.

---

## 8 Follow-ups (out of scope)

- International keyboard layouts support.
- Touch-friendly interaction.
- Animating keypresses in real-time when user actually triggers a shortcut.

---

## 9 Real-time key-press highlight (nice-to-have)

- Listen to `keydown`/`keyup` globally inside `KeyboardShortcutsView` (only while the tab is visible) and add/remove the `pressed` class on the corresponding key(s) – giving immediate visual feedback when the user physically presses a shortcut.
- Debounce keyup events so momentary taps are still visible.

---

## 10 De-duplicate help data source

The textual **Controls & Shortcuts** list in `Help.tsx` manually repeats much of the same information we are now storing in `NODE_EDITOR_SHORTCUTS`.

Action:

1. Refactor `helpItems` creation so it consumes the central `NODE_EDITOR_SHORTCUTS` array and groups items by category (Nodes, Workflows, etc.).
2. This guarantees both the keyboard view and list view display exactly the same bindings.
3. check KeyPressedStore, specifically this part:
   const registerComboCallback = (combo: string, options: ComboOptions = {}) => {
   comboCallbacks.set(combo, options);
   };

---

## 11 Remove local `ControlOrMeta` constants

Multiple files (e.g. `useNodeEditorShortcuts`) define their own `ControlOrMeta` logic. Replace these with:

```ts
import { isMac } from "../utils/platform";
const ControlOrMeta = isMac() ? "Meta" : "Control";
```

This keeps platform detection consistent and testable.

---

## 12 Types & Linting

- Install types: `@types/react-simple-keyboard` (if available) or declare a minimal module in `src/types/`.
- Extend ESLint rule overrides for the new directory if necessary.

---

## 14 Unit/Integration tests

1. Snapshot test: mount `KeyboardShortcutsView` with a small subset of shortcuts and verify highlighted/tooltip logic.
2. Simulate keydown event (`Ctrl+C`) and expect the corresponding keys to receive `pressed` class.
3. Jest DOM: assert that switching OS toggle remaps keys.

---

## 15 Documentation

Update `docs/architecture.md` or a new MD file describing the shortcut architecture and how to add new bindings:

- Add entry to "Conventions" section about updating `NODE_EDITOR_SHORTCUTS`.

---

✔️ With these extra steps the feature will be consistent, maintainable, and performant across the app.
