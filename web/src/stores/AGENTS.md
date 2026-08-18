# Stores Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Stores**

Also see: **[Zustand Best Practices](./ZUSTAND_BEST_PRACTICES.md)**

## Rules

- Each store must focus on a single domain (e.g., assets, nodes, UI panels).
- Define a TypeScript interface for all store state and actions.
- Use selectors to subscribe to only the needed state — avoid subscribing to entire stores.
- Use `shallow` equality for object selections to prevent unnecessary re-renders.
- Define actions within the store alongside state.
- Use `persist` middleware for settings that should survive page refreshes.
- Use the in-repo `temporal` middleware (`stores/temporal.ts`) for stores that need undo/redo.
- Keep state updates immutable. Use Immer middleware for complex nested updates.

## Patterns

```typescript
// ✅ Good — selective subscription
const nodes = useNodeStore(state => state.nodes);
const addNode = useNodeStore(state => state.addNode);

// ❌ Bad — subscribes to entire store, causes unnecessary re-renders
const store = useNodeStore();
```

```typescript
// ✅ Good — shallow equality for multi-value selection
const { selectedAssets, searchTerm } = useAssetGridStore(
  state => ({ selectedAssets: state.selectedAssets, searchTerm: state.searchTerm }),
  shallow
);
```

## Concurrent runs — state must be keyed by `jobId`

A single workflow can have **multiple runs in flight at once**. Every piece of
run-related state must be scoped to the `jobId` it belongs to, or concurrent
runs will clobber each other. These rules come straight from shipped bug fixes:

- **Return the id from whatever starts an async run — never re-read a global
  afterward.** `WorkflowRunner.run()` returns the `job_id` it actually started
  (it may queue a fresh job while `runnerStore.job_id` still points at the
  active one). Callers must use the returned id; reading `runnerStore.job_id`
  right after `run()` subscribes to the wrong job.
- **Capture a job's outputs/errors from the live message stream into a per-job
  `Map` keyed by `jobId`** — don't resolve a finished run's result by reading a
  workflow- or node-keyed shared store (`ResultsStore`/`ErrorStore`) at
  completion time. A sibling run will have overwritten that slot. Clean the map
  up on unsubscribe.
- **Guard every shared-slot reset/clear on ownership.** Before resetting
  per-workflow run state from a terminal `job_update`, check the slot still
  belongs to this job (`store.job_id === jobId`). A terminal event from one job
  must never reset another's state.
- **Don't clear shared state at workflow scope to "reset" one run.**
  `clearErrors(workflowId)` wipes every concurrent run's errors. Job-keyed state
  is already empty for a fresh `jobId`, so clear at the narrowest key (`jobId`)
  or not at all.
- **An async/background task that resolves later must not call a focus-grabbing,
  latest-run-wins action unconditionally.** `recordRun` auto-focuses the latest
  run; a background task that resolves after the user started or selected a run
  must guard before recording (`getRuns(workflowId)`), otherwise it steals focus
  from a live run.

## Keyboard

`KeyPressedStore` is the keyboard dispatcher. **Only the store listens on
`window`.** Components register what they want:

```typescript
useGlobalCombo("escape", closeDialog, { active: open, allowInInputs: true });
useCombo(["control", "s"], save);           // inside a KeyboardProvider
registerTypeToFocus(inputRef, (key) => setSearch(key));
```

- `useCombo` binds only inside a `KeyboardProvider` (the workflow editor
  surfaces). Everywhere else use `useGlobalCombo` — same dispatcher, same gate,
  no provider needed.
- **Every combo goes through one focus gate.** It is skipped while anything
  editable is focused, unless the registration passes `allowInInputs: true` (for
  keys that must work *inside* a field — Escape closing a modal, Cmd+S saving).
  Pass `target: () => ref.current` for a combo that acts on one element; the
  gate then also requires `canTakeFocus(target)`.
- **Every focus-moving handler passes `isTextInputActive` + `canTakeFocus`**
  (`utils/browser.ts`). `registerTypeToFocus` is that rule packaged: a printable
  key, no modifier, nothing editable focused, and the input can take focus.
- **Inactive workspace tabs stay mounted and are `inert`**
  (`components/workspace/WorkspaceShell.tsx`). A component must never assume it
  is the only mounted instance of itself — a Model Manager sitting in a
  background tab used to pull focus off every keystroke typed anywhere in the
  app. `canTakeFocus` returns false inside an `[inert]` subtree, which is what
  stops it.

`keyboard/no-window-key-listener` (`web/tools/oxlint/keyboard.ts`, wired through
`web/.oxlintrc.json`) flags `window`/`document` `keydown`/`keyup`/`keypress`
listeners. It ships as **warn**, not error, because nine files have not moved
yet — the count is the backlog, the way the root `AGENTS.md` tracks anti-slop
pairs. A listener bound to a specific DOM node (a canvas, a cell editor) is not
in scope and is not flagged.

| File | Why it has not moved |
|---|---|
| `components/timeline/Tracks/TracksRegion.tsx` | arrow-nudge batch closes on keyup |
| `components/content/Help/KeyboardShortcutsView.tsx` | visualizes physical keys; needs every key in capture phase |
| `components/sketch/useEditorKeyboardShortcuts.ts` | sketch action registry: capture phase, keyup, own suspend flag |
| `components/sketch/shortcuts/springLoadedModifiers.ts` | hold-to-engage modifier; needs keyup |
| `components/sketch/sketchCanvasHooks/useKeyboardModifiers.ts` | modifier-hold state on both edges |
| `components/sketch/tools/ShapeTool.ts` | reads Shift/Alt on both edges mid-drag |
| `components/sketch/SketchCanvasContextMenu.tsx` | capture + `stopPropagation` must swallow Escape before the editor |
| `components/sketch/TransformContextMenu.tsx` | same |
| `components/timeline/preview/ClipTransformContextMenu.tsx` | same |

The store dispatches combos on **keydown only**, which is what blocks six of
those nine. Giving `registerComboCallback` a keyup edge is the change that would
close most of this backlog.

## Testing

```bash
cd web
npm test -- --testPathPattern=stores  # Store tests only
```

- Place tests in `__tests__/` subdirectories.
- Test actions and derived state, not internal implementation.
- Mock API calls and external dependencies.
- **Regression-test run-state code with two concurrent same-workflow jobs**
  driven through the real reducer/handler (see `WorkflowRunner.test.ts`).
  Single-job tests miss every bug above.
