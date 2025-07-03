# Plan: Interactive Keyboard Shortcuts Tab

## Overview

Add a third tab to the existing Help modal that shows an interactive on-screen keyboard. Keys used by any shortcut are highlighted and reveal a tooltip describing the shortcut when hovered. The layout can be toggled between macOS (⌘) and Windows/Linux (Ctrl) variants.

We will leverage **react-simple-keyboard** for rendering, which keeps implementation lightweight while avoiding hand-rolled key positioning.

---

## 1 Dependencies

1. Add the package to the web workspace:
   ```bash
   pnpm add -w web react-simple-keyboard
   # or: yarn workspace web add react-simple-keyboard
   ```
2. Import its default stylesheet once in `web/src/index.tsx`:
   ```ts
   import "react-simple-keyboard/build/css/index.css";
   ```

---

## 2 Global platform helper

Create `web/src/utils/platform.ts`:

```ts
export const isMac = () => navigator.userAgent.includes("Mac");
```

Exported **function** instead of constant so it can be mocked in tests.

---

## 3 Centralising shortcut metadata

1. Create a new file `web/src/config/shortcuts.ts` that exports:

```ts
export interface Shortcut {
  /** Short, human-readable name e.g. "Copy" */
  title: string;
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
    if (key === "PageUp") return "Shift"; // example – we separately handle prev/next tab mapping
    if (key === "PageDown") return "]";
    return key;
  };
  return shortcuts.map((s) => ({
    ...s,
    // Prefer explicit mac override, else automap.
    keyCombo: isMac ? s.keyComboMac ?? s.keyCombo.map(mapKey) : s.keyCombo,
  }));
};

export const NODE_EDITOR_SHORTCUTS: Shortcut[] = [
  {
    title: "Copy",
    keyCombo: ["Control", "C"],
    keyComboMac: ["Meta", "C"],
    description: "Copy selected nodes",
  },
  // … add the rest, extracted from useNodeEditorShortcuts.ts
];
```

2. Modify `useNodeEditorShortcuts.ts` to import `NODE_EDITOR_SHORTCUTS` and optionally the helper so the runtime hook and UI share one source of truth.

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
     background: var(--nt-key-bg, #333);
     color: var(--nt-key-fg, #ddd);
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
